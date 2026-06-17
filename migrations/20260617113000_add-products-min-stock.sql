ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_stock numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.products.min_stock IS 'Minimum stock threshold used for low-stock alerts.';
