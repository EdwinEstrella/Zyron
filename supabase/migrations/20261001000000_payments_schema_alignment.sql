-- Align payment tables with the columns the app writes now that it is online-only.
-- These columns existed in the legacy insforge-sql/payments_module_advanced.sql schema
-- but were omitted from 20260501000000_zyron_core_schema.sql. Additive and idempotent.

ALTER TABLE public.payment_reminder_log
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'due_soon',
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.payment_gateway_events
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS matched_payment_id uuid REFERENCES public.payments (id) ON DELETE SET NULL;

-- Foreign key column used for matching lookups; index it (unindexed FKs slow deletes on payments).
CREATE INDEX IF NOT EXISTS idx_payment_gateway_events_matched_payment
  ON public.payment_gateway_events (matched_payment_id);
