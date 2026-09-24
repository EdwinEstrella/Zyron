-- Migración para soporte de rol Staff y asistencia a clientes (Issue #16 y #18)
-- Permite que los usuarios con rol 'staff' y 'super_admin' tengan acceso global al panel de soporte.
-- Además actualiza las funciones de seguridad para facilitar la asistencia de impersonación.

-- 1. Redefinir la función is_super_admin para incluir a 'staff' en las validaciones de RLS globales.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users 
    WHERE auth_user_id = auth.uid()::text 
    AND global_role IN ('super_admin', 'staff')
    AND status = 'active'
  );
$$;

-- 2. Crear una función específica para validaciones estrictas de Super Administrador (sin Staff).
CREATE OR REPLACE FUNCTION public.is_strict_super_admin()
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

-- 3. Redefinir check_user_permission para otorgar acceso al personal de soporte y mantener soporte de roles custom y cascada.
CREATE OR REPLACE FUNCTION public.check_user_permission(p_tenant_id uuid, p_permission_key text)
RETURNS boolean AS $$
DECLARE
  v_has_permission boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  -- Si el usuario actual es de soporte (Super Admin o Staff), tiene acceso total para asistir al cliente.
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  -- 1. Verificar si un rol personalizado del tenant le otorga el permiso (o por cascada)
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.role_catalog rc
      ON rc.tenant_id = tm.tenant_id
     AND rc.role_key = tm.role_key
    LEFT JOIN public.role_permissions rp
      ON rp.role_id = rc.id
    LEFT JOIN public.permission_catalog pc
      ON pc.id = rp.permission_id
    JOIN public.app_users au
      ON au.id = tm.app_user_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND au.auth_user_id = auth.uid()::text
      AND public.permission_satisfies(pc.permission_key, p_permission_key)
  ) INTO v_has_permission;

  IF v_has_permission THEN
    RETURN true;
  END IF;

  -- 2. Verificar presets de sistema (o por cascada)
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.role_system_presets rsp
      ON rsp.role_key = tm.role_key
    JOIN public.app_users au
      ON au.id = tm.app_user_id
    CROSS JOIN LATERAL unnest(rsp.permission_keys) AS granted_key(key)
    WHERE tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND au.auth_user_id = auth.uid()::text
      AND public.permission_satisfies(granted_key.key, p_permission_key)
  ) INTO v_has_permission;

  RETURN COALESCE(v_has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
