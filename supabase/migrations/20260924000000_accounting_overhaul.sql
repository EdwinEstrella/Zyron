-- Zyron accounting overhaul: event-sourced, tenant-scoped postings.
-- Additive only. It never creates entries for historical business documents.

INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES
  ('accounting.ledger.view', 'Ver contabilidad', 'Permite consultar cuentas, configuraciones y asientos contables.'),
  ('accounting.ledger.manage', 'Gestionar contabilidad', 'Permite configurar cuentas y registrar eventos contables.')
ON CONFLICT (permission_key) DO UPDATE
SET label = EXCLUDED.label, description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.accounting_control_accounts (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  control_key text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, control_key),
  UNIQUE (tenant_id, account_id),
  CHECK (control_key IN ('cash_bank', 'accounts_receivable', 'inventory', 'sales_revenue', 'sales_tax_payable', 'cost_of_sales', 'inventory_adjustment_gain', 'inventory_adjustment_loss'))
);

CREATE TABLE IF NOT EXISTS public.product_category_account_mappings (
  category_id uuid PRIMARY KEY REFERENCES public.product_categories(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_account_id uuid REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  inventory_account_id uuid REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  cost_of_sales_account_id uuid REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_account_mappings (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sales_account_id uuid REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  inventory_account_id uuid REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  cost_of_sales_account_id uuid REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_source_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  event_type text NOT NULL,
  source_line_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, event_type)
);

ALTER TABLE public.accounting_journal_entries
  ADD COLUMN IF NOT EXISTS source_event_id uuid REFERENCES public.accounting_source_events(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS accounting_journal_entries_source_event_key
  ON public.accounting_journal_entries (source_event_id) WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounting_source_events_tenant_source_idx
  ON public.accounting_source_events (tenant_id, source_type, source_id, occurred_at DESC);

-- Controls resolve the existing foundation accounts. The extra adjustment accounts are additive.
INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, normal_balance, is_system, metadata)
SELECT t.id, s.code, s.name, s.account_type, s.normal_balance, true, jsonb_build_object('control_key', s.control_key)
FROM public.tenants t
CROSS JOIN (VALUES
  ('5300', 'Pérdidas por ajustes de inventario', 'expense', 'debit', 'inventory_adjustment_loss'),
  ('4200', 'Ganancias por ajustes de inventario', 'revenue', 'credit', 'inventory_adjustment_gain')
) AS s(code, name, account_type, normal_balance, control_key)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_control_accounts (tenant_id, control_key, account_id)
SELECT t.id, s.control_key, a.id
FROM public.tenants t
CROSS JOIN (VALUES
  ('cash_bank', '1010'), ('accounts_receivable', '1100'), ('inventory', '1300'),
  ('sales_tax_payable', '2100'), ('sales_revenue', '4100'), ('cost_of_sales', '5100'),
  ('inventory_adjustment_loss', '5300'), ('inventory_adjustment_gain', '4200')
) AS s(control_key, code)
JOIN public.accounting_accounts a ON a.tenant_id = t.id AND a.code = s.code
ON CONFLICT (tenant_id, control_key) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();

CREATE OR REPLACE FUNCTION public.zyron_seed_accounting_controls()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, normal_balance, is_system)
  VALUES
    (NEW.id, '1010', 'Efectivo y bancos', 'asset', 'debit', true),
    (NEW.id, '1100', 'Cuentas por cobrar comerciales', 'asset', 'debit', true),
    (NEW.id, '1300', 'Inventarios', 'asset', 'debit', true),
    (NEW.id, '2100', 'Impuestos por pagar', 'liability', 'credit', true),
    (NEW.id, '4100', 'Ingresos por ventas', 'revenue', 'credit', true),
    (NEW.id, '5100', 'Costo de ventas', 'expense', 'debit', true),
    (NEW.id, '5300', 'Pérdidas por ajustes de inventario', 'expense', 'debit', true),
    (NEW.id, '4200', 'Ganancias por ajustes de inventario', 'revenue', 'credit', true)
  ON CONFLICT (tenant_id, code) DO NOTHING;
  INSERT INTO public.accounting_control_accounts (tenant_id, control_key, account_id)
  SELECT NEW.id, s.control_key, a.id
  FROM (VALUES ('cash_bank','1010'), ('accounts_receivable','1100'), ('inventory','1300'), ('sales_tax_payable','2100'), ('sales_revenue','4100'), ('cost_of_sales','5100'), ('inventory_adjustment_loss','5300'), ('inventory_adjustment_gain','4200')) s(control_key, code)
  JOIN public.accounting_accounts a ON a.tenant_id = NEW.id AND a.code = s.code
  ON CONFLICT (tenant_id, control_key) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_zyron_seed_accounting_controls ON public.tenants;
CREATE TRIGGER tr_zyron_seed_accounting_controls AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.zyron_seed_accounting_controls();

CREATE OR REPLACE FUNCTION public.zyron_accounting_allowed(p_tenant_id uuid, p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin()
    OR public.check_user_permission(p_tenant_id, p_permission)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      JOIN public.app_users au ON au.id = tm.app_user_id
      WHERE tm.tenant_id = p_tenant_id AND tm.status = 'active'
        AND au.auth_user_id = auth.uid()::text
        AND (tm.is_owner OR tm.role_key = 'tenant_admin')
    )
$$;

CREATE OR REPLACE FUNCTION public.zyron_accounting_control(p_tenant_id uuid, p_control_key text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT account_id FROM public.accounting_control_accounts WHERE tenant_id = p_tenant_id AND control_key = p_control_key
$$;

CREATE OR REPLACE FUNCTION public.zyron_resolve_product_account(p_tenant_id uuid, p_product_id uuid, p_account_kind text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    CASE p_account_kind WHEN 'sales' THEN pam.sales_account_id WHEN 'inventory' THEN pam.inventory_account_id WHEN 'cost_of_sales' THEN pam.cost_of_sales_account_id END,
    CASE p_account_kind WHEN 'sales' THEN cam.sales_account_id WHEN 'inventory' THEN cam.inventory_account_id WHEN 'cost_of_sales' THEN cam.cost_of_sales_account_id END,
    public.zyron_accounting_control(p_tenant_id, CASE p_account_kind WHEN 'sales' THEN 'sales_revenue' WHEN 'inventory' THEN 'inventory' ELSE 'cost_of_sales' END)
  )
  FROM public.products p
  LEFT JOIN public.product_account_mappings pam ON pam.product_id = p.id AND pam.tenant_id = p_tenant_id
  LEFT JOIN public.product_category_account_mappings cam ON cam.category_id = p.category_id AND cam.tenant_id = p_tenant_id
  WHERE p.id = p_product_id AND p.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.zyron_assert_accounting_mapping_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.accounting_accounts WHERE id = COALESCE(NEW.sales_account_id, NEW.inventory_account_id, NEW.cost_of_sales_account_id);
  IF v_tenant IS NOT NULL AND v_tenant <> NEW.tenant_id THEN RAISE EXCEPTION 'La cuenta configurada pertenece a otra empresa.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_product_account_mapping_tenant ON public.product_account_mappings;
CREATE TRIGGER tr_product_account_mapping_tenant BEFORE INSERT OR UPDATE ON public.product_account_mappings FOR EACH ROW EXECUTE FUNCTION public.zyron_assert_accounting_mapping_tenant();
DROP TRIGGER IF EXISTS tr_category_account_mapping_tenant ON public.product_category_account_mappings;
CREATE TRIGGER tr_category_account_mapping_tenant BEFORE INSERT OR UPDATE ON public.product_category_account_mappings FOR EACH ROW EXECUTE FUNCTION public.zyron_assert_accounting_mapping_tenant();

CREATE OR REPLACE FUNCTION public.zyron_assert_published_entry_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status <> 'draft' THEN RAISE EXCEPTION 'Los asientos publicados son inmutables; use una reversión.'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft'
    AND NOT (OLD.status = 'posted' AND NEW.status = 'reversed' AND current_setting('zyron.accounting_reversal', true) = 'on')
  THEN RAISE EXCEPTION 'Los asientos publicados son inmutables; use una reversión.'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS tr_accounting_published_entry_immutable ON public.accounting_journal_entries;
CREATE TRIGGER tr_accounting_published_entry_immutable BEFORE UPDATE OR DELETE ON public.accounting_journal_entries FOR EACH ROW EXECUTE FUNCTION public.zyron_assert_published_entry_immutable();

CREATE OR REPLACE FUNCTION public.zyron_assert_journal_line_mutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.accounting_journal_entries WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Las líneas de un asiento publicado son inmutables.'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS tr_accounting_journal_line_mutable ON public.accounting_journal_lines;
CREATE TRIGGER tr_accounting_journal_line_mutable BEFORE UPDATE OR DELETE ON public.accounting_journal_lines FOR EACH ROW EXECUTE FUNCTION public.zyron_assert_journal_line_mutable();

CREATE OR REPLACE FUNCTION public.zyron_post_accounting_entry(
  p_tenant_id uuid, p_source_type text, p_source_id uuid, p_event_type text, p_entry_date date, p_currency text, p_memo text, p_lines jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_reversal_of uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event uuid; v_entry uuid; v_actor uuid; v_line jsonb; v_no integer := 0;
BEGIN
  SELECT id INTO v_actor FROM public.app_users WHERE auth_user_id = auth.uid()::text;
  INSERT INTO public.accounting_source_events (tenant_id, source_type, source_id, event_type, created_by, metadata)
  VALUES (p_tenant_id, p_source_type, p_source_id, p_event_type, v_actor, COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT (tenant_id, source_type, source_id, event_type) DO NOTHING RETURNING id INTO v_event;
  IF v_event IS NULL THEN
    SELECT id INTO v_event FROM public.accounting_source_events WHERE tenant_id = p_tenant_id AND source_type = p_source_type AND source_id = p_source_id AND event_type = p_event_type;
    SELECT id INTO v_entry FROM public.accounting_journal_entries WHERE source_event_id = v_event;
    RETURN v_entry;
  END IF;
  INSERT INTO public.accounting_journal_entries (tenant_id, entry_date, status, source_type, source_id, source_label, memo, currency, source_event_id, reversal_of_entry_id, created_by, metadata)
  VALUES (p_tenant_id, p_entry_date, 'draft', p_source_type, p_source_id, p_event_type, p_memo, p_currency, v_event, p_reversal_of, v_actor, COALESCE(p_metadata, '{}'::jsonb)) RETURNING id INTO v_entry;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_no := v_no + 1;
    INSERT INTO public.accounting_journal_lines (tenant_id, journal_entry_id, account_id, line_no, description, debit_amount, credit_amount, currency, source_line_id, metadata)
    VALUES (p_tenant_id, v_entry, (v_line->>'account_id')::uuid, v_no, v_line->>'description', COALESCE((v_line->>'debit')::numeric,0), COALESCE((v_line->>'credit')::numeric,0), p_currency, NULLIF(v_line->>'source_line_id','')::uuid, COALESCE(v_line->'metadata','{}'::jsonb));
  END LOOP;
  UPDATE public.accounting_journal_entries SET status = 'posted', posted_at = now() WHERE id = v_entry;
  RETURN v_entry;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_post_invoice_issue(p_tenant_id uuid, p_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice public.invoices%ROWTYPE; v_revenue numeric := 0; v_tax numeric := 0; v_cost numeric := 0; v_entry uuid; v_inventory_entry uuid; v_line record; v_product public.products%ROWTYPE; v_average numeric; v_sales uuid; v_inventory uuid; v_cogs uuid; v_posting_lines jsonb;
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para contabilizar.'; END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento no encontrado.'; END IF;
  IF v_invoice.invoice_type = 'estimate' THEN RETURN NULL; END IF;
  IF v_invoice.status <> 'draft' THEN
    SELECT je.id INTO v_entry FROM public.accounting_journal_entries je JOIN public.accounting_source_events se ON se.id = je.source_event_id WHERE se.tenant_id=p_tenant_id AND se.source_type='invoice' AND se.source_id=p_invoice_id AND se.event_type='invoice.issue.revenue';
    RETURN v_entry;
  END IF;
  v_revenue := COALESCE(v_invoice.subtotal, 0); v_tax := COALESCE(v_invoice.tax_total, 0);
  IF v_invoice.invoice_type = 'credit_note' THEN
    v_entry := public.zyron_post_accounting_entry(p_tenant_id, 'invoice', p_invoice_id, 'credit_note.issue', current_date, v_invoice.currency, 'Nota de crédito ' || v_invoice.series || '-' || v_invoice.number,
      jsonb_build_array(jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'sales_revenue'), 'debit', v_revenue, 'credit', 0), jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'sales_tax_payable'), 'debit', v_tax, 'credit', 0), jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'accounts_receivable'), 'debit', 0, 'credit', v_invoice.total)), jsonb_build_object('source_document_id', v_invoice.parent_invoice_id));
  ELSIF v_invoice.invoice_type = 'debit_note' THEN
    v_entry := public.zyron_post_accounting_entry(p_tenant_id, 'invoice', p_invoice_id, 'debit_note.issue', current_date, v_invoice.currency, 'Nota de débito ' || v_invoice.series || '-' || v_invoice.number,
      jsonb_build_array(jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'accounts_receivable'), 'debit', v_invoice.total, 'credit', 0), jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'sales_revenue'), 'debit', 0, 'credit', v_revenue), jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'sales_tax_payable'), 'debit', 0, 'credit', v_tax)), jsonb_build_object('source_document_id', v_invoice.parent_invoice_id));
  ELSE
    v_posting_lines := jsonb_build_array(jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'accounts_receivable'), 'debit', v_invoice.total, 'credit', 0));
    FOR v_line IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
      v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object(
        'account_id', CASE WHEN v_line.product_id IS NULL THEN public.zyron_accounting_control(p_tenant_id,'sales_revenue') ELSE public.zyron_resolve_product_account(p_tenant_id,v_line.product_id,'sales') END,
        'debit', 0,
        'credit', round(v_line.quantity * v_line.unit_price * (1 - COALESCE(v_line.discount,0) / 100), 2),
        'source_line_id', v_line.id
      ));
    END LOOP;
    IF v_tax > 0 THEN v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'sales_tax_payable'), 'debit', 0, 'credit', v_tax)); END IF;
    v_entry := public.zyron_post_accounting_entry(p_tenant_id, 'invoice', p_invoice_id, 'invoice.issue.revenue', current_date, v_invoice.currency, 'Factura emitida ' || v_invoice.series || '-' || v_invoice.number,
      v_posting_lines);
  END IF;
  IF v_invoice.invoice_type = 'standard' THEN
    FOR v_line IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL LOOP
      SELECT * INTO v_product FROM public.products WHERE id = v_line.product_id AND tenant_id = p_tenant_id FOR UPDATE;
      IF FOUND AND v_product.tracks_stock AND v_product.item_kind <> 'service' THEN
        v_average := COALESCE(v_product.cost_price, 0); v_cost := v_cost + (v_line.quantity * v_average);
        UPDATE public.products SET stock = stock - v_line.quantity WHERE id = v_product.id;
        INSERT INTO public.warehouse_stock (tenant_id, warehouse_id, product_id, quantity)
        SELECT p_tenant_id, w.id, v_product.id, -v_line.quantity FROM public.warehouses w WHERE w.tenant_id = p_tenant_id AND w.is_default
        ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = public.warehouse_stock.quantity + EXCLUDED.quantity, updated_at = now();
        INSERT INTO public.inventory_kardex (tenant_id, product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes)
        VALUES (p_tenant_id, v_product.id, 'invoice_issue', -v_line.quantity, v_average, 'invoice', p_invoice_id, 'Salida por factura emitida');
      END IF;
    END LOOP;
    IF v_cost > 0 THEN
      v_inventory_entry := public.zyron_post_accounting_entry(p_tenant_id, 'invoice', p_invoice_id, 'invoice.issue.inventory', current_date, v_invoice.currency, 'Costo de venta ' || v_invoice.series || '-' || v_invoice.number,
        jsonb_build_array(jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'cost_of_sales'), 'debit', v_cost, 'credit', 0), jsonb_build_object('account_id', public.zyron_accounting_control(p_tenant_id,'inventory'), 'debit', 0, 'credit', v_cost)));
    END IF;
  END IF;
  UPDATE public.invoices SET status='pending', updated_at=now() WHERE id=p_invoice_id;
  RETURN v_entry;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_post_payment(p_tenant_id uuid, p_amount numeric, p_currency text, p_customer_id uuid, p_method text, p_reference text, p_notes text, p_allocations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payment uuid; v_allocation jsonb; v_invoice public.invoices%ROWTYPE; v_sum numeric := 0; v_actor uuid; v_entry uuid;
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para registrar pagos.'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'El pago debe ser mayor que cero.'; END IF;
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) LOOP
    SELECT * INTO v_invoice FROM public.invoices WHERE id=(v_allocation->>'invoice_id')::uuid AND tenant_id=p_tenant_id FOR UPDATE;
    IF NOT FOUND OR v_invoice.status='draft' THEN RAISE EXCEPTION 'La factura aplicada no es válida.'; END IF;
    IF (v_allocation->>'amount')::numeric <= 0 OR (v_allocation->>'amount')::numeric > v_invoice.total-v_invoice.amount_paid THEN RAISE EXCEPTION 'El monto aplicado excede el saldo abierto.'; END IF;
    v_sum := v_sum + (v_allocation->>'amount')::numeric;
  END LOOP;
  IF v_sum <> p_amount THEN RAISE EXCEPTION 'El pago debe quedar totalmente aplicado; los anticipos requieren una cuenta específica.'; END IF;
  SELECT id INTO v_actor FROM public.app_users WHERE auth_user_id=auth.uid()::text;
  INSERT INTO public.payments (tenant_id, customer_id, amount, currency, status, payment_date, method, payment_method_code, reference, notes, unallocated_amount, created_by)
  VALUES (p_tenant_id,p_customer_id,p_amount,upper(p_currency),'completed',current_date,p_method,p_method,p_reference,p_notes,p_amount-v_sum,v_actor) RETURNING id INTO v_payment;
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) LOOP
    INSERT INTO public.payment_allocations (tenant_id,payment_id,invoice_id,amount) VALUES (p_tenant_id,v_payment,(v_allocation->>'invoice_id')::uuid,(v_allocation->>'amount')::numeric);
    UPDATE public.invoices SET amount_paid=amount_paid+(v_allocation->>'amount')::numeric, status=CASE WHEN amount_paid+(v_allocation->>'amount')::numeric >= total THEN 'paid' ELSE 'partial' END, updated_at=now() WHERE id=(v_allocation->>'invoice_id')::uuid;
  END LOOP;
  v_entry := public.zyron_post_accounting_entry(p_tenant_id,'payment',v_payment,'payment.received',current_date,upper(p_currency),'Pago recibido',jsonb_build_array(jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,'cash_bank'),'debit',p_amount,'credit',0),jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,'accounts_receivable'),'debit',0,'credit',v_sum)));
  RETURN v_payment;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_post_inventory_adjustment(p_tenant_id uuid, p_product_id uuid, p_warehouse_id uuid, p_quantity_delta numeric, p_unit_cost numeric, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product public.products%ROWTYPE; v_cost numeric; v_value numeric; v_entry uuid;
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para ajustar inventario.'; END IF;
  IF p_quantity_delta = 0 THEN RAISE EXCEPTION 'El ajuste no puede ser cero.'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND OR NOT v_product.tracks_stock OR v_product.item_kind='service' THEN RAISE EXCEPTION 'El artículo no admite ajustes de inventario.'; END IF;
  v_cost := CASE WHEN p_quantity_delta > 0 THEN COALESCE(p_unit_cost,v_product.cost_price,0) ELSE COALESCE(v_product.cost_price,0) END;
  IF p_quantity_delta > 0 AND v_product.stock + p_quantity_delta > 0 THEN UPDATE public.products SET cost_price=((stock*COALESCE(cost_price,0))+(p_quantity_delta*v_cost))/(stock+p_quantity_delta), stock=stock+p_quantity_delta WHERE id=p_product_id; ELSE UPDATE public.products SET stock=stock+p_quantity_delta WHERE id=p_product_id; END IF;
  INSERT INTO public.warehouse_stock (tenant_id, warehouse_id, product_id, quantity)
  VALUES (p_tenant_id, p_warehouse_id, p_product_id, p_quantity_delta)
  ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = public.warehouse_stock.quantity + EXCLUDED.quantity, updated_at = now();
  INSERT INTO public.inventory_kardex (tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,notes) VALUES (p_tenant_id,p_product_id,p_warehouse_id,'adjustment',p_quantity_delta,v_cost,'manual_adjustment',gen_random_uuid(),p_reason);
  v_value := abs(p_quantity_delta)*v_cost;
  v_entry := public.zyron_post_accounting_entry(p_tenant_id,'inventory',p_product_id,'inventory.adjustment.' || CASE WHEN p_quantity_delta > 0 THEN 'increase' ELSE 'decrease' END,current_date,'DOP',p_reason,jsonb_build_array(jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,CASE WHEN p_quantity_delta>0 THEN 'inventory' ELSE 'inventory_adjustment_loss' END),'debit',v_value,'credit',0),jsonb_build_object('account_id',public.zyron_accounting_control(p_tenant_id,CASE WHEN p_quantity_delta>0 THEN 'inventory_adjustment_gain' ELSE 'inventory' END),'debit',0,'credit',v_value)));
  RETURN v_entry;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_reverse_journal_entry(p_tenant_id uuid, p_entry_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry public.accounting_journal_entries%ROWTYPE; v_lines jsonb; v_reversal uuid;
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para reversar.'; END IF;
  SELECT * INTO v_entry FROM public.accounting_journal_entries WHERE id=p_entry_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_entry.status <> 'posted' THEN RAISE EXCEPTION 'Solo se reversan asientos publicados.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('account_id',account_id,'debit',credit_amount,'credit',debit_amount,'description','Reversión: ' || COALESCE(description,''),'source_line_id',source_line_id) ORDER BY line_no) INTO v_lines FROM public.accounting_journal_lines WHERE journal_entry_id=p_entry_id;
  v_reversal := public.zyron_post_accounting_entry(p_tenant_id,'journal_entry',p_entry_id,'journal.reversal',current_date,v_entry.currency,'Reversión de ' || v_entry.entry_number,v_lines,jsonb_build_object('reversal_of_entry_id',p_entry_id),p_entry_id);
  PERFORM set_config('zyron.accounting_reversal', 'on', true);
  UPDATE public.accounting_journal_entries SET status='reversed' WHERE id=p_entry_id;
  RETURN v_reversal;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_create_manual_journal(p_tenant_id uuid, p_entry_date date, p_memo text, p_currency text, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_source_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para contabilizar.'; END IF;
  RETURN public.zyron_post_accounting_entry(p_tenant_id, 'manual_journal', v_source_id, 'manual_journal.posted', p_entry_date, upper(p_currency), p_memo, p_lines);
END $$;

CREATE OR REPLACE FUNCTION public.zyron_delete_draft_journal(p_tenant_id uuid, p_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para eliminar borradores.'; END IF;
  DELETE FROM public.accounting_journal_entries WHERE id=p_entry_id AND tenant_id=p_tenant_id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo se pueden eliminar borradores existentes.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_publish_draft_journal(p_tenant_id uuid, p_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.manage') THEN RAISE EXCEPTION 'No tiene permiso para contabilizar.'; END IF;
  UPDATE public.accounting_journal_entries SET status='posted', posted_at=now() WHERE id=p_entry_id AND tenant_id=p_tenant_id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'El borrador no existe.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_product_accounting_entries(p_tenant_id uuid, p_product_id uuid)
RETURNS TABLE(entry_id uuid, entry_number text, entry_date date, source_type text, source_id uuid, memo text, status text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT je.id,je.entry_number,je.entry_date,je.source_type,je.source_id,je.memo,je.status
  FROM public.accounting_journal_entries je JOIN public.accounting_journal_lines jl ON jl.journal_entry_id=je.id
  WHERE public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.view')
    AND je.tenant_id=p_tenant_id
    AND (jl.metadata->>'product_id'=p_product_id::text OR EXISTS (SELECT 1 FROM public.inventory_kardex k WHERE k.product_id=p_product_id AND k.reference_id=je.source_id))
  ORDER BY je.entry_date DESC
$$;

ALTER TABLE public.accounting_control_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_category_account_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_account_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_source_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounting_controls_read ON public.accounting_control_accounts;
CREATE POLICY accounting_controls_read ON public.accounting_control_accounts FOR SELECT TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.view'));
DROP POLICY IF EXISTS accounting_controls_manage ON public.accounting_control_accounts;
CREATE POLICY accounting_controls_manage ON public.accounting_control_accounts FOR ALL TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.manage')) WITH CHECK (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.manage'));
DROP POLICY IF EXISTS category_account_mappings_access ON public.product_category_account_mappings;
CREATE POLICY category_account_mappings_access ON public.product_category_account_mappings FOR ALL TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.view')) WITH CHECK (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.manage'));
DROP POLICY IF EXISTS product_account_mappings_access ON public.product_account_mappings;
CREATE POLICY product_account_mappings_access ON public.product_account_mappings FOR ALL TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.view')) WITH CHECK (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.manage'));
DROP POLICY IF EXISTS accounting_source_events_read ON public.accounting_source_events;
CREATE POLICY accounting_source_events_read ON public.accounting_source_events FOR SELECT TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.view'));

-- Published ledger data is read-only through the Data API; all writes go through the RPCs above.
DROP POLICY IF EXISTS tenant_accounting_journal_entries_write ON public.accounting_journal_entries;
DROP POLICY IF EXISTS tenant_accounting_journal_lines_write ON public.accounting_journal_lines;
DROP POLICY IF EXISTS tenant_accounting_journal_entries_read ON public.accounting_journal_entries;
CREATE POLICY tenant_accounting_journal_entries_read ON public.accounting_journal_entries FOR SELECT TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.view'));
DROP POLICY IF EXISTS tenant_accounting_journal_lines_read ON public.accounting_journal_lines;
CREATE POLICY tenant_accounting_journal_lines_read ON public.accounting_journal_lines FOR SELECT TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.view'));
DROP POLICY IF EXISTS tenant_accounting_accounts_read ON public.accounting_accounts;
CREATE POLICY tenant_accounting_accounts_read ON public.accounting_accounts FOR SELECT TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.view'));
DROP POLICY IF EXISTS tenant_accounting_accounts_write ON public.accounting_accounts;
CREATE POLICY tenant_accounting_accounts_write ON public.accounting_accounts FOR ALL TO authenticated USING (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.manage')) WITH CHECK (public.zyron_accounting_allowed(tenant_id,'accounting.ledger.manage'));

REVOKE ALL ON FUNCTION public.zyron_post_accounting_entry(uuid,text,uuid,text,date,text,text,jsonb,jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_accounting_control(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_resolve_product_account(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_accounting_allowed(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_seed_accounting_controls() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_assert_accounting_mapping_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_assert_published_entry_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_assert_journal_line_mutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_post_invoice_issue(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_post_payment(uuid,numeric,text,uuid,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_post_inventory_adjustment(uuid,uuid,uuid,numeric,numeric,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_reverse_journal_entry(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_create_manual_journal(uuid,date,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_delete_draft_journal(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_publish_draft_journal(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.zyron_product_accounting_entries(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zyron_accounting_allowed(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_post_invoice_issue(uuid,uuid), public.zyron_post_payment(uuid,numeric,text,uuid,text,text,text,jsonb), public.zyron_post_inventory_adjustment(uuid,uuid,uuid,numeric,numeric,text), public.zyron_reverse_journal_entry(uuid,uuid), public.zyron_create_manual_journal(uuid,date,text,text,jsonb), public.zyron_delete_draft_journal(uuid,uuid), public.zyron_publish_draft_journal(uuid,uuid), public.zyron_product_accounting_entries(uuid,uuid) TO authenticated;

-- Deliberate backfill is opt-in only: an operator may call the posting RPC for one draft document at a time after reconciliation. No migration invokes it.
