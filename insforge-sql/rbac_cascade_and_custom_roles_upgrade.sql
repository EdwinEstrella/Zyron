-- RBAC upgrade for custom role permissions + cascaded permission checks.
-- Apply with:
-- $sql = Get-Content 'insforge-sql/rbac_cascade_and_custom_roles_upgrade.sql' -Raw
-- npx @insforge/cli db query $sql

CREATE OR REPLACE FUNCTION public.permission_satisfies(granted_key text, requested_key text)
RETURNS boolean AS $$
BEGIN
  IF granted_key IS NULL OR requested_key IS NULL THEN
    RETURN false;
  END IF;

  IF granted_key = requested_key THEN
    RETURN true;
  END IF;

  -- Cascade: *.manage implies *.view
  IF right(granted_key, 7) = '.manage'
     AND requested_key = regexp_replace(granted_key, '\.manage$', '.view') THEN
    RETURN true;
  END IF;

  -- Cascade: *.delete implies *.manage and *.view when those keys exist in the catalog
  IF right(granted_key, 7) = '.delete'
     AND (
       requested_key = regexp_replace(granted_key, '\.delete$', '.manage')
       OR requested_key = regexp_replace(granted_key, '\.delete$', '.view')
     ) THEN
    RETURN true;
  END IF;

  -- Cascade: *.edit implies *.view
  IF right(granted_key, 5) = '.edit'
     AND requested_key = regexp_replace(granted_key, '\.edit$', '.view') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.check_user_permission(p_tenant_id uuid, p_permission_key text)
RETURNS boolean AS $$
DECLARE
  v_has_permission boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_permission_key IS NULL THEN
    RETURN false;
  END IF;

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
    LEFT JOIN public.role_system_presets rsp
      ON rsp.role_key = rc.role_key
    WHERE tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND tm.app_user_id = (
        SELECT id
        FROM public.app_users
        WHERE auth_user_id = auth.uid()
        LIMIT 1
      )
      AND (
        public.permission_satisfies(pc.permission_key, p_permission_key)
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(rsp.permission_keys, ARRAY[]::text[])) AS granted_key
          WHERE public.permission_satisfies(granted_key, p_permission_key)
        )
      )
  ) INTO v_has_permission;

  RETURN COALESCE(v_has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
