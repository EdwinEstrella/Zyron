-- Fix infinite recursion in tenant_memberships RLS policy by using a SECURITY DEFINER function

CREATE OR REPLACE FUNCTION get_user_tenants()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_memberships
  WHERE app_user_id = (
    SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text
  );
$$;

-- tenant_memberships
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.tenant_memberships;
CREATE POLICY "tenant_isolation_policy" ON public.tenant_memberships FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- role_catalog
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.role_catalog;
CREATE POLICY "tenant_isolation_policy" ON public.role_catalog FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- role_permissions
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.role_permissions;
CREATE POLICY "tenant_isolation_policy" ON public.role_permissions FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- warehouses
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.warehouses;
CREATE POLICY "tenant_isolation_policy" ON public.warehouses FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- inventory_kardex
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.inventory_kardex;
CREATE POLICY "tenant_isolation_policy" ON public.inventory_kardex FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- warehouse_stock
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.warehouse_stock;
CREATE POLICY "tenant_isolation_policy" ON public.warehouse_stock FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- payment_methods_catalog
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.payment_methods_catalog;
CREATE POLICY "tenant_isolation_policy" ON public.payment_methods_catalog FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- payment_allocations
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.payment_allocations;
CREATE POLICY "tenant_isolation_policy" ON public.payment_allocations FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- payment_gateway_events
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.payment_gateway_events;
CREATE POLICY "tenant_isolation_policy" ON public.payment_gateway_events FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- payment_reminder_log
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.payment_reminder_log;
CREATE POLICY "tenant_isolation_policy" ON public.payment_reminder_log FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- invoice_series
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.invoice_series;
CREATE POLICY "tenant_isolation_policy" ON public.invoice_series FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- tax_rates_catalog
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.tax_rates_catalog;
CREATE POLICY "tenant_isolation_policy" ON public.tax_rates_catalog FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- customer_segments
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.customer_segments;
CREATE POLICY "tenant_isolation_policy" ON public.customer_segments FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- customer_segment_members
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.customer_segment_members;
CREATE POLICY "tenant_isolation_policy" ON public.customer_segment_members FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- Update core tables as well to avoid infinite recursion
DROP POLICY IF EXISTS "tenant_access" ON public.tenants;
CREATE POLICY "tenant_access" ON public.tenants FOR SELECT TO authenticated
USING (id IN (SELECT get_user_tenants()));

DROP POLICY IF EXISTS "customers_read" ON public.customers;
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'customers.view'));

DROP POLICY IF EXISTS "customers_write" ON public.customers;
CREATE POLICY "customers_write" ON public.customers FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'customers.manage'))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'customers.manage'));

DROP POLICY IF EXISTS "products_read" ON public.products;
CREATE POLICY "products_read" ON public.products FOR SELECT TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'products.view'));

DROP POLICY IF EXISTS "products_write" ON public.products;
CREATE POLICY "products_write" ON public.products FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'products.manage'))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'products.manage'));

DROP POLICY IF EXISTS "invoices_read" ON public.invoices;
CREATE POLICY "invoices_read" ON public.invoices FOR SELECT TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'invoices.view'));

DROP POLICY IF EXISTS "invoices_write" ON public.invoices;
CREATE POLICY "invoices_write" ON public.invoices FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'invoices.manage'))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'invoices.manage'));

DROP POLICY IF EXISTS "settings_read" ON public.app_settings;
CREATE POLICY "settings_read" ON public.app_settings FOR SELECT TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()) OR tenant_id IS NULL);

DROP POLICY IF EXISTS "settings_write" ON public.app_settings;
CREATE POLICY "settings_write" ON public.app_settings FOR ALL TO authenticated
USING (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'settings.manage'))
WITH CHECK (tenant_id IN (SELECT get_user_tenants()) AND public.check_user_permission(tenant_id, 'settings.manage'));
