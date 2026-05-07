-- Zyron base schema for a fresh InsForge OSS database.
-- Run this first on a clean database, then run the advanced module SQL files.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  request_status text,
  request_payload jsonb NOT NULL DEFAULT '{}',
  reviewed_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  tax_id text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  description text,
  price numeric(14,2) NOT NULL DEFAULT 0,
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
  due_date date,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'DOP',
  status text NOT NULL DEFAULT 'completed',
  payment_date date NOT NULL DEFAULT current_date,
  method text,
  notes text,
  created_by uuid REFERENCES public.app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS app_users_auth_user_id_idx ON public.app_users (auth_user_id);
CREATE INDEX IF NOT EXISTS tenant_memberships_user_idx ON public.tenant_memberships (app_user_id, status);
CREATE INDEX IF NOT EXISTS customers_tenant_name_idx ON public.customers (tenant_id, name);
CREATE INDEX IF NOT EXISTS products_tenant_name_idx ON public.products (tenant_id, name);
CREATE INDEX IF NOT EXISTS invoices_tenant_created_idx ON public.invoices (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS payments_tenant_created_idx ON public.payments (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON public.audit_logs (tenant_id, target_type, target_id, created_at DESC);

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
  ('fiscal.manage', 'Fiscal / cumplimiento', 'Configurar impuestos, NCF y cumplimiento fiscal.')
ON CONFLICT (permission_key) DO UPDATE
SET label = excluded.label,
    description = excluded.description;

INSERT INTO public.role_system_presets (role_key, label, hierarchy_level, permission_keys, sort_order, is_active)
VALUES
  ('tenant_admin', 'Admin empresa', 10, ARRAY['users.manage','roles.manage','billing.manage','estimates.manage','inventory.manage','reports.view','fiscal.manage'], 10, true),
  ('manager', 'Gerente', 20, ARRAY['users.manage','billing.manage','estimates.manage','inventory.manage','reports.view','fiscal.manage'], 20, true),
  ('billing_agent', 'Facturacion', 30, ARRAY['billing.manage','estimates.manage','reports.view','fiscal.manage'], 30, true),
  ('inventory_agent', 'Inventario', 40, ARRAY['inventory.manage'], 40, true),
  ('viewer', 'Solo lectura', 50, ARRAY['reports.view'], 50, true)
ON CONFLICT (role_key) DO UPDATE
SET label = excluded.label,
    hierarchy_level = excluded.hierarchy_level,
    permission_keys = excluded.permission_keys,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;
