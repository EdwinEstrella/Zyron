-- ============================================================================
-- Zyron: Core Schema Foundation for Supabase
-- Consolidated baseline schema with Multi-tenant isolation, RBAC and Preferences
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Identity & Tenant Model
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id text UNIQUE,
  email text NOT NULL UNIQUE,
  full_name text,
  global_role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_users_auth_user_id_idx ON public.app_users (auth_user_id);
CREATE INDEX IF NOT EXISTS app_users_status_role_idx ON public.app_users (status, global_role);

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE,
  display_name text,
  legal_name text,
  tax_id text,
  email text,
  phone text,
  address text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  app_user_id uuid NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  role_key text NOT NULL DEFAULT 'tenant_admin',
  status text NOT NULL DEFAULT 'active',
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, app_user_id)
);

CREATE INDEX IF NOT EXISTS tenant_memberships_user_idx ON public.tenant_memberships (app_user_id, status);

CREATE TABLE IF NOT EXISTS public.user_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  requested_email text,
  username text,
  full_name text,
  company_name text,
  phone text,
  notes text,
  requested_role text,
  status text NOT NULL DEFAULT 'pending',
  request_status text NOT NULL DEFAULT 'pending',
  request_payload jsonb NOT NULL DEFAULT '{}',
  reviewed_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_access_requests_status_idx ON public.user_access_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS user_access_requests_request_status_idx ON public.user_access_requests (request_status, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. Navigation, Roles & Permissions
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_navigation_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  label text NOT NULL,
  icon text NOT NULL,
  scope text NOT NULL DEFAULT 'tenant',
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, module_key)
);

CREATE TABLE IF NOT EXISTS public.permission_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_system_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE,
  label text NOT NULL,
  hierarchy_level integer NOT NULL DEFAULT 50,
  permission_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  hierarchy_level integer NOT NULL DEFAULT 50,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.role_catalog (id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permission_catalog (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value text,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, setting_key)
);

-- ----------------------------------------------------------------------------
-- 3. Customers & Segments
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  country text,
  tax_id text,
  notes text,
  internal_notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_tenant_name_idx ON public.customers (tenant_id, name);

CREATE TABLE IF NOT EXISTS public.customer_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS customer_segments_tenant_idx ON public.customer_segments (tenant_id);

CREATE TABLE IF NOT EXISTS public.customer_segment_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  segment_id uuid NOT NULL REFERENCES public.customer_segments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, segment_id)
);

CREATE INDEX IF NOT EXISTS customer_segment_members_customer_idx ON public.customer_segment_members (customer_id);
CREATE INDEX IF NOT EXISTS customer_segment_members_segment_idx ON public.customer_segment_members (segment_id);

-- ----------------------------------------------------------------------------
-- 4. Products, Categories & Measurement Units
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  parent_id uuid REFERENCES public.product_categories (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS product_categories_tenant_idx ON public.product_categories (tenant_id);

CREATE TABLE IF NOT EXISTS public.measurement_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  symbol text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS measurement_units_tenant_idx ON public.measurement_units (tenant_id);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.product_categories (id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.measurement_units (id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  description text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  cost_price numeric(14,2),
  stock numeric(14,2) NOT NULL DEFAULT 0,
  item_kind text NOT NULL DEFAULT 'product',
  tax_rate_default numeric(7,3) DEFAULT 18,
  discount_default numeric(7,3) DEFAULT 0,
  tracks_stock boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS products_tenant_name_idx ON public.products (tenant_id, name);

-- ----------------------------------------------------------------------------
-- 5. Inventory, Warehouses & Kardex
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS warehouses_tenant_idx ON public.warehouses (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default_per_tenant ON public.warehouses (tenant_id) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS warehouse_stock_product_idx ON public.warehouse_stock (product_id);

CREATE TABLE IF NOT EXISTS public.inventory_kardex (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses (id) ON DELETE SET NULL,
  movement_type text NOT NULL,
  quantity numeric NOT NULL,
  unit_cost numeric,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_kardex_tenant_created_idx ON public.inventory_kardex (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_kardex_wh_idx ON public.inventory_kardex (warehouse_id);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  movement_type text NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. Invoices, Estimates & Series
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invoice_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  label text,
  next_number integer NOT NULL DEFAULT 1,
  padding integer NOT NULL DEFAULT 6,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  parent_invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  series text NOT NULL DEFAULT 'BOR',
  number text NOT NULL,
  invoice_type text NOT NULL DEFAULT 'standard',
  currency text NOT NULL DEFAULT 'DOP',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  due_date timestamptz,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  recurrence_rule jsonb,
  created_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_tenant_created_idx ON public.invoices (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(7,3) NOT NULL DEFAULT 0,
  tax_rate numeric(7,3) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  line_kind text NOT NULL DEFAULT 'service',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON public.invoice_items (invoice_id);

-- ----------------------------------------------------------------------------
-- 7. Payments & Allocations
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_methods_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'DOP',
  status text NOT NULL DEFAULT 'completed',
  payment_date date NOT NULL DEFAULT current_date,
  method text,
  payment_method_code text,
  reference text,
  gateway_provider text,
  gateway_transaction_id text,
  reconciliation_status text NOT NULL DEFAULT 'unmatched',
  matched_bank_reference text,
  unallocated_amount numeric(14,2),
  notes text,
  created_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_tenant_created_idx ON public.payments (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  allocated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx ON public.payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_invoice_idx ON public.payment_allocations (invoice_id);

CREATE TABLE IF NOT EXISTS public.payment_gateway_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  recipient text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT true,
  error_message text
);

-- ----------------------------------------------------------------------------
-- 8. Fiscal Settings, NCF & Tax Compliance
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants (id) ON DELETE CASCADE,
  country_code text NOT NULL DEFAULT 'DO',
  tax_label text NOT NULL DEFAULT 'ITBIS',
  default_tax_rate numeric NOT NULL DEFAULT 18,
  prices_tax_inclusive boolean NOT NULL DEFAULT false,
  ncf_enabled boolean NOT NULL DEFAULT false,
  electronic_invoicing_requested boolean NOT NULL DEFAULT false,
  company_rnc text,
  company_legal_name text,
  fiscal_notes text,
  compliance_ack_at timestamptz,
  withholding_isr_on_subtotal_pct numeric NOT NULL DEFAULT 0,
  withholding_itbis_on_tax_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_rates_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  rate_percent numeric NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS tax_rates_catalog_tenant_idx ON public.tax_rates_catalog (tenant_id);

CREATE TABLE IF NOT EXISTS public.ncf_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  ncf_type text NOT NULL,
  invoice_series_match text NOT NULL,
  prefix text NOT NULL,
  correlative_width integer NOT NULL DEFAULT 8,
  next_correlative bigint NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_series_match)
);

-- ----------------------------------------------------------------------------
-- 9. Reports & Audit
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  report_type text NOT NULL,
  format text NOT NULL DEFAULT 'csv',
  file_url text,
  meta jsonb,
  created_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_exports_tenant_created_idx ON public.report_exports (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.custom_report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  dataset_key text NOT NULL,
  column_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS custom_report_definitions_tenant_idx ON public.custom_report_definitions (tenant_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON public.audit_logs (tenant_id, target_type, target_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 10. Helper Functions, Preferences & Sequences
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.zyron_next_invoice_number(p_tenant_id uuid, p_series text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_pad integer;
BEGIN
  INSERT INTO public.invoice_series (tenant_id, code, label, next_number, padding, is_default)
  VALUES (p_tenant_id, p_series, p_series, 1, 6, false)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  UPDATE public.invoice_series
  SET next_number = next_number + 1
  WHERE tenant_id = p_tenant_id AND code = p_series
  RETURNING (next_number - 1), padding INTO v_next, v_pad;

  IF v_next IS NULL THEN
    v_next := 1;
    v_pad := 6;
  END IF;

  RETURN lpad(v_next::text, greatest(coalesce(v_pad, 6), 1), '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.permission_satisfies(granted_key text, requested_key text)
RETURNS boolean AS $$
BEGIN
  IF granted_key IS NULL OR requested_key IS NULL THEN
    RETURN false;
  END IF;

  IF granted_key = requested_key THEN
    RETURN true;
  END IF;

  IF right(granted_key, 7) = '.manage'
     AND requested_key = regexp_replace(granted_key, '\.manage$', '.view') THEN
    RETURN true;
  END IF;

  IF right(granted_key, 7) = '.delete'
     AND (
       requested_key = regexp_replace(granted_key, '\.delete$', '.manage')
       OR requested_key = regexp_replace(granted_key, '\.delete$', '.view')
     ) THEN
    RETURN true;
  END IF;

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

CREATE OR REPLACE FUNCTION public.can_use_tenant_realtime_channel(p_tenant_id uuid, p_permission_key text DEFAULT 'realtime.domain_events.view')
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.app_users au ON au.id = tm.app_user_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND au.auth_user_id = auth.uid()::text
  ) AND public.check_user_permission(p_tenant_id, p_permission_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.initialize_tenant_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value)
  VALUES (NEW.id, 'preferences.language', 'es', '{"code": "es", "name": "Spanish"}'::jsonb)
  ON CONFLICT (tenant_id, setting_key) DO NOTHING;

  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value)
  VALUES (NEW.id, 'preferences.currency', 'DOP', '{"code": "DOP", "symbol": "$", "name": "Peso Dominicano"}'::jsonb)
  ON CONFLICT (tenant_id, setting_key) DO NOTHING;

  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value)
  VALUES (NEW.id, 'preferences.timezone', 'America/Santo_Domingo', '"America/Santo_Domingo"'::jsonb)
  ON CONFLICT (tenant_id, setting_key) DO NOTHING;

  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value)
  VALUES (NEW.id, 'preferences.fiscal_year', '1-12', '"1-12"'::jsonb)
  ON CONFLICT (tenant_id, setting_key) DO NOTHING;

  INSERT INTO public.tenant_fiscal_settings (tenant_id, country_code, tax_label, default_tax_rate, ncf_enabled)
  VALUES (NEW.id, 'DO', 'ITBIS', 18, true)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_initialize_tenant_preferences ON public.tenants;
CREATE TRIGGER tr_initialize_tenant_preferences
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.initialize_tenant_preferences();

-- ----------------------------------------------------------------------------
-- 11. Initial Catalogs & System Presets Seed
-- ----------------------------------------------------------------------------

INSERT INTO public.app_navigation_modules (module_key, label, icon, scope, sort_order, is_active)
VALUES
  ('empresas', 'Empresas', 'apartment', 'super_admin', 10, true),
  ('solicitudes', 'Solicitudes', 'inbox', 'super_admin', 20, true),
  ('acceso', 'Acceso', 'shield_person', 'super_admin', 30, true),
  ('roles', 'Roles', 'admin_panel_settings', 'super_admin', 40, true),
  ('panel', 'Panel principal', 'dashboard', 'tenant', 10, true),
  ('facturas', 'Facturas', 'receipt_long', 'tenant', 20, true),
  ('presupuestos', 'Presupuestos', 'request_quote', 'tenant', 25, true),
  ('pagos', 'Pagos y cobros', 'payments', 'tenant', 30, true),
  ('inventario', 'Inventario', 'inventory_2', 'tenant', 40, true),
  ('clientes', 'Clientes', 'groups', 'tenant', 50, true),
  ('reportes', 'Reportes', 'monitoring', 'tenant', 60, true),
  ('fiscal', 'Fiscal', 'gavel', 'tenant', 70, true),
  ('config', 'Configuracion', 'settings', 'tenant', 80, true)
ON CONFLICT (scope, module_key) DO UPDATE
SET label = excluded.label,
    icon = excluded.icon,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES
  ('users.manage', 'Gestion de usuarios', 'Crear y mantener usuarios de la empresa.'),
  ('roles.manage', 'Gestion de roles', 'Administrar roles y permisos.'),
  ('billing.manage', 'Facturacion', 'Administrar facturas y documentos de venta.'),
  ('estimates.manage', 'Gestion de presupuestos', 'Crear, editar, emitir, aceptar/rechazar y convertir presupuestos sin envio de email.'),
  ('inventory.manage', 'Inventario', 'Administrar productos, servicios y stock.'),
  ('reports.view', 'Reportes', 'Consultar reportes.'),
  ('fiscal.manage', 'Fiscal / cumplimiento', 'Configurar impuestos, NCF y cumplimiento fiscal.'),
  ('customers.view', 'Ver clientes', 'Permite ver la lista y detalles de clientes.'),
  ('customers.manage', 'Gestionar clientes', 'Permite crear, editar y desactivar clientes.'),
  ('products.view', 'Ver productos/servicios', 'Permite ver el catalogo de productos.'),
  ('products.manage', 'Gestionar productos/servicios', 'Permite crear y editar el catalogo y stock.'),
  ('invoices.view', 'Ver facturas', 'Permite ver el listado y detalles de facturas.'),
  ('invoices.manage', 'Gestionar facturas', 'Permite emitir, editar y anular facturas.'),
  ('estimates.view', 'Ver presupuestos', 'Permite ver presupuestos emitidos.'),
  ('payments.view', 'Ver pagos', 'Permite ver el historial de pagos.'),
  ('payments.manage', 'Gestionar pagos', 'Permite registrar y anular pagos.'),
  ('expenses.view', 'Ver gastos', 'Permite ver el registro de gastos.'),
  ('expenses.manage', 'Gestionar gastos', 'Permite registrar y categorizar gastos.'),
  ('settings.manage', 'Gestionar configuracion', 'Permite cambiar preferencias y parametros de la empresa.'),
  ('realtime.domain_events.view', 'Ver eventos realtime', 'Permite suscribirse a eventos realtime del tenant activo.'),
  ('realtime.domain_events.publish', 'Publicar eventos realtime', 'Permite publicar eventos de refresco para el tenant activo.')
ON CONFLICT (permission_key) DO UPDATE
SET label = excluded.label,
    description = excluded.description;

INSERT INTO public.role_system_presets (role_key, label, hierarchy_level, permission_keys, sort_order, is_active)
VALUES
  ('tenant_admin', 'Administrador', 10, 
    ARRAY['customers.view','customers.manage','products.view','products.manage','invoices.view','invoices.manage','estimates.view','estimates.manage','payments.view','payments.manage','expenses.view','expenses.manage','reports.view','settings.manage','users.manage','roles.manage','billing.manage','inventory.manage','fiscal.manage','realtime.domain_events.view','realtime.domain_events.publish'], 10, true),
  ('manager', 'Gerente', 20, 
    ARRAY['customers.view','customers.manage','products.view','products.manage','invoices.view','invoices.manage','estimates.view','estimates.manage','payments.view','payments.manage','expenses.view','expenses.manage','reports.view','settings.manage','users.manage','billing.manage','inventory.manage','fiscal.manage','realtime.domain_events.view','realtime.domain_events.publish'], 20, true),
  ('billing_agent', 'Facturador', 30, 
    ARRAY['customers.view','products.view','invoices.view','invoices.manage','estimates.view','estimates.manage','payments.view','payments.manage','billing.manage','fiscal.manage','realtime.domain_events.view','realtime.domain_events.publish'], 30, true),
  ('inventory_agent', 'Almacenista', 40, 
    ARRAY['products.view','products.manage','inventory.manage','realtime.domain_events.view','realtime.domain_events.publish'], 40, true),
  ('viewer', 'Auditor/Lectura', 50, 
    ARRAY['customers.view','products.view','invoices.view','estimates.view','reports.view','realtime.domain_events.view'], 50, true)
ON CONFLICT (role_key) DO UPDATE
SET label = excluded.label,
    hierarchy_level = excluded.hierarchy_level,
    permission_keys = excluded.permission_keys,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;
