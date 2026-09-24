-- Fix app_users and user_access_requests RLS so regular authenticated users can read/update their own profile
DROP POLICY IF EXISTS "users_read_own_app_user" ON public.app_users;
CREATE POLICY "users_read_own_app_user" ON public.app_users
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()::text 
    OR (auth_user_id IS NULL AND lower(email) = lower(coalesce(auth.jwt()->>'email', '')))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "users_update_own_app_user" ON public.app_users;
CREATE POLICY "users_update_own_app_user" ON public.app_users
  FOR UPDATE TO authenticated
  USING (
    auth_user_id = auth.uid()::text 
    OR (auth_user_id IS NULL AND lower(email) = lower(coalesce(auth.jwt()->>'email', '')))
    OR public.is_super_admin()
  )
  WITH CHECK (
    auth_user_id = auth.uid()::text 
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "users_insert_own_app_user" ON public.app_users;
CREATE POLICY "users_insert_own_app_user" ON public.app_users
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_id = auth.uid()::text 
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "users_insert_own_access_request" ON public.user_access_requests;
CREATE POLICY "users_insert_own_access_request" ON public.user_access_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "users_read_own_access_request" ON public.user_access_requests;
CREATE POLICY "users_read_own_access_request" ON public.user_access_requests
  FOR SELECT TO authenticated
  USING (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
    OR public.is_super_admin()
  );
