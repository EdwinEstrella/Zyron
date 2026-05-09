-- Implementation of Multi-tenant Preferences & RBAC for Zyron.
-- This script expands the catalog and implements robust RLS.

-- 1. Granular Permissions Expansion
INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES
  ('customers.view', 'Ver clientes', 'Permite ver la lista y detalles de clientes.'),
  ('customers.manage', 'Gestionar clientes', 'Permite crear, editar y desactivar clientes.'),
  ('products.view', 'Ver productos/servicios', 'Permite ver el catalogo de productos.'),
  ('products.manage', 'Gestionar productos/servicios', 'Permite crear y editar el catalogo y stock.'),
  ('invoices.view', 'Ver facturas', 'Permite ver el listado y detalles de facturas.'),
  ('invoices.manage', 'Gestionar facturas', 'Permite emitir, editar y anular facturas.'),
  ('estimates.view', 'Ver presupuestos', 'Permite ver presupuestos emitidos.'),
  ('estimates.manage', 'Gestionar presupuestos', 'Permite crear, editar y convertir presupuestos.'),
  ('payments.view', 'Ver pagos', 'Permite ver el historial de pagos.'),
  ('payments.manage', 'Gestionar pagos', 'Permite registrar y anular pagos.'),
  ('expenses.view', 'Ver gastos', 'Permite ver el registro de gastos.'),
  ('expenses.manage', 'Gestionar gastos', 'Permite registrar y categorizar gastos.'),
  ('settings.manage', 'Gestionar configuracion', 'Permite cambiar preferencias y parametros de la empresa.'),
  ('users.manage', 'Gestionar usuarios/roles', 'Permite administrar el equipo y sus accesos.')
ON CONFLICT (permission_key) DO UPDATE
SET label = excluded.label,
    description = excluded.description;

-- 2. Role System Presets Refinement
DELETE FROM public.role_system_presets;
INSERT INTO public.role_system_presets (role_key, label, hierarchy_level, permission_keys, sort_order)
VALUES
  ('tenant_admin', 'Administrador', 10, 
    ARRAY['customers.view','customers.manage','products.view','products.manage','invoices.view','invoices.manage','estimates.view','estimates.manage','payments.view','payments.manage','expenses.view','expenses.manage','reports.view','settings.manage','users.manage','fiscal.manage'], 10),
  ('manager', 'Gerente', 20, 
    ARRAY['customers.view','customers.manage','products.view','products.manage','invoices.view','invoices.manage','estimates.view','estimates.manage','payments.view','payments.manage','expenses.view','expenses.manage','reports.view','settings.manage','fiscal.manage'], 20),
  ('billing_agent', 'Facturador', 30, 
    ARRAY['customers.view','products.view','invoices.view','invoices.manage','estimates.view','estimates.manage','payments.view','payments.manage','fiscal.manage'], 30),
  ('inventory_agent', 'Almacenista', 40, 
    ARRAY['products.view','products.manage'], 40),
  ('viewer', 'Auditor/Lectura', 50, 
    ARRAY['customers.view','products.view','invoices.view','estimates.view','reports.view'], 50);

-- 3. Security Helper Functions
-- We use SECURITY DEFINER to bypass RLS during the check itself to avoid recursion.

CREATE OR REPLACE FUNCTION public.check_user_permission(p_tenant_id uuid, p_permission_key text)
RETURNS boolean AS $$
DECLARE
  v_has_permission boolean;
  v_user_role text;
BEGIN
  -- 1. Get user role for this tenant
  SELECT role_key INTO v_user_role
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())
    AND status = 'active';

  IF v_user_role IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Check if the role (system preset) has the permission
  SELECT (p_permission_key = ANY(permission_keys)) INTO v_has_permission
  FROM public.role_system_presets
  WHERE role_key = v_user_role;

  RETURN COALESCE(v_has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Apply RLS to Core Tables
-- First, enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 5. Policies
DROP POLICY IF EXISTS "tenant_access" ON public.tenants;
CREATE POLICY "tenant_access" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "customers_read" ON public.customers;
CREATE POLICY "customers_read" ON public.customers
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
         AND public.check_user_permission(tenant_id, 'customers.view'));

DROP POLICY IF EXISTS "customers_write" ON public.customers;
CREATE POLICY "customers_write" ON public.customers
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
         AND public.check_user_permission(tenant_id, 'customers.manage'))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
              AND public.check_user_permission(tenant_id, 'customers.manage'));

DROP POLICY IF EXISTS "products_read" ON public.products;
CREATE POLICY "products_read" ON public.products
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
         AND public.check_user_permission(tenant_id, 'products.view'));

DROP POLICY IF EXISTS "products_write" ON public.products;
CREATE POLICY "products_write" ON public.products
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
         AND public.check_user_permission(tenant_id, 'products.manage'))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
              AND public.check_user_permission(tenant_id, 'products.manage'));

DROP POLICY IF EXISTS "invoices_read" ON public.invoices;
CREATE POLICY "invoices_read" ON public.invoices
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
         AND public.check_user_permission(tenant_id, 'invoices.view'));

DROP POLICY IF EXISTS "invoices_write" ON public.invoices;
CREATE POLICY "invoices_write" ON public.invoices
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
         AND public.check_user_permission(tenant_id, 'invoices.manage'))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
              AND public.check_user_permission(tenant_id, 'invoices.manage'));

DROP POLICY IF EXISTS "settings_read" ON public.app_settings;
CREATE POLICY "settings_read" ON public.app_settings
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
         OR tenant_id IS NULL);

DROP POLICY IF EXISTS "settings_write" ON public.app_settings;
CREATE POLICY "settings_write" ON public.app_settings
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
         AND public.check_user_permission(tenant_id, 'settings.manage'))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE app_user_id = (SELECT id FROM public.app_users WHERE auth_user_id = auth.uid())) 
              AND public.check_user_permission(tenant_id, 'settings.manage'));

-- 6. Default Preferences Trigger
CREATE OR REPLACE FUNCTION public.initialize_tenant_preferences()
RETURNS TRIGGER AS $$
BEGIN
  -- Default Language
  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value)
  VALUES (NEW.id, 'preferences.language', 'es', '{"code": "es", "name": "Spanish"}'::jsonb);

  -- Default Currency
  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value)
  VALUES (NEW.id, 'preferences.currency', 'DOP', '{"code": "DOP", "symbol": "$", "name": "Peso Dominicano"}'::jsonb);

  -- Default Timezone
  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value)
  VALUES (NEW.id, 'preferences.timezone', 'America/Santo_Domingo', '"America/Santo_Domingo"'::jsonb);

  -- Default Fiscal Year
  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value)
  VALUES (NEW.id, 'preferences.fiscal_year', '1-12', '"1-12"'::jsonb);

  -- Initialize Fiscal Settings (from tax_compliance_module)
  INSERT INTO public.tenant_fiscal_settings (tenant_id, country_code, tax_label, default_tax_rate, ncf_enabled)
  VALUES (NEW.id, 'DO', 'ITBIS', 18, true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_initialize_tenant_preferences ON public.tenants;
CREATE TRIGGER tr_initialize_tenant_preferences
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.initialize_tenant_preferences();
