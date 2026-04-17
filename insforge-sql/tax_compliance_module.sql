-- Impuestos y cumplimiento fiscal: parametros por empresa, tasas, NCF (RD), retenciones, campos en facturas.
-- Desplegar con MCP Insforge (run-raw-sql).

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

CREATE INDEX IF NOT EXISTS ncf_sequences_tenant_idx ON public.ncf_sequences (tenant_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ncf text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ncf_type text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS withholding_total numeric NOT NULL DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS withholding_detail jsonb;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fiscal_electronic_status text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fiscal_electronic_url text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fiscal_compliance_notes text;

COMMENT ON COLUMN public.invoices.ncf IS 'Comprobante fiscal (ej. NCF RD) asignado al emitir';
COMMENT ON COLUMN public.invoices.withholding_detail IS 'Desglose retenciones ISR / ITBIS u otras (JSON)';
COMMENT ON COLUMN public.invoices.fiscal_electronic_status IS 'not_applicable | pending | integrated (e-CF / plataforma externa)';

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tax_base_amount numeric;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS withholding_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoice_items.tax_base_amount IS 'Base imponible de la linea (sin impuesto), para auditoria';
