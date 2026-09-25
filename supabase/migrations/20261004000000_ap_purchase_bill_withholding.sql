-- ============================================================================
-- Zyron: Accounts Payable (CxP) MVP - M2: purchase bill withholding + the
-- atomic create/post RPCs for direct (no PO/GR link) purchase bills.
--
-- Depends on:
--   * 20260927000000_purchases_accounting_integration.sql (scm_purchase_bills,
--     scm_purchase_bill_items, zyron_next_scm_number, zyron_post_purchase_bill)
--   * 20261003000000_ap_classification_withholding_controls.sql
--     (scm_suppliers.classification, ap_withholding_settings,
--     isr/itbis_withholding_payable + supplier_advances controls,
--     purchase_bills.* permission keys, zyron_ap_ncf_valid)
--
-- This migration:
--
--   1. Adds five columns to scm_purchase_bills: supplier_classification (a
--      SNAPSHOT of the supplier's classification at bill-creation time —
--      later changes to the supplier record must not retroactively change
--      an already-created bill's expected NCF/withholding shape; nullable
--      because pre-existing bills predate classification), the per-bill
--      isr/itbis withholding percentages actually applied (overridable, see
--      zyron_create_purchase_bill below) and the resulting withheld amounts.
--      A CHECK guarantees the sum of both withheld amounts never exceeds the
--      bill total.
--   2. Adds a CHECK constraint on scm_purchase_bill_items.line_kind (the
--      column already exists, default 'product', from
--      20260927000000_purchases_accounting_integration.sql — this only adds
--      the missing constraint) restricting it to the three kinds
--      zyron_post_purchase_bill already branches on: 'product', 'expense',
--      'service'.
--   3. Adds a `status` CHECK constraint (scm_purchase_bills never had one)
--      covering every status the AP flow now uses: draft, posted (this
--      migration), partial/paid (M3 supplier payments) and void. Added
--      NOT VALID because pre-existing rows are not re-validated — DDL time
--      is not the moment to discover a data problem in an unrelated flow.
--   4. Adds a partial UNIQUE index preventing the same supplier NCF from
--      being registered twice for the same supplier while the bill is not
--      void (case-insensitive via upper()).
--   5. Adds public.zyron_create_purchase_bill: the single entry point for
--      creating a *direct* purchase bill (no PO/goods-receipt link — that
--      flow keeps using the existing tables/RPCs untouched). It computes
--      line net/tax and bill subtotal/tax_total/total server-side (the
--      client must not compute or send totals), resolves the ISR/ITBIS
--      withholding percentage (explicit override, else the tenant's
--      ap_withholding_settings default for the supplier's classification,
--      else 0) and, when p_post is true (the default), posts the bill in
--      the same transaction by calling zyron_post_purchase_bill below. MVP
--      scope: only 'expense'/'service' lines are accepted here — a
--      'product' line (inventory-linked) requires the PO/GR flow.
--   6. Replaces public.zyron_post_purchase_bill (same 2-arg signature —
--      every existing caller keeps working unchanged) to add the
--      withholding legs: Cr accounts_payable now nets out both withheld
--      amounts, and each non-zero withheld amount posts its own credit leg
--      to the matching withholding-payable control. NCF validation
--      (zyron_ap_ncf_valid) now runs before posting. The permission guard
--      changes from the umbrella zyron_purchasing_allowed (still used
--      as-is by zyron_post_goods_receipt, untouched here) to the
--      fine-grained check_user_permission(tenant, 'purchase_bills.authorize')
--      per design decision D12 — permission_satisfies() already carries the
--      scm.manage umbrella over purchase_bills.* (see M1), so a role granted
--      scm.manage keeps working exactly as before. Every other line of the
--      original product/GR-IR/expense branching, the idempotent
--      already-posted lookup, the 'purchase_bill'/'purchase_bill.posted'
--      source/event pair and the resulting UPDATE are preserved unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. scm_purchase_bills: withholding columns.
-- ----------------------------------------------------------------------------

ALTER TABLE public.scm_purchase_bills
  ADD COLUMN IF NOT EXISTS supplier_classification text,
  ADD COLUMN IF NOT EXISTS isr_withholding_pct numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_withholding_pct numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isr_withheld numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_withheld numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.scm_purchase_bills
  DROP CONSTRAINT IF EXISTS scm_purchase_bills_supplier_classification_check;
ALTER TABLE public.scm_purchase_bills
  ADD CONSTRAINT scm_purchase_bills_supplier_classification_check
  CHECK (supplier_classification IS NULL OR supplier_classification IN ('formal', 'informal', 'individual', 'foreign'));

ALTER TABLE public.scm_purchase_bills
  DROP CONSTRAINT IF EXISTS scm_purchase_bills_isr_withholding_pct_check;
ALTER TABLE public.scm_purchase_bills
  ADD CONSTRAINT scm_purchase_bills_isr_withholding_pct_check
  CHECK (isr_withholding_pct >= 0 AND isr_withholding_pct <= 100);

ALTER TABLE public.scm_purchase_bills
  DROP CONSTRAINT IF EXISTS scm_purchase_bills_itbis_withholding_pct_check;
ALTER TABLE public.scm_purchase_bills
  ADD CONSTRAINT scm_purchase_bills_itbis_withholding_pct_check
  CHECK (itbis_withholding_pct >= 0 AND itbis_withholding_pct <= 100);

ALTER TABLE public.scm_purchase_bills
  DROP CONSTRAINT IF EXISTS scm_purchase_bills_isr_withheld_check;
ALTER TABLE public.scm_purchase_bills
  ADD CONSTRAINT scm_purchase_bills_isr_withheld_check
  CHECK (isr_withheld >= 0);

ALTER TABLE public.scm_purchase_bills
  DROP CONSTRAINT IF EXISTS scm_purchase_bills_itbis_withheld_check;
ALTER TABLE public.scm_purchase_bills
  ADD CONSTRAINT scm_purchase_bills_itbis_withheld_check
  CHECK (itbis_withheld >= 0);

ALTER TABLE public.scm_purchase_bills
  DROP CONSTRAINT IF EXISTS scm_purchase_bills_withheld_not_exceed_total_check;
ALTER TABLE public.scm_purchase_bills
  ADD CONSTRAINT scm_purchase_bills_withheld_not_exceed_total_check
  CHECK (isr_withheld + itbis_withheld <= total);

-- ----------------------------------------------------------------------------
-- 2. scm_purchase_bill_items.line_kind: constrain to the kinds
--    zyron_post_purchase_bill branches on. Column already exists (default
--    'product'); this only adds the missing CHECK.
-- ----------------------------------------------------------------------------

ALTER TABLE public.scm_purchase_bill_items
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'product';

ALTER TABLE public.scm_purchase_bill_items
  DROP CONSTRAINT IF EXISTS scm_purchase_bill_items_line_kind_check;
ALTER TABLE public.scm_purchase_bill_items
  ADD CONSTRAINT scm_purchase_bill_items_line_kind_check
  CHECK (line_kind IN ('product', 'expense', 'service'));

-- ----------------------------------------------------------------------------
-- 3. scm_purchase_bills.status: first-ever CHECK, added NOT VALID so
--    pre-existing rows are not re-validated at DDL time.
-- ----------------------------------------------------------------------------

ALTER TABLE public.scm_purchase_bills
  DROP CONSTRAINT IF EXISTS scm_purchase_bills_status_check;
ALTER TABLE public.scm_purchase_bills
  ADD CONSTRAINT scm_purchase_bills_status_check
  CHECK (status IN ('draft', 'posted', 'partial', 'paid', 'void')) NOT VALID;

-- ----------------------------------------------------------------------------
-- 4. Partial UNIQUE index: no two non-void bills for the same supplier may
--    share the same (case-insensitive) NCF.
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS scm_purchase_bills_supplier_ncf_unique_idx
  ON public.scm_purchase_bills (tenant_id, supplier_id, upper(supplier_ncf))
  WHERE supplier_ncf IS NOT NULL AND status <> 'void';

-- ----------------------------------------------------------------------------
-- 5. zyron_create_purchase_bill: atomic create (+ optional post) of a direct
--    purchase bill.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.zyron_create_purchase_bill(
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_supplier_ncf text,
  p_bill_date date,
  p_due_date date,
  p_currency text,
  p_items jsonb,
  p_isr_pct numeric DEFAULT NULL,
  p_itbis_pct numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_post boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_supplier public.scm_suppliers%ROWTYPE;
  v_settings public.ap_withholding_settings%ROWTYPE;
  v_item jsonb;
  v_line_kind text;
  v_quantity numeric;
  v_unit_cost numeric;
  v_discount numeric;
  v_tax_rate numeric;
  v_net numeric;
  v_tax numeric;
  v_subtotal numeric := 0;
  v_tax_total numeric := 0;
  v_isr_pct numeric;
  v_itbis_pct numeric;
  v_isr_withheld numeric;
  v_itbis_withheld numeric;
  v_due_date date;
  v_bill_number text;
  v_bill_id uuid;
BEGIN
  IF NOT public.check_user_permission(p_tenant_id, 'purchase_bills.create') THEN
    RAISE EXCEPTION 'No tiene permiso para crear facturas de compra.';
  END IF;

  SELECT * INTO v_supplier FROM public.scm_suppliers WHERE id = p_supplier_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no encontrado.'; END IF;
  IF NOT v_supplier.is_active THEN RAISE EXCEPTION 'El proveedor no está activo.'; END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La factura debe tener al menos una línea.';
  END IF;

  -- Pass 1: validate every line and accumulate subtotal/tax_total. MVP scope
  -- rejects 'product' lines here — direct bills only cover expense/service;
  -- inventory-linked bills go through the PO/GR flow.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_line_kind := v_item ->> 'line_kind';
    IF v_line_kind IS NULL OR v_line_kind NOT IN ('expense', 'service') THEN
      RAISE EXCEPTION 'Las líneas de una factura de compra directa solo admiten gasto o servicio.';
    END IF;
    v_quantity := COALESCE((v_item ->> 'quantity')::numeric, 0);
    v_unit_cost := COALESCE((v_item ->> 'unit_cost')::numeric, 0);
    v_discount := COALESCE((v_item ->> 'discount')::numeric, 0);
    v_tax_rate := COALESCE((v_item ->> 'tax_rate')::numeric, 0);
    IF v_quantity <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero.'; END IF;
    IF v_unit_cost < 0 THEN RAISE EXCEPTION 'El costo unitario no puede ser negativo.'; END IF;
    IF v_discount < 0 OR v_discount > 100 THEN RAISE EXCEPTION 'El descuento debe estar entre 0 y 100.'; END IF;
    IF v_tax_rate < 0 THEN RAISE EXCEPTION 'La tasa de impuesto no puede ser negativa.'; END IF;
    v_net := round(v_quantity * v_unit_cost * (1 - v_discount / 100), 2);
    v_tax := round(v_net * v_tax_rate / 100, 2);
    v_subtotal := v_subtotal + v_net;
    v_tax_total := v_tax_total + v_tax;
  END LOOP;

  SELECT * INTO v_settings FROM public.ap_withholding_settings
    WHERE tenant_id = p_tenant_id AND classification = v_supplier.classification;
  v_isr_pct := COALESCE(p_isr_pct, v_settings.isr_pct, 0);
  v_itbis_pct := COALESCE(p_itbis_pct, v_settings.itbis_pct, 0);
  v_isr_withheld := round(v_subtotal * v_isr_pct / 100, 2);
  v_itbis_withheld := round(v_tax_total * v_itbis_pct / 100, 2);

  v_due_date := COALESCE(p_due_date, p_bill_date + v_supplier.credit_days);
  v_bill_number := public.zyron_next_scm_number(p_tenant_id, 'purchase_bill', 'FC');

  INSERT INTO public.scm_purchase_bills (
    tenant_id, bill_number, supplier_id, supplier_ncf, bill_date, due_date, currency,
    subtotal, tax_total, total, status, notes,
    supplier_classification, isr_withholding_pct, itbis_withholding_pct, isr_withheld, itbis_withheld
  ) VALUES (
    p_tenant_id, v_bill_number, p_supplier_id, p_supplier_ncf, p_bill_date, v_due_date, upper(p_currency),
    v_subtotal, v_tax_total, v_subtotal + v_tax_total, 'draft', p_notes,
    v_supplier.classification, v_isr_pct, v_itbis_pct, v_isr_withheld, v_itbis_withheld
  ) RETURNING id INTO v_bill_id;

  -- Pass 2: insert the validated lines (re-derives net per line; cheaper
  -- than materializing an array in pass 1 and keeps both passes symmetric).
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_line_kind := v_item ->> 'line_kind';
    v_quantity := COALESCE((v_item ->> 'quantity')::numeric, 0);
    v_unit_cost := COALESCE((v_item ->> 'unit_cost')::numeric, 0);
    v_discount := COALESCE((v_item ->> 'discount')::numeric, 0);
    v_tax_rate := COALESCE((v_item ->> 'tax_rate')::numeric, 0);
    v_net := round(v_quantity * v_unit_cost * (1 - v_discount / 100), 2);
    v_tax := round(v_net * v_tax_rate / 100, 2);
    INSERT INTO public.scm_purchase_bill_items (
      tenant_id, bill_id, description, quantity, unit_cost, discount, tax_rate, line_total, line_kind
    ) VALUES (
      p_tenant_id, v_bill_id, v_item ->> 'description', v_quantity, v_unit_cost, v_discount, v_tax_rate, v_net + v_tax, v_line_kind
    );
  END LOOP;

  IF p_post THEN
    PERFORM public.zyron_post_purchase_bill(p_tenant_id, v_bill_id);
  END IF;

  RETURN v_bill_id;
END $$;

-- ----------------------------------------------------------------------------
-- 6. zyron_post_purchase_bill: add NCF validation and the withholding legs.
--    Same 2-arg signature; the product/GR-IR branching and the idempotent
--    already-posted lookup are preserved unchanged from
--    20260927000000_purchases_accounting_integration.sql.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.zyron_post_purchase_bill(p_tenant_id uuid, p_bill_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill public.scm_purchase_bills%ROWTYPE;
  v_line record;
  v_net numeric;
  v_lines jsonb := '[]'::jsonb;
  v_entry uuid;
  v_account uuid;
  v_ap_net numeric;
BEGIN
  IF NOT public.check_user_permission(p_tenant_id, 'purchase_bills.authorize') THEN
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

  IF NOT public.zyron_ap_ncf_valid(v_bill.supplier_classification, v_bill.supplier_ncf) THEN
    RAISE EXCEPTION 'NCF inválido para el tipo de proveedor.';
  END IF;

  FOR v_line IN SELECT * FROM public.scm_purchase_bill_items WHERE bill_id = p_bill_id AND tenant_id = p_tenant_id LOOP
    v_net := round(v_line.quantity * v_line.unit_cost * (1 - COALESCE(v_line.discount, 0) / 100), 2);
    IF v_net = 0 THEN CONTINUE; END IF;
    v_account := CASE
      WHEN v_line.line_kind = 'product' AND v_bill.goods_receipt_id IS NOT NULL
        THEN public.zyron_accounting_control(p_tenant_id, 'gr_ir_clearing')
      WHEN v_line.line_kind = 'product' AND v_line.product_id IS NOT NULL
        THEN public.zyron_resolve_product_account(p_tenant_id, v_line.product_id, 'inventory')
      ELSE public.zyron_accounting_control(p_tenant_id, 'purchase_expense')
    END;
    IF v_account IS NULL THEN RAISE EXCEPTION 'Cuenta de control % no configurada', 'purchase_expense'; END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_account,
      'debit', v_net, 'credit', 0,
      'source_line_id', v_line.id
    ));
  END LOOP;

  IF COALESCE(v_bill.tax_total, 0) > 0 THEN
    v_account := public.zyron_accounting_control(p_tenant_id, 'purchase_tax_credit');
    IF v_account IS NULL THEN RAISE EXCEPTION 'Cuenta de control % no configurada', 'purchase_tax_credit'; END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_account,
      'debit', v_bill.tax_total, 'credit', 0
    ));
  END IF;

  v_account := public.zyron_accounting_control(p_tenant_id, 'accounts_payable');
  IF v_account IS NULL THEN RAISE EXCEPTION 'Cuenta de control % no configurada', 'accounts_payable'; END IF;
  v_ap_net := v_bill.total - COALESCE(v_bill.isr_withheld, 0) - COALESCE(v_bill.itbis_withheld, 0);
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', v_account,
    'debit', 0, 'credit', v_ap_net
  ));

  IF COALESCE(v_bill.isr_withheld, 0) > 0 THEN
    v_account := public.zyron_accounting_control(p_tenant_id, 'isr_withholding_payable');
    IF v_account IS NULL THEN RAISE EXCEPTION 'Cuenta de control % no configurada', 'isr_withholding_payable'; END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_account,
      'debit', 0, 'credit', v_bill.isr_withheld
    ));
  END IF;

  IF COALESCE(v_bill.itbis_withheld, 0) > 0 THEN
    v_account := public.zyron_accounting_control(p_tenant_id, 'itbis_withholding_payable');
    IF v_account IS NULL THEN RAISE EXCEPTION 'Cuenta de control % no configurada', 'itbis_withholding_payable'; END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_account,
      'debit', 0, 'credit', v_bill.itbis_withheld
    ));
  END IF;

  v_entry := public.zyron_post_accounting_entry(
    p_tenant_id, 'purchase_bill', p_bill_id, 'purchase_bill.posted', COALESCE(v_bill.bill_date, current_date), COALESCE(v_bill.currency, 'DOP'),
    'Factura de compra ' || v_bill.bill_number || COALESCE(' · NCF ' || v_bill.supplier_ncf, ''), v_lines,
    jsonb_build_object('supplier_id', v_bill.supplier_id)
  );

  UPDATE public.scm_purchase_bills SET status = 'posted', posted_at = now(), updated_at = now() WHERE id = p_bill_id;
  RETURN v_entry;
END $$;

-- ----------------------------------------------------------------------------
-- 7. Grants.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.zyron_create_purchase_bill(uuid, uuid, text, date, date, text, jsonb, numeric, numeric, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zyron_create_purchase_bill(uuid, uuid, text, date, date, text, jsonb, numeric, numeric, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.zyron_post_purchase_bill(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zyron_post_purchase_bill(uuid, uuid) TO authenticated;
