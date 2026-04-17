-- Clientes avanzados: segmentacion, datos fiscales/direccion, estado activo.
-- Desplegar con MCP Insforge (run-raw-sql).

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS tax_id text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS country text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS internal_notes text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

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
