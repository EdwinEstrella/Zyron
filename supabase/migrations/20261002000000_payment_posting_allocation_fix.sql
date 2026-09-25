-- ============================================================================
-- Zyron: customer-advance accounting for payments ("anticipos de clientes").
--
-- Dominican Republic accounting decision (binding, see AGENTS.md /
-- conversation history): a receipt only exists once money is confirmed
-- received (no more "Pendiente" receipts — the client stops sending that
-- status entirely as of this change). The part of a receipt not applied to
-- an open invoice is a customer *liability* (an advance the business owes
-- the customer as future goods/services or a refund), not a debit balance
-- sitting inside accounts_receivable as the previous version of this file
-- did. This migration:
--
--   1. Adds a dedicated 'customer_advances' control account (liability,
--      code 2300 — next free code in the 2xxx/liability range: 2100
--      sales_tax_payable, 2150 gr_ir_clearing, 2200 accounts_payable are
--      already taken, see 20260924000000_accounting_overhaul.sql and
--      20260927000000_purchases_accounting_integration.sql) and seeds it for
--      every existing tenant and for future tenants, following exactly the
--      constraint-replacement + seed-function pattern
--      20260927000000_purchases_accounting_integration.sql used for
--      accounts_payable/purchase_tax_credit.
--   2. Replaces public.zyron_post_payment: the previous CREATE OR REPLACE
--      (same 8-arg signature) is superseded by a 9-arg version that adds
--      p_payment_date date DEFAULT current_date as the last parameter, so
--      the UI can post a receipt for a date other than "today". Because the
--      argument count changes, the old 8-arg overload is DROPped first (its
--      REVOKE/GRANT from 20260924000000_accounting_overhaul.sql,
--      20260925000000_security_advisor_and_warehouse_sync.sql and
--      20260927000000_resolve_advisor_findings.sql only ever applied to that
--      exact signature and go away with it) and the new 9-arg function gets
--      its own REVOKE ALL FROM PUBLIC / GRANT EXECUTE TO authenticated.
--      Posting now splits the credit side of the receipt: Dr cash_bank
--      (full amount) / Cr accounts_receivable (allocated sum, omitted when
--      zero) / Cr customer_advances (amount - allocated, omitted when
--      zero), keeping the entry balanced.
--   3. Adds public.zyron_apply_customer_advance: applies a previously
--      booked advance (payments.unallocated_amount) to one or more open
--      invoices later, posting Dr customer_advances / Cr
--      accounts_receivable for the applied amount and decrementing
--      payments.unallocated_amount. This is the only supported path for
--      writing payment_allocations rows funded from an advance — the client
--      must not insert them directly, same rule as zyron_post_payment.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New control account: customer_advances (liability, code 2300).
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
    'customer_advances'
  ));

-- Seed the account + control for existing tenants.
INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, normal_balance, is_system, metadata)
SELECT t.id, s.code, s.name, s.account_type, s.normal_balance, true, jsonb_build_object('control_key', s.control_key)
FROM public.tenants t
CROSS JOIN (VALUES
  ('2300', 'Anticipos de clientes', 'liability', 'credit', 'customer_advances')
) AS s(code, name, account_type, normal_balance, control_key)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_control_accounts (tenant_id, control_key, account_id)
SELECT t.id, s.control_key, a.id
FROM public.tenants t
CROSS JOIN (VALUES
  ('customer_advances', '2300')
) AS s(control_key, code)
JOIN public.accounting_accounts a ON a.tenant_id = t.id AND a.code = s.code
ON CONFLICT (tenant_id, control_key) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();

-- Extend the new-tenant seed trigger (carrying forward every account it
-- already seeded, per 20260927000000_purchases_accounting_integration.sql,
-- plus the new customer_advances one — CREATE OR REPLACE fully replaces the
-- function body, so omitting an existing line here would silently stop
-- seeding it for future tenants).
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
    (NEW.id, '2300', 'Anticipos de clientes', 'liability', 'credit', true),
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
    ('accounts_payable', '2200'), ('customer_advances', '2300'), ('sales_revenue', '4100'),
    ('inventory_adjustment_gain', '4200'), ('cost_of_sales', '5100'), ('purchase_expense', '5200'),
    ('inventory_adjustment_loss', '5300')
  ) s(control_key, code)
  JOIN public.accounting_accounts a ON a.tenant_id = NEW.id AND a.code = s.code
  ON CONFLICT (tenant_id, control_key) DO NOTHING;
  RETURN NEW;
END $$;

-- ----------------------------------------------------------------------------
-- 2. zyron_post_payment: add p_payment_date, split advance into
--    customer_advances instead of parking it in accounts_receivable.
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.zyron_post_payment(uuid, numeric, text, uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.zyron_post_payment(p_tenant_id uuid, p_amount numeric, p_currency text, p_customer_id uuid, p_method text, p_reference text, p_notes text, p_allocations jsonb, p_payment_date date DEFAULT current_date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payment uuid; v_allocation jsonb; v_invoice public.invoices%ROWTYPE; v_sum numeric := 0; v_remainder numeric; v_actor uuid; v_entry uuid; v_lines jsonb;
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para registrar pagos.'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'El pago debe ser mayor que cero.'; END IF;
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) LOOP
    SELECT * INTO v_invoice FROM public.invoices WHERE id=(v_allocation->>'invoice_id')::uuid AND tenant_id=p_tenant_id FOR UPDATE;
    IF NOT FOUND OR v_invoice.status IN ('draft','void','cancelled') THEN RAISE EXCEPTION 'La factura aplicada no es válida.'; END IF;
    IF (v_allocation->>'amount')::numeric <= 0 OR (v_allocation->>'amount')::numeric > v_invoice.total-v_invoice.amount_paid THEN RAISE EXCEPTION 'El monto aplicado excede el saldo abierto.'; END IF;
    v_sum := v_sum + (v_allocation->>'amount')::numeric;
  END LOOP;
  IF v_sum > p_amount THEN RAISE EXCEPTION 'La suma aplicada a facturas no puede superar el monto del pago.'; END IF;
  v_remainder := p_amount - v_sum;
  SELECT id INTO v_actor FROM public.app_users WHERE auth_user_id=auth.uid()::text;
  INSERT INTO public.payments (tenant_id, customer_id, amount, currency, status, payment_date, method, payment_method_code, reference, notes, unallocated_amount, created_by)
  VALUES (p_tenant_id,p_customer_id,p_amount,upper(p_currency),'completed',p_payment_date,p_method,p_method,p_reference,p_notes,v_remainder,v_actor) RETURNING id INTO v_payment;
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) LOOP
    INSERT INTO public.payment_allocations (tenant_id,payment_id,invoice_id,amount) VALUES (p_tenant_id,v_payment,(v_allocation->>'invoice_id')::uuid,(v_allocation->>'amount')::numeric);
    UPDATE public.invoices SET amount_paid=amount_paid+(v_allocation->>'amount')::numeric, status=CASE WHEN amount_paid+(v_allocation->>'amount')::numeric >= total THEN 'paid' ELSE 'partial' END, updated_at=now() WHERE id=(v_allocation->>'invoice_id')::uuid;
  END LOOP;
  v_lines := jsonb_build_array(jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,'cash_bank'),'debit',p_amount,'credit',0));
  IF v_sum > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,'accounts_receivable'),'debit',0,'credit',v_sum));
  END IF;
  IF v_remainder > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,'customer_advances'),'debit',0,'credit',v_remainder));
  END IF;
  v_entry := public.zyron_post_accounting_entry(p_tenant_id,'payment',v_payment,'payment.received',p_payment_date,upper(p_currency),'Pago recibido',v_lines);
  RETURN v_payment;
END $$;

REVOKE ALL ON FUNCTION public.zyron_post_payment(uuid,numeric,text,uuid,text,text,text,jsonb,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zyron_post_payment(uuid,numeric,text,uuid,text,text,text,jsonb,date) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. zyron_apply_customer_advance: apply a booked advance to open invoices.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.zyron_apply_customer_advance(p_tenant_id uuid, p_payment_id uuid, p_allocations jsonb, p_apply_date date DEFAULT current_date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payment public.payments%ROWTYPE; v_allocation jsonb; v_invoice public.invoices%ROWTYPE; v_sum numeric := 0; v_entry uuid; v_lines jsonb;
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para aplicar anticipos.'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pago no encontrado.'; END IF;
  IF v_payment.status <> 'completed' THEN RAISE EXCEPTION 'El pago debe estar completado para aplicar el anticipo.'; END IF;
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) LOOP
    SELECT * INTO v_invoice FROM public.invoices WHERE id=(v_allocation->>'invoice_id')::uuid AND tenant_id=p_tenant_id FOR UPDATE;
    IF NOT FOUND OR v_invoice.status IN ('draft','void','cancelled') THEN RAISE EXCEPTION 'La factura aplicada no es válida.'; END IF;
    IF v_payment.customer_id IS NOT NULL AND v_invoice.customer_id IS DISTINCT FROM v_payment.customer_id THEN RAISE EXCEPTION 'La factura no pertenece al cliente del pago.'; END IF;
    IF (v_allocation->>'amount')::numeric <= 0 OR (v_allocation->>'amount')::numeric > v_invoice.total-v_invoice.amount_paid THEN RAISE EXCEPTION 'El monto aplicado excede el saldo abierto.'; END IF;
    v_sum := v_sum + (v_allocation->>'amount')::numeric;
  END LOOP;
  IF v_sum <= 0 THEN RAISE EXCEPTION 'Debe aplicar un monto mayor que cero.'; END IF;
  IF v_sum > COALESCE(v_payment.unallocated_amount, 0) THEN RAISE EXCEPTION 'La suma aplicada no puede superar el anticipo disponible.'; END IF;
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) LOOP
    INSERT INTO public.payment_allocations (tenant_id,payment_id,invoice_id,amount) VALUES (p_tenant_id,p_payment_id,(v_allocation->>'invoice_id')::uuid,(v_allocation->>'amount')::numeric);
    UPDATE public.invoices SET amount_paid=amount_paid+(v_allocation->>'amount')::numeric, status=CASE WHEN amount_paid+(v_allocation->>'amount')::numeric >= total THEN 'paid' ELSE 'partial' END, updated_at=now() WHERE id=(v_allocation->>'invoice_id')::uuid;
  END LOOP;
  UPDATE public.payments SET unallocated_amount = unallocated_amount - v_sum, updated_at = now() WHERE id = p_payment_id;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,'customer_advances'),'debit',v_sum,'credit',0),
    jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,'accounts_receivable'),'debit',0,'credit',v_sum)
  );
  v_entry := public.zyron_post_accounting_entry(p_tenant_id,'payment_advance_application',gen_random_uuid(),'payment.advance_applied',p_apply_date,upper(v_payment.currency),'Aplicación de anticipo a factura(s)',v_lines,jsonb_build_object('payment_id',p_payment_id));
  RETURN v_entry;
END $$;

REVOKE ALL ON FUNCTION public.zyron_apply_customer_advance(uuid,uuid,jsonb,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zyron_apply_customer_advance(uuid,uuid,jsonb,date) TO authenticated;
