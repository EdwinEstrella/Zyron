-- Security Advisor remediation and canonical warehouse synchronization.
-- This migration intentionally replaces legacy permissive policies with explicit RBAC policies.

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_system_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_navigation_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncf_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;

-- The Data API must never expose these records to anonymous callers. RLS below
-- authorizes authenticated users per tenant and permission.
REVOKE ALL ON TABLE public.app_settings, public.app_users, public.audit_logs,
  public.customers, public.invoices, public.products, public.tenants,
  public.user_access_requests, public.role_system_presets, public.permission_catalog,
  public.product_categories, public.measurement_units, public.stock_movements,
  public.app_navigation_modules, public.invoice_items, public.payments,
  public.tenant_fiscal_settings, public.ncf_sequences, public.report_exports,
  public.custom_report_definitions, public.warehouses, public.warehouse_stock FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings, public.app_users,
  public.audit_logs, public.customers, public.invoices, public.products, public.tenants,
  public.user_access_requests, public.role_system_presets, public.permission_catalog,
  public.product_categories, public.measurement_units, public.stock_movements,
  public.app_navigation_modules, public.invoice_items, public.payments,
  public.tenant_fiscal_settings, public.ncf_sequences, public.report_exports,
  public.custom_report_definitions, public.warehouses, public.warehouse_stock TO authenticated;

-- Remove all previous policies on affected tables before installing the complete
-- policy set below. Keeping a legacy policy would OR its predicate with ours.
DO $$
DECLARE
  v_table text;
  v_policy text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'app_settings', 'app_users', 'audit_logs', 'customers', 'invoices', 'products',
    'tenants', 'user_access_requests', 'role_system_presets', 'permission_catalog',
    'product_categories', 'measurement_units', 'stock_movements', 'app_navigation_modules',
    'invoice_items', 'payments', 'tenant_fiscal_settings', 'ncf_sequences',
    'report_exports', 'custom_report_definitions', 'warehouses', 'warehouse_stock'
  ] LOOP
    FOR v_policy IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_policy, v_table);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY zyron_tenants_read ON public.tenants FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_user_tenants()) OR public.is_super_admin());
CREATE POLICY zyron_tenants_manage ON public.tenants FOR ALL TO authenticated
  USING (public.is_strict_super_admin()) WITH CHECK (public.is_strict_super_admin());

CREATE POLICY zyron_app_users_read ON public.app_users FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid())::text OR public.is_super_admin());
CREATE POLICY zyron_app_users_insert ON public.app_users FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = (SELECT auth.uid())::text OR public.is_strict_super_admin());
CREATE POLICY zyron_app_users_update ON public.app_users FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid())::text OR public.is_super_admin())
  WITH CHECK (auth_user_id = (SELECT auth.uid())::text OR public.is_strict_super_admin());

CREATE POLICY zyron_access_requests_read ON public.user_access_requests FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce((SELECT auth.jwt())->>'email', '')) OR public.is_super_admin());
CREATE POLICY zyron_access_requests_insert ON public.user_access_requests FOR INSERT TO authenticated
  WITH CHECK (lower(email) = lower(coalesce((SELECT auth.jwt())->>'email', '')) OR public.is_strict_super_admin());
CREATE POLICY zyron_access_requests_manage ON public.user_access_requests FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY zyron_settings_read ON public.app_settings FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenants()) OR public.is_super_admin());
CREATE POLICY zyron_settings_manage ON public.app_settings FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'settings.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'settings.manage'));

CREATE POLICY zyron_customers_read ON public.customers FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'customers.view'));
CREATE POLICY zyron_customers_manage ON public.customers FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'customers.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'customers.manage'));

CREATE POLICY zyron_products_read ON public.products FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'products.view'));
CREATE POLICY zyron_products_manage ON public.products FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'products.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'products.manage'));

CREATE POLICY zyron_categories_read ON public.product_categories FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'products.view'));
CREATE POLICY zyron_categories_manage ON public.product_categories FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'products.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'products.manage'));
CREATE POLICY zyron_units_read ON public.measurement_units FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'products.view'));
CREATE POLICY zyron_units_manage ON public.measurement_units FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'products.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'products.manage'));
CREATE POLICY zyron_stock_movements_access ON public.stock_movements FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'inventory.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'inventory.manage'));
CREATE POLICY zyron_warehouses_read ON public.warehouses FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'inventory.manage'));
CREATE POLICY zyron_warehouse_stock_access ON public.warehouse_stock FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'inventory.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'inventory.manage'));

CREATE POLICY zyron_invoices_read ON public.invoices FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'invoices.view'));
CREATE POLICY zyron_invoices_manage ON public.invoices FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'invoices.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'invoices.manage'));
CREATE POLICY zyron_invoice_items_read ON public.invoice_items FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'invoices.view'));
CREATE POLICY zyron_invoice_items_manage ON public.invoice_items FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'invoices.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'invoices.manage'));
CREATE POLICY zyron_payments_read ON public.payments FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'payments.view'));
CREATE POLICY zyron_payments_manage ON public.payments FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'payments.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'payments.manage'));

CREATE POLICY zyron_fiscal_settings_access ON public.tenant_fiscal_settings FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'fiscal.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'fiscal.manage'));
CREATE POLICY zyron_ncf_access ON public.ncf_sequences FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'fiscal.manage'))
  WITH CHECK (public.check_user_permission(tenant_id, 'fiscal.manage'));
CREATE POLICY zyron_report_exports_read ON public.report_exports FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'reports.view'));
CREATE POLICY zyron_report_exports_create ON public.report_exports FOR INSERT TO authenticated
  WITH CHECK (public.check_user_permission(tenant_id, 'reports.view'));
CREATE POLICY zyron_reports_access ON public.custom_report_definitions FOR ALL TO authenticated
  USING (public.check_user_permission(tenant_id, 'reports.view'))
  WITH CHECK (public.check_user_permission(tenant_id, 'reports.view'));
CREATE POLICY zyron_audit_logs_read ON public.audit_logs FOR SELECT TO authenticated
  USING (public.check_user_permission(tenant_id, 'settings.manage') OR public.is_super_admin());

CREATE POLICY zyron_system_presets_read ON public.role_system_presets FOR SELECT TO authenticated USING (true);
CREATE POLICY zyron_system_presets_manage ON public.role_system_presets FOR ALL TO authenticated
  USING (public.is_strict_super_admin()) WITH CHECK (public.is_strict_super_admin());
CREATE POLICY zyron_permission_catalog_read ON public.permission_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY zyron_permission_catalog_manage ON public.permission_catalog FOR ALL TO authenticated
  USING (public.is_strict_super_admin()) WITH CHECK (public.is_strict_super_admin());
CREATE POLICY zyron_navigation_read ON public.app_navigation_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY zyron_navigation_manage ON public.app_navigation_modules FOR ALL TO authenticated
  USING (public.is_strict_super_admin()) WITH CHECK (public.is_strict_super_admin());

-- Fixed search paths for all routines reported by the advisor.
CREATE OR REPLACE FUNCTION public.permission_satisfies(granted_key text, requested_key text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN granted_key IS NOT NULL AND requested_key IS NOT NULL AND (
    granted_key = requested_key OR
    (right(granted_key, 7) = '.manage' AND requested_key = regexp_replace(granted_key, '\.manage$', '.view')) OR
    (right(granted_key, 7) = '.delete' AND requested_key IN (regexp_replace(granted_key, '\.delete$', '.manage'), regexp_replace(granted_key, '\.delete$', '.view'))) OR
    (right(granted_key, 5) = '.edit' AND requested_key = regexp_replace(granted_key, '\.edit$', '.view'))
  );
END $$;

CREATE OR REPLACE FUNCTION public.check_user_permission(p_tenant_id uuid, p_permission_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_permission_key IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin() THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    JOIN public.app_users au ON au.id = tm.app_user_id
    LEFT JOIN public.role_catalog rc ON rc.tenant_id = tm.tenant_id AND rc.role_key = tm.role_key
    LEFT JOIN public.role_permissions rp ON rp.role_id = rc.id
    LEFT JOIN public.permission_catalog pc ON pc.id = rp.permission_id
    LEFT JOIN public.role_system_presets rsp ON rsp.role_key = tm.role_key
    LEFT JOIN LATERAL unnest(coalesce(rsp.permission_keys, ARRAY[]::text[])) granted(key) ON true
    WHERE tm.tenant_id = p_tenant_id AND tm.status = 'active' AND au.auth_user_id = (SELECT auth.uid())::text
      AND (public.permission_satisfies(pc.permission_key, p_permission_key) OR public.permission_satisfies(granted.key, p_permission_key))
  );
END $$;

CREATE OR REPLACE FUNCTION public.can_use_tenant_realtime_channel(p_tenant_id uuid, p_permission_key text DEFAULT 'realtime.domain_events.view')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN p_tenant_id IS NOT NULL AND public.check_user_permission(p_tenant_id, p_permission_key);
END $$;

CREATE OR REPLACE FUNCTION public.initialize_tenant_preferences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value) VALUES
    (NEW.id, 'preferences.language', 'es', '{"code":"es","name":"Spanish"}'::jsonb),
    (NEW.id, 'preferences.currency', 'DOP', '{"code":"DOP","symbol":"$","name":"Peso Dominicano"}'::jsonb),
    (NEW.id, 'preferences.timezone', 'America/Santo_Domingo', '"America/Santo_Domingo"'::jsonb),
    (NEW.id, 'preferences.fiscal_year', '1-12', '"1-12"'::jsonb)
  ON CONFLICT (tenant_id, setting_key) DO NOTHING;
  INSERT INTO public.tenant_fiscal_settings (tenant_id, country_code, tax_label, default_tax_rate, ncf_enabled)
  VALUES (NEW.id, 'DO', 'ITBIS', 18, true) ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_accounting_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.fn_validar_limites_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_max integer; v_flexible boolean; v_active integer;
BEGIN
  SELECT coalesce(p.limite_usuarios, t.max_users), t.allow_more_users INTO v_max, v_flexible
  FROM public.tenants t LEFT JOIN public.planes_servicio p ON p.id = t.plan_id WHERE t.id = NEW.tenant_id;
  IF NEW.status = 'active' AND NOT coalesce(v_flexible, false) THEN
    SELECT count(*) INTO v_active FROM public.tenant_memberships
    WHERE tenant_id = NEW.tenant_id AND status = 'active' AND id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF v_active >= coalesce(v_max, 3) THEN RAISE EXCEPTION 'Limite de usuarios excedido para este plan de servicio.'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_next_invoice_number(p_tenant_id uuid, p_series text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_next integer; v_pad integer;
BEGIN
  IF NOT public.check_user_permission(p_tenant_id, 'invoices.manage') THEN RAISE EXCEPTION 'No tiene permiso para numerar facturas.'; END IF;
  INSERT INTO public.invoice_series (tenant_id, code, label, next_number, padding, is_default)
  VALUES (p_tenant_id, p_series, p_series, 1, 6, false) ON CONFLICT (tenant_id, code) DO NOTHING;
  UPDATE public.invoice_series SET next_number = next_number + 1 WHERE tenant_id = p_tenant_id AND code = p_series
  RETURNING next_number - 1, padding INTO v_next, v_pad;
  RETURN lpad(coalesce(v_next, 1)::text, greatest(coalesce(v_pad, 6), 1), '0');
END $$;

CREATE OR REPLACE FUNCTION public.super_admin_list_user_access_requests()
RETURNS SETOF public.user_access_requests LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT * FROM public.user_access_requests
  WHERE public.is_super_admin()
  ORDER BY created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_app_users()
RETURNS SETOF public.app_users LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT * FROM public.app_users
  WHERE public.is_super_admin()
  ORDER BY created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.zyron_sync_warehouse(
  p_tenant_id uuid, p_local_id uuid, p_code text, p_label text, p_is_default boolean, p_is_active boolean
) RETURNS TABLE (id uuid, tenant_id uuid, code text, label text, is_default boolean, is_active boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_local_id IS NULL OR btrim(coalesce(p_code, '')) = '' OR btrim(coalesce(p_label, '')) = '' THEN
    RAISE EXCEPTION 'Los datos del almacén son inválidos.';
  END IF;
  IF NOT public.check_user_permission(p_tenant_id, 'inventory.manage') THEN
    RAISE EXCEPTION 'No tiene permiso para sincronizar almacenes.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('zyron-warehouse-default'), hashtext(p_tenant_id::text));
  IF p_is_default THEN
    UPDATE public.warehouses SET is_default = false WHERE tenant_id = p_tenant_id AND is_default;
  END IF;
  RETURN QUERY
  INSERT INTO public.warehouses (tenant_id, code, label, is_default, is_active)
  VALUES (p_tenant_id, p_code, p_label, p_is_default, p_is_active)
  ON CONFLICT (tenant_id, code) DO UPDATE
    SET label = EXCLUDED.label, is_default = EXCLUDED.is_default, is_active = EXCLUDED.is_active
  RETURNING warehouses.id, warehouses.tenant_id, warehouses.code, warehouses.label,
    warehouses.is_default, warehouses.is_active, warehouses.created_at;
END $$;

-- Remove PUBLIC execution from every deployed SECURITY DEFINER function, including
-- functions introduced before this migration that are not represented in source files.
DO $$
DECLARE v_identity text;
BEGIN
  FOR v_identity IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_identity || ' FROM PUBLIC';
  END LOOP;
END $$;

-- Only authenticated application RPCs and policy helpers receive execute rights.
GRANT EXECUTE ON FUNCTION public.get_user_tenants(), public.is_super_admin(), public.is_strict_super_admin(),
  public.check_user_permission(uuid, text), public.can_use_tenant_realtime_channel(uuid, text),
  public.zyron_accounting_allowed(uuid, text), public.zyron_next_invoice_number(uuid, text),
  public.zyron_sync_warehouse(uuid, uuid, text, text, boolean, boolean),
  public.super_admin_list_user_access_requests(), public.super_admin_list_app_users(),
  public.zyron_post_invoice_issue(uuid, uuid), public.zyron_post_payment(uuid, numeric, text, uuid, text, text, text, jsonb),
  public.zyron_post_inventory_adjustment(uuid, uuid, uuid, numeric, numeric, text), public.zyron_reverse_journal_entry(uuid, uuid),
  public.zyron_create_manual_journal(uuid, date, text, text, jsonb), public.zyron_delete_draft_journal(uuid, uuid),
  public.zyron_publish_draft_journal(uuid, uuid), public.zyron_product_accounting_entries(uuid, uuid)
TO authenticated;
