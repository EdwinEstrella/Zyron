-- ============================================================================
-- Zyron: Accounts Payable (CxP) MVP - M1: supplier classification, AP
-- withholding settings and control accounts.
--
-- Dominican Republic accounting decision: suppliers are classified for DGII
-- purposes (formal / informal / individual / foreign) because that
-- classification drives both the expected NCF type on a purchase bill and
-- the default ISR/ITBIS withholding percentages the buyer must apply. This
-- migration:
--
--   1. Adds scm_suppliers.classification (CHECK'd, existing rows default to
--      'formal').
--   2. Adds public.ap_withholding_settings: per-tenant, per-classification
--      default ISR%/ITBIS% withholding rates. This is a *new*, AP-specific
--      table, distinct from tenant_fiscal_settings' AR pct fields — it does
--      not reuse or alias those. RLS follows the (SELECT ...) InitPlan
--      -optimized style from 20260928000000_perf_and_policy_optimizations.sql:
--      any tenant member (or super admin) may read; only purchase_bills.manage
--      may write. Existing tenants are seeded once via
--      INSERT..SELECT..CROSS JOIN..ON CONFLICT DO NOTHING; future tenants are
--      seeded by a dedicated AFTER INSERT ON tenants trigger, kept separate
--      from zyron_seed_accounting_controls() below so the two concerns —
--      chart of accounts vs. withholding defaults — stay independently
--      replaceable. All four rate pairs are PLACEHOLDERS: the accountant
--      must confirm the exact percentages before this ships to a real
--      tenant.
--   3. Adds three control accounts: supplier_advances (1400, asset, debit),
--      isr_withholding_payable (2400, liability, credit) and
--      itbis_withholding_payable (2410, liability, credit). As with every
--      prior control-account migration (20260924000000, 20260927000000,
--      20261002000000), the control_key CHECK constraint is dropped and
--      recreated with the full set, and zyron_seed_accounting_controls() is
--      replaced wholesale — CREATE OR REPLACE fully replaces the function
--      body, so every account/control it already seeded is repeated here
--      verbatim, plus the three new ones.
--   4. Adds permission_catalog rows for suppliers.*, purchase_bills.* and
--      supplier_payments.*, and extends permission_satisfies() (carrying
--      forward its exact current body from
--      20260929000000_fine_grained_action_permissions.sql) with an umbrella
--      rule: scm.manage satisfies every suppliers./purchase_bills./
--      supplier_payments. key, and scm.view satisfies their .view key.
--   5. Adds the IMMUTABLE public.zyron_ap_ncf_valid(classification, ncf)
--      helper, used by zyron_post_purchase_bill (M2) to validate the NCF
--      type expected for a supplier's classification.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. scm_suppliers.classification
-- ----------------------------------------------------------------------------

ALTER TABLE public.scm_suppliers
  ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'formal';

ALTER TABLE public.scm_suppliers
  DROP CONSTRAINT IF EXISTS scm_suppliers_classification_check;

ALTER TABLE public.scm_suppliers
  ADD CONSTRAINT scm_suppliers_classification_check
  CHECK (classification IN ('formal', 'informal', 'individual', 'foreign'));

-- ----------------------------------------------------------------------------
-- 2. public.ap_withholding_settings
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ap_withholding_settings (
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  classification text NOT NULL CHECK (classification IN ('formal', 'informal', 'individual', 'foreign')),
  isr_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (isr_pct >= 0 AND isr_pct <= 100),
  itbis_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (itbis_pct >= 0 AND itbis_pct <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, classification)
);

ALTER TABLE public.ap_withholding_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ap_withholding_settings_read" ON public.ap_withholding_settings FOR SELECT TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

CREATE POLICY "ap_withholding_settings_insert" ON public.ap_withholding_settings FOR INSERT TO authenticated
WITH CHECK (
  ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
  AND public.check_user_permission(tenant_id, 'purchase_bills.manage')
);

CREATE POLICY "ap_withholding_settings_update" ON public.ap_withholding_settings FOR UPDATE TO authenticated
USING (
  ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
  AND public.check_user_permission(tenant_id, 'purchase_bills.manage')
)
WITH CHECK (
  ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
  AND public.check_user_permission(tenant_id, 'purchase_bills.manage')
);

-- Seed existing tenants with placeholder rates. PLACEHOLDER VALUES ONLY: the
-- accountant must confirm the real ISR/ITBIS withholding percentages per
-- classification before this ships to a real tenant.
INSERT INTO public.ap_withholding_settings (tenant_id, classification, isr_pct, itbis_pct)
SELECT t.id, s.classification, s.isr_pct, s.itbis_pct
FROM public.tenants t
CROSS JOIN (VALUES
  ('formal', 0, 0),
  ('informal', 10, 100),
  ('individual', 10, 100),
  ('foreign', 27, 100)
) AS s(classification, isr_pct, itbis_pct)
ON CONFLICT (tenant_id, classification) DO NOTHING;

-- Seed future tenants with the same placeholders via a dedicated trigger.
CREATE OR REPLACE FUNCTION public.zyron_seed_ap_withholding_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ap_withholding_settings (tenant_id, classification, isr_pct, itbis_pct)
  VALUES
    (NEW.id, 'formal', 0, 0),
    (NEW.id, 'informal', 10, 100),
    (NEW.id, 'individual', 10, 100),
    (NEW.id, 'foreign', 27, 100)
  ON CONFLICT (tenant_id, classification) DO NOTHING;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.zyron_seed_ap_withholding_settings() FROM PUBLIC;

DROP TRIGGER IF EXISTS tr_zyron_seed_ap_withholding_settings ON public.tenants;
CREATE TRIGGER tr_zyron_seed_ap_withholding_settings AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.zyron_seed_ap_withholding_settings();

-- ----------------------------------------------------------------------------
-- 3. Control accounts: supplier_advances, isr_withholding_payable,
--    itbis_withholding_payable.
-- ----------------------------------------------------------------------------

DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.accounting_control_accounts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%control_key%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.accounting_control_accounts DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.accounting_control_accounts
  ADD CONSTRAINT accounting_control_accounts_control_key_check
  CHECK (control_key IN (
    'cash_bank', 'accounts_receivable', 'inventory', 'sales_revenue', 'sales_tax_payable',
    'cost_of_sales', 'inventory_adjustment_gain', 'inventory_adjustment_loss',
    'accounts_payable', 'purchase_tax_credit', 'gr_ir_clearing', 'purchase_expense',
    'customer_advances', 'supplier_advances', 'isr_withholding_payable', 'itbis_withholding_payable'
  ));

-- Seed the accounts + controls for existing tenants.
INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, normal_balance, is_system, metadata)
SELECT t.id, s.code, s.name, s.account_type, s.normal_balance, true, jsonb_build_object('control_key', s.control_key)
FROM public.tenants t
CROSS JOIN (VALUES
  ('1400', 'Anticipos a proveedores', 'asset', 'debit', 'supplier_advances'),
  ('2400', 'ISR retenido por pagar', 'liability', 'credit', 'isr_withholding_payable'),
  ('2410', 'ITBIS retenido por pagar', 'liability', 'credit', 'itbis_withholding_payable')
) AS s(code, name, account_type, normal_balance, control_key)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_control_accounts (tenant_id, control_key, account_id)
SELECT t.id, s.control_key, a.id
FROM public.tenants t
CROSS JOIN (VALUES
  ('supplier_advances', '1400', 'asset'),
  ('isr_withholding_payable', '2400', 'liability'),
  ('itbis_withholding_payable', '2410', 'liability')
) AS s(control_key, code, account_type)
JOIN public.accounting_accounts a ON a.tenant_id = t.id AND a.code = s.code AND a.account_type = s.account_type
ON CONFLICT (tenant_id, control_key) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();

-- Extend the new-tenant seed trigger, carrying forward every account it
-- already seeded (per 20260924000000_accounting_overhaul.sql,
-- 20260927000000_purchases_accounting_integration.sql and
-- 20261002000000_payment_posting_allocation_fix.sql), plus the three new
-- ones. CREATE OR REPLACE fully replaces the function body, so omitting an
-- existing line here would silently stop seeding it for future tenants.
CREATE OR REPLACE FUNCTION public.zyron_seed_accounting_controls()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, normal_balance, is_system)
  VALUES
    (NEW.id, '1010', 'Efectivo y bancos', 'asset', 'debit', true),
    (NEW.id, '1100', 'Cuentas por cobrar comerciales', 'asset', 'debit', true),
    (NEW.id, '1150', 'ITBIS pagado por adelantado', 'asset', 'debit', true),
    (NEW.id, '1300', 'Inventarios', 'asset', 'debit', true),
    (NEW.id, '1400', 'Anticipos a proveedores', 'asset', 'debit', true),
    (NEW.id, '2100', 'Impuestos por pagar', 'liability', 'credit', true),
    (NEW.id, '2150', 'Mercancía recibida no facturada', 'liability', 'credit', true),
    (NEW.id, '2200', 'Cuentas por pagar comerciales', 'liability', 'credit', true),
    (NEW.id, '2300', 'Anticipos de clientes', 'liability', 'credit', true),
    (NEW.id, '2400', 'ISR retenido por pagar', 'liability', 'credit', true),
    (NEW.id, '2410', 'ITBIS retenido por pagar', 'liability', 'credit', true),
    (NEW.id, '4100', 'Ingresos por ventas', 'revenue', 'credit', true),
    (NEW.id, '4200', 'Ganancias por ajustes de inventario', 'revenue', 'credit', true),
    (NEW.id, '5100', 'Costo de ventas', 'expense', 'debit', true),
    (NEW.id, '5200', 'Compras y gastos operativos', 'expense', 'debit', true),
    (NEW.id, '5300', 'Pérdidas por ajustes de inventario', 'expense', 'debit', true)
  ON CONFLICT (tenant_id, code) DO NOTHING;
  INSERT INTO public.accounting_control_accounts (tenant_id, control_key, account_id)
  SELECT NEW.id, s.control_key, a.id
  FROM (VALUES
    ('cash_bank', '1010'), ('accounts_receivable', '1100'), ('purchase_tax_credit', '1150'),
    ('inventory', '1300'), ('supplier_advances', '1400'), ('sales_tax_payable', '2100'),
    ('gr_ir_clearing', '2150'), ('accounts_payable', '2200'), ('customer_advances', '2300'),
    ('isr_withholding_payable', '2400'), ('itbis_withholding_payable', '2410'),
    ('sales_revenue', '4100'), ('inventory_adjustment_gain', '4200'), ('cost_of_sales', '5100'),
    ('purchase_expense', '5200'), ('inventory_adjustment_loss', '5300')
  ) s(control_key, code)
  JOIN public.accounting_accounts a ON a.tenant_id = NEW.id AND a.code = s.code
  ON CONFLICT (tenant_id, control_key) DO NOTHING;
  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Permissions: suppliers.*, purchase_bills.*, supplier_payments.*, plus
--    the scm.manage/scm.view umbrella over them.
-- ----------------------------------------------------------------------------

INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES
  ('suppliers.view', 'Ver proveedores', 'Permite consultar la lista de proveedores.'),
  ('suppliers.create', 'Crear proveedores', 'Permite registrar proveedores nuevos.'),
  ('suppliers.edit', 'Editar proveedores', 'Permite editar los datos de un proveedor existente.'),
  ('suppliers.void', 'Anular proveedores', 'Permite activar o desactivar un proveedor.'),
  ('suppliers.manage', 'Gestionar proveedores', 'Permite crear, editar y anular proveedores.'),
  ('purchase_bills.view', 'Ver facturas de proveedores', 'Permite consultar facturas de compra a proveedores.'),
  ('purchase_bills.create', 'Crear facturas de proveedores', 'Permite crear facturas de compra en borrador.'),
  ('purchase_bills.authorize', 'Autorizar facturas de proveedores', 'Permite emitir una factura de compra desde el estado borrador.'),
  ('purchase_bills.manage', 'Gestionar facturas de proveedores', 'Permite crear, autorizar y configurar retenciones de facturas de compra.'),
  ('supplier_payments.view', 'Ver pagos a proveedores', 'Permite consultar los pagos realizados a proveedores.'),
  ('supplier_payments.create', 'Registrar pagos a proveedores', 'Permite registrar un pago a un proveedor y aplicarlo a facturas.'),
  ('supplier_payments.manage', 'Gestionar pagos a proveedores', 'Permite registrar y administrar pagos a proveedores.')
ON CONFLICT (permission_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description;

-- Extend the .manage cascade additively (carrying forward the exact body
-- from 20260929000000_fine_grained_action_permissions.sql): it already
-- satisfies its own .view plus the six fine-grained verbs. It now also
-- satisfies the scm.manage/scm.view umbrella over suppliers.*,
-- purchase_bills.* and supplier_payments.*, and nothing else.
CREATE OR REPLACE FUNCTION public.permission_satisfies(granted_key text, requested_key text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  RETURN granted_key IS NOT NULL AND requested_key IS NOT NULL AND (
    granted_key = requested_key OR
    (right(granted_key, 7) = '.manage' AND requested_key = regexp_replace(granted_key, '\.manage$', '.view')) OR
    (right(granted_key, 7) = '.delete' AND requested_key IN (regexp_replace(granted_key, '\.delete$', '.manage'), regexp_replace(granted_key, '\.delete$', '.view'))) OR
    (right(granted_key, 5) = '.edit' AND requested_key = regexp_replace(granted_key, '\.edit$', '.view')) OR
    (right(granted_key, 7) = '.manage' AND requested_key IN (
      regexp_replace(granted_key, '\.manage$', '.create'),
      regexp_replace(granted_key, '\.manage$', '.edit'),
      regexp_replace(granted_key, '\.manage$', '.void'),
      regexp_replace(granted_key, '\.manage$', '.print'),
      regexp_replace(granted_key, '\.manage$', '.authorize'),
      regexp_replace(granted_key, '\.manage$', '.process')
    )) OR
    (granted_key = 'scm.manage' AND (
      requested_key LIKE 'suppliers.%' OR
      requested_key LIKE 'purchase_bills.%' OR
      requested_key LIKE 'supplier_payments.%'
    )) OR
    (granted_key = 'scm.view' AND requested_key IN ('suppliers.view', 'purchase_bills.view', 'supplier_payments.view'))
  );
END $$;

GRANT EXECUTE ON FUNCTION public.permission_satisfies(text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. NCF validity per classification (formal / informal / individual /
--    foreign). B-series NCFs are 11 chars (letter + 2-digit type + 8-digit
--    sequence); E-series (e-CF) NCFs are 13 chars (letter + 2-digit type +
--    10-digit sequence).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.zyron_ap_ncf_valid(p_classification text, p_ncf text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_classification = 'formal' THEN
      p_ncf IS NOT NULL AND upper(btrim(p_ncf)) ~ '^(B(01|14|15)[0-9]{8}|E(31|44|45)[0-9]{10})$'
    WHEN p_classification IN ('informal', 'individual') THEN
      p_ncf IS NOT NULL AND upper(btrim(p_ncf)) ~ '^(B11[0-9]{8}|E41[0-9]{10})$'
    WHEN p_classification = 'foreign' THEN
      p_ncf IS NULL OR btrim(p_ncf) = '' OR upper(btrim(p_ncf)) ~ '^(B(13|17)[0-9]{8}|E47[0-9]{10})$'
    ELSE false
  END
$$;

GRANT EXECUTE ON FUNCTION public.zyron_ap_ncf_valid(text, text) TO authenticated;
