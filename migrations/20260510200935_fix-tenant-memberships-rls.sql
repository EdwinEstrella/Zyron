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
