-- Desplegar con MCP Insforge (run-raw-sql). Pagos avanzados: metodos catalogo, aplicaciones parciales a facturas, CXC (amount_paid / due_date), conciliacion, log recordatorios y eventos pasarela.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE CASCADE;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS due_date timestamptz;

COMMENT ON COLUMN public.invoices.amount_paid IS 'Cobrado aplicado (suma de payment_allocations)';
COMMENT ON COLUMN public.invoices.due_date IS 'Vencimiento para CXC y estado overdue';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reference text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method_code text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_provider text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gateway_transaction_id text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'unmatched';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS matched_bank_reference text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS unallocated_amount numeric;

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

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_allocations_amount_positive CHECK (amount > 0),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS payment_allocations_invoice_id_idx ON public.payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_id_idx ON public.payment_allocations (payment_id);

CREATE TABLE IF NOT EXISTS public.payment_gateway_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_payment_id uuid REFERENCES public.payments (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'due_soon',
  channel text NOT NULL DEFAULT 'manual',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_reminder_log_tenant_created_idx ON public.payment_reminder_log (tenant_id, created_at DESC);
