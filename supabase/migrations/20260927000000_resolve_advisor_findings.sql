-- ============================================================================
-- Zyron: Comprehensive Fix for Security & Performance Advisor Findings
-- 1. Enable RLS on all remaining public tables
-- 2. Consolidate overlapping policies (Multiple Permissive Policies)
-- 3. Set immutable search_path on functions
-- 4. Revoke anonymous & public execution from security definer functions
-- 5. Add covering indexes for all unindexed foreign keys
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enable RLS on all public tables flagged by Security Advisor
-- ----------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.role_system_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.measurement_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_navigation_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ncf_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.custom_report_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. Consolidate Policies & Clean Up Overlapping Permissive Policies
-- ----------------------------------------------------------------------------

-- app_navigation_modules
DROP POLICY IF EXISTS "allow_read_navigation_modules" ON public.app_navigation_modules;
CREATE POLICY "allow_read_navigation_modules" ON public.app_navigation_modules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "super_admin_manage_navigation_modules" ON public.app_navigation_modules;
CREATE POLICY "super_admin_manage_navigation_modules" ON public.app_navigation_modules FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- role_system_presets
DROP POLICY IF EXISTS "allow_read_role_system_presets" ON public.role_system_presets;
CREATE POLICY "allow_read_role_system_presets" ON public.role_system_presets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "super_admin_manage_role_system_presets" ON public.role_system_presets;
CREATE POLICY "super_admin_manage_role_system_presets" ON public.role_system_presets FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- permission_catalog
DROP POLICY IF EXISTS "allow_read_permission_catalog" ON public.permission_catalog;
CREATE POLICY "allow_read_permission_catalog" ON public.permission_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "super_admin_manage_permission_catalog" ON public.permission_catalog;
CREATE POLICY "super_admin_manage_permission_catalog" ON public.permission_catalog FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- planes_servicio
DROP POLICY IF EXISTS "Permitir lectura publica de planes" ON public.planes_servicio;
DROP POLICY IF EXISTS "Permitir gestion total a super administradores" ON public.planes_servicio;
DROP POLICY IF EXISTS "planes_servicio_select" ON public.planes_servicio;
DROP POLICY IF EXISTS "planes_servicio_admin" ON public.planes_servicio;
CREATE POLICY "planes_servicio_select" ON public.planes_servicio FOR SELECT USING (true);
CREATE POLICY "planes_servicio_admin" ON public.planes_servicio FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- app_settings
DROP POLICY IF EXISTS "settings_read" ON public.app_settings;
DROP POLICY IF EXISTS "settings_write" ON public.app_settings;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.app_settings;
CREATE POLICY "tenant_isolation_policy" ON public.app_settings FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- app_users
DROP POLICY IF EXISTS "super_admin_all_users" ON public.app_users;
DROP POLICY IF EXISTS "users_insert_own_app_user" ON public.app_users;
DROP POLICY IF EXISTS "users_read_own_app_user" ON public.app_users;
DROP POLICY IF EXISTS "users_update_own_app_user" ON public.app_users;
DROP POLICY IF EXISTS "app_users_select" ON public.app_users;
DROP POLICY IF EXISTS "app_users_insert" ON public.app_users;
DROP POLICY IF EXISTS "app_users_update" ON public.app_users;
DROP POLICY IF EXISTS "app_users_delete" ON public.app_users;
CREATE POLICY "app_users_select" ON public.app_users FOR SELECT TO authenticated
USING ((SELECT public.is_super_admin()) OR auth_user_id = auth.uid()::text);
CREATE POLICY "app_users_insert" ON public.app_users FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()) OR auth_user_id = auth.uid()::text);
CREATE POLICY "app_users_update" ON public.app_users FOR UPDATE TO authenticated
USING ((SELECT public.is_super_admin()) OR auth_user_id = auth.uid()::text)
WITH CHECK ((SELECT public.is_super_admin()) OR auth_user_id = auth.uid()::text);
CREATE POLICY "app_users_delete" ON public.app_users FOR DELETE TO authenticated
USING ((SELECT public.is_super_admin()));

-- customers
DROP POLICY IF EXISTS "customers_read" ON public.customers;
DROP POLICY IF EXISTS "customers_write" ON public.customers;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.customers;
CREATE POLICY "tenant_isolation_policy" ON public.customers FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- invoices
DROP POLICY IF EXISTS "invoices_read" ON public.invoices;
DROP POLICY IF EXISTS "invoices_write" ON public.invoices;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.invoices;
CREATE POLICY "tenant_isolation_policy" ON public.invoices FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- products
DROP POLICY IF EXISTS "products_read" ON public.products;
DROP POLICY IF EXISTS "products_write" ON public.products;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.products;
CREATE POLICY "tenant_isolation_policy" ON public.products FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- tenants
DROP POLICY IF EXISTS "super_admin_all_tenants" ON public.tenants;
DROP POLICY IF EXISTS "tenant_access" ON public.tenants;
DROP POLICY IF EXISTS "tenants_access" ON public.tenants;
CREATE POLICY "tenants_access" ON public.tenants FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR id IN (SELECT public.get_user_tenants()));

-- tenant_memberships
DROP POLICY IF EXISTS "super_admin_all_memberships" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant_memberships_access" ON public.tenant_memberships;
CREATE POLICY "tenant_memberships_access" ON public.tenant_memberships FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- user_access_requests
DROP POLICY IF EXISTS "super_admin_all_requests" ON public.user_access_requests;
DROP POLICY IF EXISTS "users_read_own_access_request" ON public.user_access_requests;
DROP POLICY IF EXISTS "users_insert_own_access_request" ON public.user_access_requests;
DROP POLICY IF EXISTS "user_access_requests_select" ON public.user_access_requests;
DROP POLICY IF EXISTS "user_access_requests_insert" ON public.user_access_requests;
DROP POLICY IF EXISTS "user_access_requests_modify" ON public.user_access_requests;
CREATE POLICY "user_access_requests_select" ON public.user_access_requests FOR SELECT TO authenticated
USING ((SELECT public.is_super_admin()) OR email = (SELECT email FROM public.app_users WHERE auth_user_id = auth.uid()::text));
CREATE POLICY "user_access_requests_insert" ON public.user_access_requests FOR INSERT TO authenticated
WITH CHECK (true);
CREATE POLICY "user_access_requests_modify" ON public.user_access_requests FOR UPDATE TO authenticated
USING ((SELECT public.is_super_admin()))
WITH CHECK ((SELECT public.is_super_admin()));

-- accounting_accounts
DROP POLICY IF EXISTS "tenant_accounting_accounts_read" ON public.accounting_accounts;
DROP POLICY IF EXISTS "tenant_accounting_accounts_write" ON public.accounting_accounts;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.accounting_accounts;
CREATE POLICY "tenant_isolation_policy" ON public.accounting_accounts FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- accounting_control_accounts
DROP POLICY IF EXISTS "accounting_controls_manage" ON public.accounting_control_accounts;
DROP POLICY IF EXISTS "accounting_controls_read" ON public.accounting_control_accounts;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.accounting_control_accounts;
CREATE POLICY "tenant_isolation_policy" ON public.accounting_control_accounts FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- accounting_posting_rules
DROP POLICY IF EXISTS "tenant_accounting_posting_rules_read" ON public.accounting_posting_rules;
DROP POLICY IF EXISTS "tenant_accounting_posting_rules_write" ON public.accounting_posting_rules;
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.accounting_posting_rules;
CREATE POLICY "tenant_isolation_policy" ON public.accounting_posting_rules FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- audit_logs
DROP POLICY IF EXISTS "super_admin_all_audit" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_access" ON public.audit_logs;
CREATE POLICY "audit_logs_access" ON public.audit_logs FOR ALL TO authenticated
USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))
WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()));

-- Tenant-isolated standard tables
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'product_categories', 'measurement_units', 'stock_movements', 'invoice_items',
    'payments', 'tenant_fiscal_settings', 'ncf_sequences', 'report_exports', 'custom_report_definitions'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.%I', t);
    EXECUTE format('CREATE POLICY "tenant_isolation_policy" ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants())) WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Function Security: Set immutable search_path & Revoke Public Executions
-- ----------------------------------------------------------------------------

ALTER FUNCTION public.permission_satisfies(text, text) SET search_path = public;
ALTER FUNCTION public.can_use_tenant_realtime_channel(uuid, text) SET search_path = public;
ALTER FUNCTION public.initialize_tenant_preferences() SET search_path = public;
ALTER FUNCTION public.zyron_accounting_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.check_user_permission(uuid, text) SET search_path = public;
ALTER FUNCTION public.fn_validar_limites_plan() SET search_path = public;

-- Revoke all function executions from anon & public in public schema
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Revoke triggers from authenticated (triggers run internally)
REVOKE EXECUTE ON FUNCTION public.initialize_tenant_preferences() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_accounting_touch_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_prepare_journal_entry() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_validate_journal_line_tenant() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_assert_journal_line_balance_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_assert_journal_entry_balance_trigger() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_validar_limites_plan() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_seed_accounting_controls() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_assert_accounting_mapping_tenant() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_assert_published_entry_immutable() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.zyron_assert_journal_line_mutable() FROM authenticated;

-- Grant required app RPCs to authenticated
GRANT EXECUTE ON FUNCTION public.get_user_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_tenant_realtime_channel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_strict_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_app_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_list_user_access_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_satisfies(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_next_invoice_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_next_journal_entry_number(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_post_invoice_issue(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_post_payment(uuid, numeric, text, uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_post_inventory_adjustment(uuid, uuid, uuid, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_create_manual_journal(uuid, date, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_publish_draft_journal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_reverse_journal_entry(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_delete_draft_journal(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_product_accounting_entries(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_resolve_product_account(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_accounting_control(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_accounting_allowed(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_journal_entry_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_assert_journal_entry_balanced(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_post_accounting_entry(uuid, text, uuid, text, date, text, text, jsonb, jsonb, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Performance: Covering Indexes for Unindexed Foreign Keys
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_accounting_control_accounts_acc ON public.accounting_control_accounts (account_id);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_entries_creator ON public.accounting_journal_entries (created_by);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_entries_reversal ON public.accounting_journal_entries (reversal_of_entry_id);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_lines_acc ON public.accounting_journal_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_accounting_source_events_creator ON public.accounting_source_events (created_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON public.crm_activities (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_customer ON public.crm_leads (customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON public.crm_leads (stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline ON public.crm_stages (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_customer_segment_members_tenant ON public.customer_segment_members (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dms_documents_folder ON public.dms_documents (folder_id);
CREATE INDEX IF NOT EXISTS idx_dms_entity_attachments_doc ON public.dms_entity_attachments (document_id);
CREATE INDEX IF NOT EXISTS idx_dms_folders_parent ON public.dms_folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_ecom_order_items_order ON public.ecom_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_ecom_order_items_product ON public.ecom_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_invoice ON public.ecom_orders (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ecom_products_product ON public.ecom_products (product_id);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_employee ON public.hr_attendance (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_department ON public.hr_employees (department_id);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_employee ON public.hr_leaves (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_items_employee ON public.hr_payroll_items (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_items_payroll ON public.hr_payroll_items (payroll_id);
CREATE INDEX IF NOT EXISTS idx_inventory_kardex_creator ON public.inventory_kardex (created_by);
CREATE INDEX IF NOT EXISTS idx_inventory_kardex_product ON public.inventory_kardex (product_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON public.invoice_items (product_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant ON public.invoice_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_creator ON public.invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_parent ON public.invoices (parent_invoice_id);
CREATE INDEX IF NOT EXISTS idx_mrp_bom_product ON public.mrp_bom (product_id);
CREATE INDEX IF NOT EXISTS idx_mrp_bom_items_bom ON public.mrp_bom_items (bom_id);
CREATE INDEX IF NOT EXISTS idx_mrp_bom_items_raw_prod ON public.mrp_bom_items (raw_product_id);
CREATE INDEX IF NOT EXISTS idx_mrp_production_orders_bom ON public.mrp_production_orders (bom_id);
CREATE INDEX IF NOT EXISTS idx_mrp_production_orders_product ON public.mrp_production_orders (product_id);
CREATE INDEX IF NOT EXISTS idx_mrp_production_orders_wh ON public.mrp_production_orders (target_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_mrp_production_orders_wc ON public.mrp_production_orders (work_center_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_tenant ON public.payment_allocations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_gateway_events_tenant ON public.payment_gateway_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminder_log_invoice ON public.payment_reminder_log (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_reminder_log_tenant ON public.payment_reminder_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_creator ON public.payments (created_by);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_pm_milestones_project ON public.pm_milestones (project_id);
CREATE INDEX IF NOT EXISTS idx_pm_projects_customer ON public.pm_projects (customer_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_milestone ON public.pm_tasks (milestone_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_project ON public.pm_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_pm_timesheets_employee ON public.pm_timesheets (employee_id);
CREATE INDEX IF NOT EXISTS idx_pm_timesheets_task ON public.pm_timesheets (task_id);
CREATE INDEX IF NOT EXISTS idx_product_account_mappings_cos ON public.product_account_mappings (cost_of_sales_account_id);
CREATE INDEX IF NOT EXISTS idx_product_account_mappings_inv ON public.product_account_mappings (inventory_account_id);
CREATE INDEX IF NOT EXISTS idx_product_account_mappings_sales ON public.product_account_mappings (sales_account_id);
CREATE INDEX IF NOT EXISTS idx_product_account_mappings_tenant ON public.product_account_mappings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON public.product_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_product_category_account_mappings_cat ON public.product_category_account_mappings (category_id);
CREATE INDEX IF NOT EXISTS idx_product_category_account_mappings_cos ON public.product_category_account_mappings (cost_of_sales_account_id);
CREATE INDEX IF NOT EXISTS idx_product_category_account_mappings_inv ON public.product_category_account_mappings (inventory_account_id);
CREATE INDEX IF NOT EXISTS idx_product_category_account_mappings_sales ON public.product_category_account_mappings (sales_account_id);
CREATE INDEX IF NOT EXISTS idx_product_category_account_mappings_tenant ON public.product_category_account_mappings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_unit ON public.products (unit_id);
CREATE INDEX IF NOT EXISTS idx_qm_capa_actions_ncr ON public.qm_capa_actions (ncr_id);
CREATE INDEX IF NOT EXISTS idx_qm_inspections_cp ON public.qm_inspections (control_point_id);
CREATE INDEX IF NOT EXISTS idx_qm_inspections_product ON public.qm_inspections (product_id);
CREATE INDEX IF NOT EXISTS idx_qm_non_conformances_inspection ON public.qm_non_conformances (inspection_id);
CREATE INDEX IF NOT EXISTS idx_qm_non_conformances_product ON public.qm_non_conformances (product_id);
CREATE INDEX IF NOT EXISTS idx_qm_non_conformances_supplier ON public.qm_non_conformances (supplier_id);
CREATE INDEX IF NOT EXISTS idx_report_exports_creator ON public.report_exports (created_by);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON public.role_permissions (permission_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant ON public.role_permissions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_scm_goods_receipts_po ON public.scm_goods_receipts (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_scm_goods_receipts_supplier ON public.scm_goods_receipts (supplier_id);
CREATE INDEX IF NOT EXISTS idx_scm_goods_receipts_wh ON public.scm_goods_receipts (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_scm_purchase_order_items_order ON public.scm_purchase_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_scm_purchase_order_items_product ON public.scm_purchase_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_scm_purchase_orders_supplier ON public.scm_purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_scm_purchase_orders_wh ON public.scm_purchase_orders (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_creator ON public.stock_movements (created_by);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON public.stock_movements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_creator ON public.tenants (created_by);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON public.tenants (plan_id);
CREATE INDEX IF NOT EXISTS idx_user_access_requests_reviewer ON public.user_access_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_tenant ON public.warehouse_stock (tenant_id);
