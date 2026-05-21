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

-- 3. Redefinir la función check_user_permission para otorgar acceso automático al personal de soporte (Super Admin y Staff).
CREATE OR REPLACE FUNCTION public.check_user_permission(p_tenant_id uuid, p_permission_key text)
RETURNS boolean AS $$
DECLARE
  v_has_permission boolean;
  v_user_role text;
BEGIN
  -- Si el usuario actual es de soporte (Super Admin o Staff), tiene acceso total para asistir al cliente.
  IF public.is_super_admin() THEN
    RETURN true;
  END IF;

  -- 1. Obtener el rol del usuario para esta empresa
  SELECT role_key INTO v_user_role
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()::text)
    AND status = 'active';

  IF v_user_role IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Verificar si el rol tiene asignado el permiso correspondiente
  SELECT (p_permission_key = ANY(permission_keys)) INTO v_has_permission
  FROM public.role_system_presets
  WHERE role_key = v_user_role;

  RETURN COALESCE(v_has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
