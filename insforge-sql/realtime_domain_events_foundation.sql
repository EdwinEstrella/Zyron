-- Realtime domain-event foundation for Zyron.
-- Apply this with InsForge SQL tooling after PR 2 is reviewed.
-- It intentionally adds only channel permissions/patterns; fiscal/accounting schemas are out of scope for this slice.

INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES
  ('realtime.domain_events.view', 'Ver eventos realtime', 'Permite suscribirse a eventos realtime del tenant activo.'),
  ('realtime.domain_events.publish', 'Publicar eventos realtime', 'Permite publicar eventos de refresco para el tenant activo.')
ON CONFLICT (permission_key) DO UPDATE
SET label = excluded.label,
    description = excluded.description;

UPDATE public.role_system_presets
SET permission_keys = ARRAY(
  SELECT DISTINCT key
  FROM unnest(permission_keys || ARRAY['realtime.domain_events.view']) AS key
)
WHERE role_key IN ('tenant_admin', 'manager', 'billing_agent', 'inventory_agent', 'viewer');

UPDATE public.role_system_presets
SET permission_keys = ARRAY(
  SELECT DISTINCT key
  FROM unnest(permission_keys || ARRAY['realtime.domain_events.publish']) AS key
)
WHERE role_key IN ('tenant_admin', 'manager', 'billing_agent', 'inventory_agent');

-- InsForge deployments expose realtime channel configuration as `realtime.channels`.
-- The DO block keeps this migration safe in local/dev environments where that schema has not been created yet.
DO $$
BEGIN
  IF to_regclass('realtime.channels') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO realtime.channels (pattern, description, enabled)
      VALUES
        ('tenant:*:alerts', 'Tenant-scoped legacy alerts channel used by the current UI.', true),
        ('tenant:*:domain-events', 'Tenant-scoped domain refresh events for invoices, payments, inventory, fiscal, and accounting modules.', true),
        ('super-admin:alerts', 'Super admin operational alerts.', true)
      ON CONFLICT (pattern) DO UPDATE
      SET description = excluded.description,
          enabled = true
    $sql$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_use_tenant_realtime_channel(p_tenant_id uuid, p_permission_key text DEFAULT 'realtime.domain_events.view')
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.app_users au ON au.id = tm.app_user_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND au.auth_user_id = auth.uid()
  ) AND public.check_user_permission(p_tenant_id, p_permission_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
