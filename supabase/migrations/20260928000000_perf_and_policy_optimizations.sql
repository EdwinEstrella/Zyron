-- ============================================================================
-- Zyron: Optimization for Performance & Security Advisors
-- 1. Covering index for accounting_accounts parent_account_id
-- 2. InitPlan optimization for auth.uid() -> (SELECT auth.uid()::text)
-- 3. Eliminate Multiple Permissive Policies on catalogs by splitting FOR ALL into mutation policies
-- 4. Fix overly permissive RLS on user_access_requests INSERT
-- ============================================================================

-- 1. Unindexed foreign key
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_parent ON public.accounting_accounts (parent_account_id);

-- 2. Split catalog admin policies from FOR ALL to INSERT/UPDATE/DELETE to prevent SELECT overlap
-- app_navigation_modules
DROP POLICY IF EXISTS "super_admin_manage_navigation_modules" ON public.app_navigation_modules;
CREATE POLICY "super_admin_insert_navigation_modules" ON public.app_navigation_modules FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin_update_navigation_modules" ON public.app_navigation_modules FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin_delete_navigation_modules" ON public.app_navigation_modules FOR DELETE TO authenticated USING (public.is_super_admin());

-- role_system_presets
DROP POLICY IF EXISTS "super_admin_manage_role_system_presets" ON public.role_system_presets;
CREATE POLICY "super_admin_insert_role_system_presets" ON public.role_system_presets FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin_update_role_system_presets" ON public.role_system_presets FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin_delete_role_system_presets" ON public.role_system_presets FOR DELETE TO authenticated USING (public.is_super_admin());

-- permission_catalog
DROP POLICY IF EXISTS "super_admin_manage_permission_catalog" ON public.permission_catalog;
CREATE POLICY "super_admin_insert_permission_catalog" ON public.permission_catalog FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin_update_permission_catalog" ON public.permission_catalog FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "super_admin_delete_permission_catalog" ON public.permission_catalog FOR DELETE TO authenticated USING (public.is_super_admin());

-- planes_servicio
DROP POLICY IF EXISTS "planes_servicio_admin" ON public.planes_servicio;
CREATE POLICY "planes_servicio_insert" ON public.planes_servicio FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "planes_servicio_update" ON public.planes_servicio FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "planes_servicio_delete" ON public.planes_servicio FOR DELETE TO authenticated USING (public.is_super_admin());

-- 3. Fix InitPlan: Wrap auth.uid() in (SELECT ...)
-- app_users
DROP POLICY IF EXISTS "app_users_select" ON public.app_users;
DROP POLICY IF EXISTS "app_users_insert" ON public.app_users;
DROP POLICY IF EXISTS "app_users_update" ON public.app_users;
CREATE POLICY "app_users_select" ON public.app_users FOR SELECT TO authenticated
USING ((SELECT public.is_super_admin()) OR auth_user_id = (SELECT auth.uid()::text));
CREATE POLICY "app_users_insert" ON public.app_users FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_super_admin()) OR auth_user_id = (SELECT auth.uid()::text));
CREATE POLICY "app_users_update" ON public.app_users FOR UPDATE TO authenticated
USING ((SELECT public.is_super_admin()) OR auth_user_id = (SELECT auth.uid()::text))
WITH CHECK ((SELECT public.is_super_admin()) OR auth_user_id = (SELECT auth.uid()::text));

-- user_access_requests
DROP POLICY IF EXISTS "user_access_requests_select" ON public.user_access_requests;
DROP POLICY IF EXISTS "user_access_requests_insert" ON public.user_access_requests;
CREATE POLICY "user_access_requests_select" ON public.user_access_requests FOR SELECT TO authenticated
USING ((SELECT public.is_super_admin()) OR email = (SELECT email FROM public.app_users WHERE auth_user_id = (SELECT auth.uid()::text)));
CREATE POLICY "user_access_requests_insert" ON public.user_access_requests FOR INSERT TO authenticated
WITH CHECK (email IS NOT NULL AND length(trim(email)) > 3);
