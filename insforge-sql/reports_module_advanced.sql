-- Reportes avanzados: historial de exportaciones y plantillas personalizadas.
-- Desplegar con MCP Insforge (run-raw-sql).

CREATE TABLE IF NOT EXISTS public.report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  report_type text NOT NULL,
  format text NOT NULL DEFAULT 'csv',
  file_url text,
  meta jsonb,
  created_by uuid,
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

COMMENT ON TABLE public.custom_report_definitions IS 'Plantillas de reporte (dataset y columnas visibles); filtros en JSON seguro en servidor.';
COMMENT ON COLUMN public.custom_report_definitions.dataset_key IS 'sales | income | tax | customers | top_products | ar';
