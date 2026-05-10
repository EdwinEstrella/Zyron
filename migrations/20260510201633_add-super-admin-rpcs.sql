-- Missing RPCs for Super Admin
CREATE OR REPLACE FUNCTION public.super_admin_list_user_access_requests()
RETURNS SETOF public.user_access_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.user_access_requests ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_app_users()
RETURNS SETOF public.app_users
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.app_users ORDER BY created_at DESC;
$$;
