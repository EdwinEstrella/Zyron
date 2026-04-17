-- Inventario avanzado: almacenes, stock por bodega, kardex con almacen, ajustes manuales.
-- Desplegar con MCP Insforge (run-raw-sql).

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

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default_per_tenant
  ON public.warehouses (tenant_id)
  WHERE is_default = true;

CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  warehouse_id uuid NOT NULL REFERENCES public.warehouses (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS warehouse_stock_product_idx ON public.warehouse_stock (product_id);

CREATE TABLE IF NOT EXISTS public.inventory_kardex (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  movement_type text NOT NULL,
  quantity numeric NOT NULL,
  unit_cost numeric,
  reference_type text,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_kardex
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses (id) ON DELETE SET NULL;

ALTER TABLE public.inventory_kardex
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS inventory_kardex_tenant_created_idx ON public.inventory_kardex (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_kardex_wh_idx ON public.inventory_kardex (warehouse_id);

COMMENT ON TABLE public.warehouses IS 'Bodegas / ubicaciones de inventario por empresa';
COMMENT ON TABLE public.warehouse_stock IS 'Existencias por producto y almacen';
COMMENT ON COLUMN public.inventory_kardex.movement_type IS 'in | out | adjustment (quantity puede ser negativa en adjustment)';
COMMENT ON COLUMN public.inventory_kardex.notes IS 'Motivo de ajuste manual u observacion';
