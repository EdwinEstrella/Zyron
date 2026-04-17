-- Desplegar con MCP Insforge (run-raw-sql). Extiende facturacion para borradores, NC/ND, series atomicas, lineas producto/servicio y plantillas recurrentes.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS recurrence_rule jsonb;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'service';

COMMENT ON COLUMN public.invoice_items.line_kind IS 'product | service';

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

REVOKE ALL ON FUNCTION public.zyron_next_invoice_number(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.zyron_next_invoice_number(uuid, text) TO authenticated;
-- Solo en Postgres estilo Supabase (rol presente):
-- GRANT EXECUTE ON FUNCTION public.zyron_next_invoice_number(uuid, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.invoice_recurrence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  frequency text NOT NULL DEFAULT 'monthly',
  day_of_month smallint,
  series text NOT NULL DEFAULT 'FAC',
  invoice_type text NOT NULL DEFAULT 'standard',
  template_payload jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
