-- Fundamento del libro mayor de contabilidad para Zyron.
-- Migración aditiva: catálogo de cuentas, diarios, reglas de contabilización, enlaces de reversión,
-- RLS con alcance de inquilino y protectores de balance diferidos.

INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES
  ('accounting.ledger.view', 'Ver contabilidad', 'Permite ver catalogo contable, asientos y lineas del libro mayor.'),
  ('accounting.ledger.manage', 'Gestionar contabilidad', 'Permite crear, contabilizar y reversar asientos contables.')
ON CONFLICT (permission_key) DO UPDATE
SET label = excluded.label,
    description = excluded.description;

CREATE TABLE IF NOT EXISTS public.accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  parent_account_id uuid REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_accounts_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT accounting_accounts_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT accounting_accounts_tenant_code_key UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.accounting_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_number text,
  entry_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  source_type text,
  source_id uuid,
  source_label text,
  memo text,
  currency text NOT NULL DEFAULT 'DOP',
  reversal_of_entry_id uuid REFERENCES public.accounting_journal_entries(id) ON DELETE RESTRICT,
  posted_at timestamptz,
  created_by uuid REFERENCES public.tenant_users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_journal_entries_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT accounting_journal_entries_tenant_number_key UNIQUE (tenant_id, entry_number)
);

CREATE TABLE IF NOT EXISTS public.accounting_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES public.accounting_journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  line_no integer NOT NULL,
  description text,
  debit_amount numeric(18, 2) NOT NULL DEFAULT 0,
  credit_amount numeric(18, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'DOP',
  source_line_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_journal_lines_amounts_nonnegative CHECK (debit_amount >= 0 AND credit_amount >= 0),
  CONSTRAINT accounting_journal_lines_one_sided CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0)
  ),
  CONSTRAINT accounting_journal_lines_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT accounting_journal_lines_line_no_positive CHECK (line_no > 0),
  CONSTRAINT accounting_journal_lines_entry_line_key UNIQUE (journal_entry_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.accounting_posting_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  event_type text NOT NULL,
  debit_account_code text NOT NULL,
  credit_account_code text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_posting_rules_tenant_event_key UNIQUE (tenant_id, source_type, event_type)
);

CREATE INDEX IF NOT EXISTS idx_accounting_accounts_tenant_type ON public.accounting_accounts (tenant_id, account_type, is_active);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_entries_tenant_date ON public.accounting_journal_entries (tenant_id, entry_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_entries_source ON public.accounting_journal_entries (tenant_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_lines_entry ON public.accounting_journal_lines (journal_entry_id, line_no);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_lines_account ON public.accounting_journal_lines (tenant_id, account_id);

CREATE OR REPLACE FUNCTION public.zyron_accounting_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_accounting_accounts_touch_updated_at ON public.accounting_accounts;
CREATE TRIGGER tr_accounting_accounts_touch_updated_at
BEFORE UPDATE ON public.accounting_accounts
FOR EACH ROW EXECUTE FUNCTION public.zyron_accounting_touch_updated_at();

DROP TRIGGER IF EXISTS tr_accounting_journal_entries_touch_updated_at ON public.accounting_journal_entries;
CREATE TRIGGER tr_accounting_journal_entries_touch_updated_at
BEFORE UPDATE ON public.accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.zyron_accounting_touch_updated_at();

DROP TRIGGER IF EXISTS tr_accounting_posting_rules_touch_updated_at ON public.accounting_posting_rules;
CREATE TRIGGER tr_accounting_posting_rules_touch_updated_at
BEFORE UPDATE ON public.accounting_posting_rules
FOR EACH ROW EXECUTE FUNCTION public.zyron_accounting_touch_updated_at();

CREATE OR REPLACE FUNCTION public.zyron_next_journal_entry_number(p_tenant_id uuid, p_entry_date date DEFAULT current_date)
RETURNS text AS $$
DECLARE
  v_year text := to_char(coalesce(p_entry_date, current_date), 'YYYY');
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('zyron-journal-entry-number'), hashtext(p_tenant_id::text || ':' || v_year));

  SELECT coalesce(max(substring(entry_number from 'JE-' || v_year || '-([0-9]+)')::integer), 0) + 1
  INTO v_next
  FROM public.accounting_journal_entries
  WHERE tenant_id = p_tenant_id
    AND entry_number LIKE 'JE-' || v_year || '-%';

  RETURN 'JE-' || v_year || '-' || lpad(v_next::text, 6, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION public.zyron_prepare_journal_entry()
RETURNS trigger AS $$
BEGIN
  IF NEW.entry_number IS NULL OR btrim(NEW.entry_number) = '' THEN
    NEW.entry_number := public.zyron_next_journal_entry_number(NEW.tenant_id, NEW.entry_date);
  END IF;

  IF NEW.status IN ('posted', 'reversed') AND NEW.posted_at IS NULL THEN
    NEW.posted_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS tr_accounting_prepare_journal_entry ON public.accounting_journal_entries;
CREATE TRIGGER tr_accounting_prepare_journal_entry
BEFORE INSERT OR UPDATE ON public.accounting_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.zyron_prepare_journal_entry();

CREATE OR REPLACE FUNCTION public.zyron_validate_journal_line_tenant()
RETURNS trigger AS $$
DECLARE
  v_entry_tenant uuid;
  v_account_tenant uuid;
  v_entry_currency text;
BEGIN
  SELECT tenant_id, currency INTO v_entry_tenant, v_entry_currency
  FROM public.accounting_journal_entries
  WHERE id = NEW.journal_entry_id;

  SELECT tenant_id INTO v_account_tenant
  FROM public.accounting_accounts
  WHERE id = NEW.account_id;

  IF v_entry_tenant IS NULL OR v_account_tenant IS NULL THEN
    RAISE EXCEPTION 'El asiento de diario y la cuenta son obligatorios para la línea contable.';
  END IF;

  IF NEW.tenant_id <> v_entry_tenant OR NEW.tenant_id <> v_account_tenant THEN
    RAISE EXCEPTION 'El inquilino de la línea de diario debe coincidir con su asiento y cuenta.';
  END IF;

  IF NEW.currency <> v_entry_currency THEN
    RAISE EXCEPTION 'La divisa de la línea de diario debe coincidir con la divisa del asiento de diario.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS tr_accounting_validate_journal_line_tenant ON public.accounting_journal_lines;
CREATE TRIGGER tr_accounting_validate_journal_line_tenant
BEFORE INSERT OR UPDATE ON public.accounting_journal_lines
FOR EACH ROW EXECUTE FUNCTION public.zyron_validate_journal_line_tenant();

CREATE OR REPLACE FUNCTION public.zyron_journal_entry_totals(p_journal_entry_id uuid)
RETURNS TABLE(total_debit numeric, total_credit numeric, line_count bigint) AS $$
  SELECT
    coalesce(sum(debit_amount), 0)::numeric(18, 2) AS total_debit,
    coalesce(sum(credit_amount), 0)::numeric(18, 2) AS total_credit,
    count(*) AS line_count
  FROM public.accounting_journal_lines
  WHERE journal_entry_id = p_journal_entry_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION public.zyron_assert_journal_entry_balanced(p_journal_entry_id uuid)
RETURNS void AS $$
DECLARE
  v_status text;
  v_totals record;
BEGIN
  SELECT status INTO v_status
  FROM public.accounting_journal_entries
  WHERE id = p_journal_entry_id;

  IF v_status IS DISTINCT FROM 'posted' THEN
    RETURN;
  END IF;

  SELECT * INTO v_totals
  FROM public.zyron_journal_entry_totals(p_journal_entry_id);

  IF coalesce(v_totals.line_count, 0) < 2 THEN
    RAISE EXCEPTION 'El asiento contable publicado % requiere al menos dos líneas.', p_journal_entry_id;
  END IF;

  IF coalesce(v_totals.total_debit, 0) <> coalesce(v_totals.total_credit, 0) THEN
    RAISE EXCEPTION 'El asiento contable publicado % no está balanceado: débito %, crédito %.', p_journal_entry_id, v_totals.total_debit, v_totals.total_credit;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE OR REPLACE FUNCTION public.zyron_assert_journal_line_balance_trigger()
RETURNS trigger AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  v_entry_id := coalesce(NEW.journal_entry_id, OLD.journal_entry_id);
  PERFORM public.zyron_assert_journal_entry_balanced(v_entry_id);
  RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS tr_accounting_lines_assert_balance ON public.accounting_journal_lines;
CREATE CONSTRAINT TRIGGER tr_accounting_lines_assert_balance
AFTER INSERT OR UPDATE OR DELETE ON public.accounting_journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.zyron_assert_journal_line_balance_trigger();

CREATE OR REPLACE FUNCTION public.zyron_assert_journal_entry_balance_trigger()
RETURNS trigger AS $$
BEGIN
  PERFORM public.zyron_assert_journal_entry_balanced(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS tr_accounting_entries_assert_balance ON public.accounting_journal_entries;
CREATE CONSTRAINT TRIGGER tr_accounting_entries_assert_balance
AFTER INSERT OR UPDATE OF status ON public.accounting_journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.zyron_assert_journal_entry_balance_trigger();

-- RLS (Row Level Security) Configuration

ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_posting_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_admin_policy" ON public.accounting_accounts;
CREATE POLICY "project_admin_policy" ON public.accounting_accounts FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.accounting_journal_entries;
CREATE POLICY "project_admin_policy" ON public.accounting_journal_entries FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.accounting_journal_lines;
CREATE POLICY "project_admin_policy" ON public.accounting_journal_lines FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.accounting_posting_rules;
CREATE POLICY "project_admin_policy" ON public.accounting_posting_rules FOR ALL TO project_admin USING (true) WITH CHECK (true);

-- Políticas multi-inquilino de Zyron basadas en tenant_users

-- 1. accounting_accounts
DROP POLICY IF EXISTS "tenant_accounting_accounts_read" ON public.accounting_accounts;
CREATE POLICY "tenant_accounting_accounts_read" ON public.accounting_accounts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_accounts.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ));

DROP POLICY IF EXISTS "tenant_accounting_accounts_write" ON public.accounting_accounts;
CREATE POLICY "tenant_accounting_accounts_write" ON public.accounting_accounts
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_accounts.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_accounts.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ));

-- 2. accounting_journal_entries
DROP POLICY IF EXISTS "tenant_accounting_journal_entries_read" ON public.accounting_journal_entries;
CREATE POLICY "tenant_accounting_journal_entries_read" ON public.accounting_journal_entries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_journal_entries.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ));

DROP POLICY IF EXISTS "tenant_accounting_journal_entries_write" ON public.accounting_journal_entries;
CREATE POLICY "tenant_accounting_journal_entries_write" ON public.accounting_journal_entries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_journal_entries.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_journal_entries.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ));

-- 3. accounting_journal_lines
DROP POLICY IF EXISTS "tenant_accounting_journal_lines_read" ON public.accounting_journal_lines;
CREATE POLICY "tenant_accounting_journal_lines_read" ON public.accounting_journal_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_journal_lines.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ));

DROP POLICY IF EXISTS "tenant_accounting_journal_lines_write" ON public.accounting_journal_lines;
CREATE POLICY "tenant_accounting_journal_lines_write" ON public.accounting_journal_lines
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_journal_lines.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_journal_lines.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ));

-- 4. accounting_posting_rules
DROP POLICY IF EXISTS "tenant_accounting_posting_rules_read" ON public.accounting_posting_rules;
CREATE POLICY "tenant_accounting_posting_rules_read" ON public.accounting_posting_rules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_posting_rules.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ));

DROP POLICY IF EXISTS "tenant_accounting_posting_rules_write" ON public.accounting_posting_rules;
CREATE POLICY "tenant_accounting_posting_rules_write" ON public.accounting_posting_rules
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_posting_rules.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = accounting_posting_rules.tenant_id
      AND tu.activo IS TRUE
      AND (tu.auth_user_id = public.cloudix_auth_user_id() OR (tu.auth_user_id IS NULL AND lower(tu.email) = lower(public.cloudix_auth_email())))
  ));

-- Semillas predeterminadas

INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, normal_balance, is_system, metadata)
SELECT t.id, seed.code, seed.name, seed.account_type, seed.normal_balance, true, seed.metadata
FROM public.tenants t
CROSS JOIN (VALUES
  ('1010', 'Efectivo y equivalentes de efectivo', 'asset', 'debit', '{"category":"cash"}'::jsonb),
  ('1100', 'Cuentas por cobrar comerciales', 'asset', 'debit', '{"category":"receivables"}'::jsonb),
  ('1300', 'Inventarios', 'asset', 'debit', '{"category":"inventory"}'::jsonb),
  ('2100', 'Impuestos por pagar', 'liability', 'credit', '{"category":"tax"}'::jsonb),
  ('2200', 'Cuentas por pagar comerciales', 'liability', 'credit', '{"category":"payables"}'::jsonb),
  ('3100', 'Capital social', 'equity', 'credit', '{"category":"equity"}'::jsonb),
  ('4100', 'Ingresos por ventas', 'revenue', 'credit', '{"category":"sales"}'::jsonb),
  ('5100', 'Costo de ventas', 'expense', 'debit', '{"category":"cogs"}'::jsonb),
  ('5200', 'Gastos operativos', 'expense', 'debit', '{"category":"opex"}'::jsonb)
) AS seed(code, name, account_type, normal_balance, metadata)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_posting_rules (tenant_id, source_type, event_type, debit_account_code, credit_account_code, description, metadata)
SELECT t.id, seed.source_type, seed.event_type, seed.debit_code, seed.credit_code, seed.description, seed.metadata
FROM public.tenants t
CROSS JOIN (VALUES
  ('invoice', 'issued_receivable', '1100', '4100', 'Factura emitida: débito a cuentas por cobrar comerciales y crédito a ingresos por ventas.', '{"requires_tax_split":true}'::jsonb),
  ('invoice', 'tax_payable', '1100', '2100', 'Componente de impuestos de factura: débito a cuentas por cobrar comerciales y crédito a impuestos por pagar.', '{"applies_when_tax_amount_positive":true}'::jsonb),
  ('payment', 'received', '1010', '1100', 'Pago recibido: débito a efectivo y equivalentes y crédito a cuentas por cobrar comerciales.', '{}'::jsonb),
  ('inventory', 'cogs', '5100', '1300', 'Costo de venta de inventario: débito a costo de ventas y crédito a inventarios.', '{}'::jsonb),
  ('reversal', 'reverse_entry', '9999', '9999', 'Los asientos de reversión copian las líneas originales con el débito y el crédito invertidos.', '{"uses_original_accounts":true}'::jsonb)
) AS seed(source_type, event_type, debit_code, credit_code, description, metadata)
ON CONFLICT (tenant_id, source_type, event_type) DO UPDATE
SET debit_account_code = excluded.debit_account_code,
    credit_account_code = excluded.credit_account_code,
    description = excluded.description,
    metadata = excluded.metadata,
    is_active = true,
    updated_at = now();
