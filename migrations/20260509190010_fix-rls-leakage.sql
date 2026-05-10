-- Fix Data Leakage: Add missing tenant_id columns and enable RLS on all vulnerable tables

-- 1. Add missing tenant_id columns and backfill
ALTER TABLE public.warehouse_stock
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE;

UPDATE public.warehouse_stock ws
SET tenant_id = w.tenant_id
FROM public.warehouses w
WHERE ws.warehouse_id = w.id;

ALTER TABLE public.role_permissions
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE;

UPDATE public.role_permissions rp
SET tenant_id = r.tenant_id
FROM public.role_catalog r
WHERE rp.role_id = r.id;

-- 2. Enable RLS on all vulnerable tables
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_kardex ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateway_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_segment_members ENABLE ROW LEVEL SECURITY;

-- 3. Create Tenant Isolation Policies (Read/Write for their own tenant)
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.tenant_memberships;
CREATE POLICY "tenant_isolation_policy" ON public.tenant_memberships FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.role_catalog;
CREATE POLICY "tenant_isolation_policy" ON public.role_catalog FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.role_permissions;
CREATE POLICY "tenant_isolation_policy" ON public.role_permissions FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.warehouses;
CREATE POLICY "tenant_isolation_policy" ON public.warehouses FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.inventory_kardex;
CREATE POLICY "tenant_isolation_policy" ON public.inventory_kardex FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.warehouse_stock;
CREATE POLICY "tenant_isolation_policy" ON public.warehouse_stock FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.payment_methods_catalog;
CREATE POLICY "tenant_isolation_policy" ON public.payment_methods_catalog FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.payment_allocations;
CREATE POLICY "tenant_isolation_policy" ON public.payment_allocations FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.payment_gateway_events;
CREATE POLICY "tenant_isolation_policy" ON public.payment_gateway_events FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.payment_reminder_log;
CREATE POLICY "tenant_isolation_policy" ON public.payment_reminder_log FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.invoice_series;
CREATE POLICY "tenant_isolation_policy" ON public.invoice_series FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.tax_rates_catalog;
CREATE POLICY "tenant_isolation_policy" ON public.tax_rates_catalog FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.customer_segments;
CREATE POLICY "tenant_isolation_policy" ON public.customer_segments FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.customer_segment_members;
CREATE POLICY "tenant_isolation_policy" ON public.customer_segment_members FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)));

-- 4. Add Project Admin fallback policies
DROP POLICY IF EXISTS "project_admin_policy" ON public.tenant_memberships;
CREATE POLICY "project_admin_policy" ON public.tenant_memberships FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.role_catalog;
CREATE POLICY "project_admin_policy" ON public.role_catalog FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.role_permissions;
CREATE POLICY "project_admin_policy" ON public.role_permissions FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.warehouses;
CREATE POLICY "project_admin_policy" ON public.warehouses FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.inventory_kardex;
CREATE POLICY "project_admin_policy" ON public.inventory_kardex FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.warehouse_stock;
CREATE POLICY "project_admin_policy" ON public.warehouse_stock FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.payment_methods_catalog;
CREATE POLICY "project_admin_policy" ON public.payment_methods_catalog FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.payment_allocations;
CREATE POLICY "project_admin_policy" ON public.payment_allocations FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.payment_gateway_events;
CREATE POLICY "project_admin_policy" ON public.payment_gateway_events FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.payment_reminder_log;
CREATE POLICY "project_admin_policy" ON public.payment_reminder_log FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.invoice_series;
CREATE POLICY "project_admin_policy" ON public.invoice_series FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.tax_rates_catalog;
CREATE POLICY "project_admin_policy" ON public.tax_rates_catalog FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.customer_segments;
CREATE POLICY "project_admin_policy" ON public.customer_segments FOR ALL TO project_admin USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "project_admin_policy" ON public.customer_segment_members;
CREATE POLICY "project_admin_policy" ON public.customer_segment_members FOR ALL TO project_admin USING (true) WITH CHECK (true);
