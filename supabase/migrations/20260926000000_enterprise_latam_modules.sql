-- ============================================================================
-- Zyron: Enterprise Modules for Latin America (8 Core Business Modules)
-- RRHH, CRM Avanzado, Proyectos, Producción, Cadena de Suministro, E-commerce, Calidad, Gestión Documental
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RRHH (Recursos Humanos / Human Capital Management)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  manager_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS hr_departments_tenant_idx ON public.hr_departments (tenant_id);

CREATE TABLE IF NOT EXISTS public.hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hr_departments (id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  id_document_type text NOT NULL DEFAULT 'cedula',
  id_document_number text NOT NULL,
  email text,
  phone text,
  job_title text NOT NULL,
  hire_date date NOT NULL DEFAULT CURRENT_DATE,
  termination_date date,
  contract_type text NOT NULL DEFAULT 'indefinido',
  base_salary numeric(14,2) NOT NULL DEFAULT 0,
  payment_frequency text NOT NULL DEFAULT 'quincenal',
  bank_name text,
  bank_account_number text,
  status text NOT NULL DEFAULT 'activo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id_document_number)
);

CREATE INDEX IF NOT EXISTS hr_employees_tenant_idx ON public.hr_employees (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees (id) ON DELETE CASCADE,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  check_in timestamptz,
  check_out timestamptz,
  regular_hours numeric(5,2) NOT NULL DEFAULT 8,
  overtime_hours numeric(5,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS hr_attendance_tenant_emp_date_idx ON public.hr_attendance (tenant_id, employee_id, work_date);

CREATE TABLE IF NOT EXISTS public.hr_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees (id) ON DELETE CASCADE,
  leave_type text NOT NULL DEFAULT 'vacaciones',
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_count integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pendiente',
  reason text,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_leaves_tenant_status_idx ON public.hr_leaves (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.hr_payrolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  payroll_type text NOT NULL DEFAULT 'regular',
  status text NOT NULL DEFAULT 'borrador',
  total_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL DEFAULT 0,
  total_net numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_payrolls_tenant_idx ON public.hr_payrolls (tenant_id, period_start DESC);

CREATE TABLE IF NOT EXISTS public.hr_payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  payroll_id uuid NOT NULL REFERENCES public.hr_payrolls (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees (id) ON DELETE CASCADE,
  base_salary numeric(14,2) NOT NULL DEFAULT 0,
  overtime_amount numeric(14,2) NOT NULL DEFAULT 0,
  commissions_amount numeric(14,2) NOT NULL DEFAULT 0,
  other_earnings numeric(14,2) NOT NULL DEFAULT 0,
  social_security_deduction numeric(14,2) NOT NULL DEFAULT 0,
  tax_withholding_deduction numeric(14,2) NOT NULL DEFAULT 0,
  other_deductions numeric(14,2) NOT NULL DEFAULT 0,
  net_salary numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_payroll_items_tenant_payroll_idx ON public.hr_payroll_items (tenant_id, payroll_id);

-- ----------------------------------------------------------------------------
-- 2. CRM Avanzado
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_pipelines_tenant_idx ON public.crm_pipelines (tenant_id);

CREATE TABLE IF NOT EXISTS public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines (id) ON DELETE CASCADE,
  name text NOT NULL,
  probability integer NOT NULL DEFAULT 10,
  sort_order integer NOT NULL DEFAULT 10,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_stages_tenant_pipeline_idx ON public.crm_stages (tenant_id, pipeline_id, sort_order);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.crm_stages (id) ON DELETE SET NULL,
  title text NOT NULL,
  contact_name text NOT NULL,
  company_name text,
  email text,
  phone text,
  whatsapp text,
  source text NOT NULL DEFAULT 'directo',
  expected_revenue numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'DOP',
  lead_score integer NOT NULL DEFAULT 50,
  assigned_to text,
  close_date date,
  notes text,
  customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'abierto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_leads_tenant_status_idx ON public.crm_leads (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads (id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'llamada',
  summary text NOT NULL,
  due_date timestamptz,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  result_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_activities_tenant_lead_idx ON public.crm_activities (tenant_id, lead_id);

-- ----------------------------------------------------------------------------
-- 3. Proyectos (PSA & Gestión de Tareas)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pm_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  description text,
  start_date date,
  deadline date,
  budget_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planificacion',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_projects_tenant_idx ON public.pm_projects (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.pm_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.pm_projects (id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  billing_amount numeric(14,2) NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_milestones_tenant_project_idx ON public.pm_milestones (tenant_id, project_id);

CREATE TABLE IF NOT EXISTS public.pm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.pm_projects (id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.pm_milestones (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  assigned_to text,
  priority text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'por_hacer',
  estimated_hours numeric(6,2) NOT NULL DEFAULT 0,
  actual_hours numeric(6,2) NOT NULL DEFAULT 0,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_tasks_tenant_project_idx ON public.pm_tasks (tenant_id, project_id, status);

CREATE TABLE IF NOT EXISTS public.pm_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.pm_tasks (id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.hr_employees (id) ON DELETE SET NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  hours numeric(5,2) NOT NULL DEFAULT 1,
  is_billable boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pm_timesheets_tenant_task_idx ON public.pm_timesheets (tenant_id, task_id);

-- ----------------------------------------------------------------------------
-- 4. Producción (MRP / Manufactura)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mrp_work_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  cost_per_hour numeric(10,2) NOT NULL DEFAULT 0,
  capacity_per_day numeric(10,2) NOT NULL DEFAULT 8,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS mrp_work_centers_tenant_idx ON public.mrp_work_centers (tenant_id);

CREATE TABLE IF NOT EXISTS public.mrp_bom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  standard_quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_of_measure text NOT NULL DEFAULT 'UND',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS mrp_bom_tenant_product_idx ON public.mrp_bom (tenant_id, product_id);

CREATE TABLE IF NOT EXISTS public.mrp_bom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  bom_id uuid NOT NULL REFERENCES public.mrp_bom (id) ON DELETE CASCADE,
  raw_product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  scrap_percentage numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mrp_bom_items_tenant_bom_idx ON public.mrp_bom_items (tenant_id, bom_id);

CREATE TABLE IF NOT EXISTS public.mrp_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_number text NOT NULL,
  bom_id uuid NOT NULL REFERENCES public.mrp_bom (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  target_warehouse_id uuid REFERENCES public.warehouses (id) ON DELETE SET NULL,
  work_center_id uuid REFERENCES public.mrp_work_centers (id) ON DELETE SET NULL,
  quantity_planned numeric(12,2) NOT NULL DEFAULT 1,
  quantity_produced numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'borrador',
  start_date date,
  completion_date date,
  estimated_cost numeric(14,2) NOT NULL DEFAULT 0,
  actual_cost numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS mrp_production_orders_tenant_status_idx ON public.mrp_production_orders (tenant_id, status);

-- ----------------------------------------------------------------------------
-- 5. Cadena de Suministro (SCM & Compras)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scm_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  tax_id text NOT NULL,
  tax_id_type text NOT NULL DEFAULT 'rnc',
  name text NOT NULL,
  commercial_name text,
  email text,
  phone text,
  whatsapp text,
  address text,
  credit_days integer NOT NULL DEFAULT 0,
  withholding_agent boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tax_id)
);

CREATE INDEX IF NOT EXISTS scm_suppliers_tenant_idx ON public.scm_suppliers (tenant_id, name);

CREATE TABLE IF NOT EXISTS public.scm_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.scm_suppliers (id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES public.warehouses (id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  withholding_tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'DOP',
  status text NOT NULL DEFAULT 'borrador',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS scm_purchase_orders_tenant_status_idx ON public.scm_purchase_orders (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.scm_purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.scm_purchase_orders (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity_ordered numeric(12,2) NOT NULL DEFAULT 1,
  quantity_received numeric(12,2) NOT NULL DEFAULT 0,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 18,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scm_purchase_order_items_tenant_order_idx ON public.scm_purchase_order_items (tenant_id, order_id);

CREATE TABLE IF NOT EXISTS public.scm_goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  purchase_order_id uuid REFERENCES public.scm_purchase_orders (id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES public.scm_suppliers (id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses (id) ON DELETE RESTRICT,
  reception_date timestamptz NOT NULL DEFAULT now(),
  delivery_note_ref text,
  status text NOT NULL DEFAULT 'completada',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS scm_goods_receipts_tenant_idx ON public.scm_goods_receipts (tenant_id, reception_date DESC);

-- ----------------------------------------------------------------------------
-- 6. E-commerce (Tienda Online)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ecom_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  store_name text NOT NULL,
  slug text NOT NULL,
  currency text NOT NULL DEFAULT 'DOP',
  whatsapp_sales_phone text,
  allow_guest_checkout boolean NOT NULL DEFAULT true,
  payment_methods text[] NOT NULL DEFAULT ARRAY['transferencia','contra_entrega']::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id),
  UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS public.ecom_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  web_title text NOT NULL,
  web_description text,
  image_url text,
  online_price numeric(14,2) NOT NULL DEFAULT 0,
  offer_price numeric(14,2),
  is_featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id)
);

CREATE INDEX IF NOT EXISTS ecom_products_tenant_pub_idx ON public.ecom_products (tenant_id, is_published);

CREATE TABLE IF NOT EXISTS public.ecom_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text NOT NULL,
  customer_whatsapp text,
  shipping_address text NOT NULL,
  city text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  shipping_fee numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'transferencia',
  payment_status text NOT NULL DEFAULT 'pendiente',
  fulfillment_status text NOT NULL DEFAULT 'por_preparar',
  notes text,
  invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS ecom_orders_tenant_status_idx ON public.ecom_orders (tenant_id, fulfillment_status);

CREATE TABLE IF NOT EXISTS public.ecom_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.ecom_orders (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ecom_order_items_tenant_order_idx ON public.ecom_order_items (tenant_id, order_id);

-- ----------------------------------------------------------------------------
-- 7. Calidad (QA / QC - Gestión de Calidad)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.qm_control_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_stage text NOT NULL DEFAULT 'recepcion_compra',
  inspection_type text NOT NULL DEFAULT 'pasa_falla',
  min_tolerance numeric(10,2),
  max_tolerance numeric(10,2),
  instructions text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qm_control_points_tenant_idx ON public.qm_control_points (tenant_id, trigger_stage);

CREATE TABLE IF NOT EXISTS public.qm_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  control_point_id uuid NOT NULL REFERENCES public.qm_control_points (id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  lot_number text,
  inspector_name text NOT NULL,
  inspection_date timestamptz NOT NULL DEFAULT now(),
  measured_value numeric(10,2),
  result text NOT NULL DEFAULT 'aprobado',
  evidence_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qm_inspections_tenant_res_idx ON public.qm_inspections (tenant_id, result);

CREATE TABLE IF NOT EXISTS public.qm_non_conformances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  ncr_number text NOT NULL,
  inspection_id uuid REFERENCES public.qm_inspections (id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.scm_suppliers (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'media',
  immediate_action text,
  status text NOT NULL DEFAULT 'abierta',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ncr_number)
);

CREATE INDEX IF NOT EXISTS qm_non_conformances_tenant_status_idx ON public.qm_non_conformances (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.qm_capa_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  ncr_id uuid NOT NULL REFERENCES public.qm_non_conformances (id) ON DELETE CASCADE,
  root_cause_analysis text NOT NULL,
  action_plan text NOT NULL,
  responsible_person text NOT NULL,
  deadline date NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  verification_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qm_capa_actions_tenant_ncr_idx ON public.qm_capa_actions (tenant_id, ncr_id);

-- ----------------------------------------------------------------------------
-- 8. Gestión Documental (DMS)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.dms_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  department text NOT NULL DEFAULT 'general',
  parent_id uuid REFERENCES public.dms_folders (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, department, name)
);

CREATE INDEX IF NOT EXISTS dms_folders_tenant_idx ON public.dms_folders (tenant_id, department);

CREATE TABLE IF NOT EXISTS public.dms_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.dms_folders (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'comprobante',
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint DEFAULT 0,
  mime_type text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dms_documents_tenant_folder_idx ON public.dms_documents (tenant_id, folder_id);

CREATE TABLE IF NOT EXISTS public.dms_entity_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.dms_documents (id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, document_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS dms_entity_attachments_entity_idx ON public.dms_entity_attachments (tenant_id, entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- 9. Row Level Security (RLS) on all new tables
-- ----------------------------------------------------------------------------

ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_timesheets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mrp_work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_production_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scm_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scm_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scm_purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scm_goods_receipts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ecom_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecom_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecom_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecom_order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qm_control_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qm_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qm_non_conformances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qm_capa_actions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dms_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_entity_attachments ENABLE ROW LEVEL SECURITY;

-- Helper macro for standard tenant isolation policy
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'hr_departments', 'hr_employees', 'hr_attendance', 'hr_leaves', 'hr_payrolls', 'hr_payroll_items',
    'crm_pipelines', 'crm_stages', 'crm_leads', 'crm_activities',
    'pm_projects', 'pm_milestones', 'pm_tasks', 'pm_timesheets',
    'mrp_work_centers', 'mrp_bom', 'mrp_bom_items', 'mrp_production_orders',
    'scm_suppliers', 'scm_purchase_orders', 'scm_purchase_order_items', 'scm_goods_receipts',
    'ecom_settings', 'ecom_products', 'ecom_orders', 'ecom_order_items',
    'qm_control_points', 'qm_inspections', 'qm_non_conformances', 'qm_capa_actions',
    'dms_folders', 'dms_documents', 'dms_entity_attachments'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.%I', t);
    EXECUTE format('CREATE POLICY "tenant_isolation_policy" ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants())) WITH CHECK ((SELECT public.is_super_admin()) OR tenant_id IN (SELECT public.get_user_tenants()))', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 10. Navigation Modules & Permissions Catalog Seed
-- ----------------------------------------------------------------------------

INSERT INTO public.app_navigation_modules (module_key, label, icon, scope, sort_order, is_active)
VALUES
  ('rrhh', 'RRHH', 'badge', 'tenant', 42, true),
  ('crm', 'CRM Ventas', 'handshake', 'tenant', 44, true),
  ('proyectos', 'Proyectos', 'assignment', 'tenant', 46, true),
  ('produccion', 'Producción', 'precision_manufacturing', 'tenant', 48, true),
  ('cadena_suministro', 'Cadena Suministro', 'local_shipping', 'tenant', 49, true),
  ('ecommerce', 'E-commerce', 'storefront', 'tenant', 52, true),
  ('calidad', 'Calidad', 'verified', 'tenant', 54, true),
  ('documental', 'Gestión Documental', 'folder_shared', 'tenant', 56, true)
ON CONFLICT (scope, module_key) DO UPDATE
SET label = excluded.label,
    icon = excluded.icon,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES
  ('hr.view', 'Ver RRHH', 'Ver legajos de empleados, asistencias y nóminas.'),
  ('hr.manage', 'Gestionar RRHH', 'Crear y editar empleados, licencias y procesar nóminas.'),
  ('crm.view', 'Ver CRM', 'Ver embudos, etapas y prospectos comerciales.'),
  ('crm.manage', 'Gestionar CRM', 'Crear leads, oportunidades y registrar actividades comerciales.'),
  ('projects.view', 'Ver Proyectos', 'Ver proyectos, hitos y tareas.'),
  ('projects.manage', 'Gestionar Proyectos', 'Crear y planificar proyectos, tareas y hojas de tiempo.'),
  ('mrp.view', 'Ver Producción', 'Ver listas de materiales y órdenes de fabricación.'),
  ('mrp.manage', 'Gestionar Producción', 'Crear BOMs, centros de trabajo y gestionar órdenes de fabricación.'),
  ('scm.view', 'Ver Cadena de Suministro', 'Ver proveedores, órdenes de compra y recepciones.'),
  ('scm.manage', 'Gestionar Cadena de Suministro', 'Crear órdenes de compra, proveedores y registrar entradas de almacén.'),
  ('ecommerce.view', 'Ver E-commerce', 'Ver productos publicados y pedidos de la tienda online.'),
  ('ecommerce.manage', 'Gestionar E-commerce', 'Configurar tienda virtual, publicar catálogo y procesar pedidos web.'),
  ('quality.view', 'Ver Calidad', 'Ver puntos de control, inspecciones y no conformidades.'),
  ('quality.manage', 'Gestionar Calidad', 'Registrar inspecciones de calidad, no conformidades y planes CAPA.'),
  ('dms.view', 'Ver Documentos', 'Acceder y descargar documentos compartidos.'),
  ('dms.manage', 'Gestionar Documentos', 'Subir, categorizar, versionar y vincular documentos a registros.')
ON CONFLICT (permission_key) DO UPDATE
SET label = excluded.label,
    description = excluded.description;

-- Grant permissions to default presets
UPDATE public.role_system_presets
SET permission_keys = array_cat(permission_keys, ARRAY[
  'hr.view','hr.manage','crm.view','crm.manage','projects.view','projects.manage',
  'mrp.view','mrp.manage','scm.view','scm.manage','ecommerce.view','ecommerce.manage',
  'quality.view','quality.manage','dms.view','dms.manage'
])
WHERE role_key IN ('tenant_admin', 'manager');
