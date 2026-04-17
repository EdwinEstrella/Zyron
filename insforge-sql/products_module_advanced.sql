-- Catalogo avanzado: categorias, unidades, producto vs servicio, precios/impuesto/descuento por fila, stock condicional.
-- Desplegar con MCP Insforge (run-raw-sql).

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

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories (id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.measurement_units (id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'product';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tracks_stock boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_rate_default numeric;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_default numeric;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.item_kind IS 'product | service (servicios no mueven stock si tracks_stock es false)';
COMMENT ON COLUMN public.products.tax_rate_default IS 'ITBIS/IVA sugerido al agregar linea en factura';
COMMENT ON COLUMN public.products.discount_default IS 'Descuento fijo por linea sugerido al facturar';
