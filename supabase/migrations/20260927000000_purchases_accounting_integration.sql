-- ============================================================================
-- Zyron: Purchasing accounting & inventory integration.
-- Full flow: Purchase Order -> Goods Receipt -> Purchase Bill (Accounts Payable).
--
-- Additive. Depends on:
--   * 20260924000000_accounting_overhaul.sql  (zyron_post_accounting_entry, controls)
--   * 20260926000000_enterprise_latam_modules.sql (scm_* base tables)
--
-- Double-entry per step:
--   Receipt : Dr Inventory                         Cr GR/IR clearing        (+ kardex in)
--   Bill    : Dr GR/IR clearing + Dr ITBIS credit  Cr Accounts payable
--   Bill    : Dr Purchase expense (service lines)  Cr Accounts payable
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New control accounts for purchasing.
-- ----------------------------------------------------------------------------

-- Expand the control_key CHECK constraint (its name is auto-generated, so drop it dynamically).
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
    'accounts_payable', 'purchase_tax_credit', 'gr_ir_clearing', 'purchase_expense'
  ));

-- Seed the purchasing accounts + controls for existing tenants.
INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, normal_balance, is_system, metadata)
SELECT t.id, s.code, s.name, s.account_type, s.normal_balance, true, jsonb_build_object('control_key', s.control_key)
FROM public.tenants t
CROSS JOIN (VALUES
  ('2200', 'Cuentas por pagar comerciales', 'liability', 'credit', 'accounts_payable'),
  ('1150', 'ITBIS pagado por adelantado', 'asset', 'debit', 'purchase_tax_credit'),
  ('2150', 'Mercancía recibida no facturada', 'liability', 'credit', 'gr_ir_clearing'),
  ('5200', 'Compras y gastos operativos', 'expense', 'debit', 'purchase_expense')
) AS s(code, name, account_type, normal_balance, control_key)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_control_accounts (tenant_id, control_key, account_id)
SELECT t.id, s.control_key, a.id
FROM public.tenants t
CROSS JOIN (VALUES
  ('accounts_payable', '2200'), ('purchase_tax_credit', '1150'),
  ('gr_ir_clearing', '2150'), ('purchase_expense', '5200')
) AS s(control_key, code)
JOIN public.accounting_accounts a ON a.tenant_id = t.id AND a.code = s.code
ON CONFLICT (tenant_id, control_key) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();

-- Extend the new-tenant seed trigger so future tenants also get the purchasing accounts.
CREATE OR REPLACE FUNCTION public.zyron_seed_accounting_controls()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, normal_balance, is_system)
  VALUES
    (NEW.id, '1010', 'Efectivo y bancos', 'asset', 'debit', true),
    (NEW.id, '1100', 'Cuentas por cobrar comerciales', 'asset', 'debit', true),
    (NEW.id, '1150', 'ITBIS pagado por adelantado', 'asset', 'debit', true),
    (NEW.id, '1300', 'Inventarios', 'asset', 'debit', true),
    (NEW.id, '2100', 'Impuestos por pagar', 'liability', 'credit', true),
    (NEW.id, '2150', 'Mercancía recibida no facturada', 'liability', 'credit', true),
    (NEW.id, '2200', 'Cuentas por pagar comerciales', 'liability', 'credit', true),
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
    ('inventory', '1300'), ('sales_tax_payable', '2100'), ('gr_ir_clearing', '2150'),
    ('accounts_payable', '2200'), ('sales_revenue', '4100'), ('inventory_adjustment_gain', '4200'),
    ('cost_of_sales', '5100'), ('purchase_expense', '5200'), ('inventory_adjustment_loss', '5300')
  ) s(control_key, code)
  JOIN public.accounting_accounts a ON a.tenant_id = NEW.id AND a.code = s.code
  ON CONFLICT (tenant_id, control_key) DO NOTHING;
  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Missing documents in the purchasing chain.
-- ----------------------------------------------------------------------------

-- Line items for a goods receipt (the base migration only had the receipt header).
CREATE TABLE IF NOT EXISTS public.scm_goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.scm_goods_receipts (id) ON DELETE CASCADE,
  po_item_id uuid REFERENCES public.scm_purchase_order_items (id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity numeric(14, 4) NOT NULL DEFAULT 0,
  unit_cost numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scm_goods_receipt_items_tenant_receipt_idx
  ON public.scm_goods_receipt_items (tenant_id, receipt_id);

-- Track that a receipt was already posted (accounting + kardex) to keep it idempotent.
ALTER TABLE public.scm_goods_receipts ADD COLUMN IF NOT EXISTS posted_at timestamptz;

-- Supplier bill = the document that creates the Accounts Payable.
CREATE TABLE IF NOT EXISTS public.scm_purchase_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  bill_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.scm_suppliers (id) ON DELETE RESTRICT,
  purchase_order_id uuid REFERENCES public.scm_purchase_orders (id) ON DELETE SET NULL,
  goods_receipt_id uuid REFERENCES public.scm_goods_receipts (id) ON DELETE SET NULL,
  supplier_ncf text,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text NOT NULL DEFAULT 'DOP',
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  tax_total numeric(14, 2) NOT NULL DEFAULT 0,
  total numeric(14, 2) NOT NULL DEFAULT 0,
  amount_paid numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  posted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bill_number)
);
CREATE INDEX IF NOT EXISTS scm_purchase_bills_tenant_status_idx
  ON public.scm_purchase_bills (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.scm_purchase_bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES public.scm_purchase_bills (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(14, 2) NOT NULL DEFAULT 1,
  unit_cost numeric(14, 2) NOT NULL DEFAULT 0,
  discount numeric(7, 3) NOT NULL DEFAULT 0,
  tax_rate numeric(7, 3) NOT NULL DEFAULT 0,
  line_total numeric(14, 2) NOT NULL DEFAULT 0,
  line_kind text NOT NULL DEFAULT 'product',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scm_purchase_bill_items_tenant_bill_idx
  ON public.scm_purchase_bill_items (tenant_id, bill_id);

-- Per-tenant document numbering for the purchasing chain.
CREATE TABLE IF NOT EXISTS public.scm_document_sequences (
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, doc_type)
);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security for the new tables (tenant isolation, matches scm_*).
-- ----------------------------------------------------------------------------

ALTER TABLE public.scm_goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scm_purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scm_purchase_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scm_document_sequences ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
  tbls text[] := ARRAY['scm_goods_receipt_items', 'scm_purchase_bills', 'scm_purchase_bill_items', 'scm_document_sequences'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.%I', t);
    EXECUTE format('CREATE POLICY "tenant_isolation_policy" ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants())) WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Helpers.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.zyron_purchasing_allowed(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage')
      OR public.check_user_permission(p_tenant_id, 'scm.manage')
$$;

CREATE OR REPLACE FUNCTION public.zyron_next_scm_number(p_tenant_id uuid, p_doc_type text, p_prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.scm_document_sequences (tenant_id, doc_type, next_number)
  VALUES (p_tenant_id, p_doc_type, 2)
  ON CONFLICT (tenant_id, doc_type) DO UPDATE SET next_number = public.scm_document_sequences.next_number + 1
  RETURNING next_number - 1 INTO v_n;
  RETURN p_prefix || '-' || lpad(v_n::text, 6, '0');
END $$;

-- ----------------------------------------------------------------------------
-- 5. Posting RPCs.
-- ----------------------------------------------------------------------------

-- 5a. Goods receipt: move stock into the kardex and post Dr Inventory / Cr GR-IR.
CREATE OR REPLACE FUNCTION public.zyron_post_goods_receipt(p_tenant_id uuid, p_receipt_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receipt public.scm_goods_receipts%ROWTYPE;
  v_line record;
  v_product public.products%ROWTYPE;
  v_cost numeric;
  v_value numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_entry uuid;
BEGIN
  IF NOT public.zyron_purchasing_allowed(p_tenant_id) THEN
    RAISE EXCEPTION 'No tiene permiso para registrar recepciones.';
  END IF;
  SELECT * INTO v_receipt FROM public.scm_goods_receipts WHERE id = p_receipt_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recepción no encontrada.'; END IF;
  IF v_receipt.posted_at IS NOT NULL THEN
    SELECT je.id INTO v_entry FROM public.accounting_journal_entries je
    JOIN public.accounting_source_events se ON se.id = je.source_event_id
    WHERE se.tenant_id = p_tenant_id AND se.source_type = 'goods_receipt' AND se.source_id = p_receipt_id;
    RETURN v_entry;
  END IF;

  FOR v_line IN SELECT * FROM public.scm_goods_receipt_items WHERE receipt_id = p_receipt_id AND tenant_id = p_tenant_id LOOP
    IF v_line.quantity <= 0 THEN CONTINUE; END IF;
    SELECT * INTO v_product FROM public.products WHERE id = v_line.product_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND OR NOT v_product.tracks_stock OR v_product.item_kind = 'service' THEN CONTINUE; END IF;
    v_cost := COALESCE(NULLIF(v_line.unit_cost, 0), v_product.cost_price, 0);
    -- Weighted-average cost update on inbound stock.
    IF v_product.stock + v_line.quantity > 0 THEN
      UPDATE public.products
      SET cost_price = ((stock * COALESCE(cost_price, 0)) + (v_line.quantity * v_cost)) / (stock + v_line.quantity),
          stock = stock + v_line.quantity
      WHERE id = v_product.id;
    ELSE
      UPDATE public.products SET stock = stock + v_line.quantity WHERE id = v_product.id;
    END IF;
    INSERT INTO public.warehouse_stock (tenant_id, warehouse_id, product_id, quantity)
    VALUES (p_tenant_id, v_receipt.warehouse_id, v_product.id, v_line.quantity)
    ON CONFLICT (warehouse_id, product_id) DO UPDATE
      SET quantity = public.warehouse_stock.quantity + EXCLUDED.quantity, updated_at = now();
    INSERT INTO public.inventory_kardex (tenant_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes)
    VALUES (p_tenant_id, v_product.id, v_receipt.warehouse_id, 'purchase_receipt', v_line.quantity, v_cost, 'goods_receipt', p_receipt_id, 'Entrada por recepción ' || v_receipt.receipt_number);
    v_value := v_value + round(v_line.quantity * v_cost, 2);
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.zyron_resolve_product_account(p_tenant_id, v_product.id, 'inventory'),
      'debit', round(v_line.quantity * v_cost, 2), 'credit', 0,
      'source_line_id', v_line.id
    ));
  END LOOP;

  IF v_value > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.zyron_accounting_control(p_tenant_id, 'gr_ir_clearing'),
      'debit', 0, 'credit', v_value
    ));
    v_entry := public.zyron_post_accounting_entry(
      p_tenant_id, 'goods_receipt', p_receipt_id, 'goods_receipt.received', current_date, 'DOP',
      'Recepción de mercancía ' || v_receipt.receipt_number, v_lines
    );
  END IF;

  UPDATE public.scm_goods_receipts SET posted_at = now(), status = 'completada' WHERE id = p_receipt_id;
  RETURN v_entry;
END $$;

-- 5b. Purchase bill: post Dr GR-IR / Dr Purchase-expense + Dr ITBIS credit  /  Cr Accounts payable.
CREATE OR REPLACE FUNCTION public.zyron_post_purchase_bill(p_tenant_id uuid, p_bill_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill public.scm_purchase_bills%ROWTYPE;
  v_line record;
  v_net numeric;
  v_lines jsonb := '[]'::jsonb;
  v_entry uuid;
BEGIN
  IF NOT public.zyron_purchasing_allowed(p_tenant_id) THEN
    RAISE EXCEPTION 'No tiene permiso para contabilizar compras.';
  END IF;
  SELECT * INTO v_bill FROM public.scm_purchase_bills WHERE id = p_bill_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura de compra no encontrada.'; END IF;
  IF v_bill.status <> 'draft' THEN
    SELECT je.id INTO v_entry FROM public.accounting_journal_entries je
    JOIN public.accounting_source_events se ON se.id = je.source_event_id
    WHERE se.tenant_id = p_tenant_id AND se.source_type = 'purchase_bill' AND se.source_id = p_bill_id;
    RETURN v_entry;
  END IF;

  FOR v_line IN SELECT * FROM public.scm_purchase_bill_items WHERE bill_id = p_bill_id AND tenant_id = p_tenant_id LOOP
    v_net := round(v_line.quantity * v_line.unit_cost * (1 - COALESCE(v_line.discount, 0) / 100), 2);
    IF v_net = 0 THEN CONTINUE; END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', CASE
        WHEN v_line.line_kind = 'product' AND v_bill.goods_receipt_id IS NOT NULL
          THEN public.zyron_accounting_control(p_tenant_id, 'gr_ir_clearing')
        WHEN v_line.line_kind = 'product' AND v_line.product_id IS NOT NULL
          THEN public.zyron_resolve_product_account(p_tenant_id, v_line.product_id, 'inventory')
        ELSE public.zyron_accounting_control(p_tenant_id, 'purchase_expense')
      END,
      'debit', v_net, 'credit', 0,
      'source_line_id', v_line.id
    ));
  END LOOP;

  IF COALESCE(v_bill.tax_total, 0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', public.zyron_accounting_control(p_tenant_id, 'purchase_tax_credit'),
      'debit', v_bill.tax_total, 'credit', 0
    ));
  END IF;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', public.zyron_accounting_control(p_tenant_id, 'accounts_payable'),
    'debit', 0, 'credit', v_bill.total
  ));

  v_entry := public.zyron_post_accounting_entry(
    p_tenant_id, 'purchase_bill', p_bill_id, 'purchase_bill.posted', COALESCE(v_bill.bill_date, current_date), COALESCE(v_bill.currency, 'DOP'),
    'Factura de compra ' || v_bill.bill_number || COALESCE(' · NCF ' || v_bill.supplier_ncf, ''), v_lines,
    jsonb_build_object('supplier_id', v_bill.supplier_id)
  );

  UPDATE public.scm_purchase_bills SET status = 'posted', posted_at = now(), updated_at = now() WHERE id = p_bill_id;
  RETURN v_entry;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Grants.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.zyron_purchasing_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_next_scm_number(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_post_goods_receipt(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_post_purchase_bill(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.zyron_next_scm_number(uuid, text, text),
  public.zyron_post_goods_receipt(uuid, uuid),
  public.zyron_post_purchase_bill(uuid, uuid)
  TO authenticated;
