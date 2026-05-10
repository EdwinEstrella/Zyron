-- Fix fallback for super admin when edge function fails
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users 
    WHERE auth_user_id = auth.uid()::text 
    AND global_role = 'super_admin'
    AND status = 'active'
  );
$$;

-- Tenants
DROP POLICY IF EXISTS "super_admin_all_tenants" ON public.tenants;
CREATE POLICY "super_admin_all_tenants" ON public.tenants FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Tenant memberships
DROP POLICY IF EXISTS "super_admin_all_memberships" ON public.tenant_memberships;
CREATE POLICY "super_admin_all_memberships" ON public.tenant_memberships FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- App users
DROP POLICY IF EXISTS "super_admin_all_users" ON public.app_users;
CREATE POLICY "super_admin_all_users" ON public.app_users FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- User access requests
DROP POLICY IF EXISTS "super_admin_all_requests" ON public.user_access_requests;
CREATE POLICY "super_admin_all_requests" ON public.user_access_requests FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Audit logs
DROP POLICY IF EXISTS "super_admin_all_audit" ON public.audit_logs;
CREATE POLICY "super_admin_all_audit" ON public.audit_logs FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());
