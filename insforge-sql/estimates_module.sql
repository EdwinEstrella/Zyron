-- Presupuestos / estimaciones para Zyron.
-- Ejecutar con MCP InsForge run-raw-sql o en el SQL editor del backend.
--
-- Habilita:
-- - invoice_type = 'estimate'
-- - estados de presupuesto: draft, pending, accepted, rejected, converted
-- - modulo de navegacion tenant "presupuestos"
-- - permiso declarativo "estimates.manage"
-- - serie inicial COT para tenants existentes
--
-- Nota: despues de correr este SQL, despliega tambien estas edge functions locales:
-- - insforge-functions/create-invoice-with-stock.js
-- - insforge-functions/update-invoice.js

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'standard';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'service';

COMMENT ON COLUMN public.invoices.invoice_type IS 'standard | proforma | estimate | credit_note | debit_note';
COMMENT ON COLUMN public.invoices.status IS 'draft | pending | accepted | rejected | converted | paid | overdue | cancelled';

-- Si habia CHECK constraints previos que no contemplaban "estimate" o los estados
-- de presupuesto, se reemplazan por checks amplios compatibles con facturacion y
-- presupuestos. El bloque solo toca checks cuyo texto menciona esas columnas.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%invoice_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('standard', 'proforma', 'estimate', 'credit_note', 'debit_note'));

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'pending', 'accepted', 'rejected', 'converted', 'paid', 'overdue', 'cancelled'));

CREATE INDEX IF NOT EXISTS invoices_tenant_type_created_idx
  ON public.invoices (tenant_id, invoice_type, created_at DESC);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx
  ON public.invoice_items (invoice_id);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

-- Serie de presupuestos para tenants actuales. La funcion zyron_next_invoice_number
-- tambien crea series bajo demanda, pero esto deja COT visible desde el primer uso.
INSERT INTO public.invoice_series (tenant_id, code, label, next_number, padding, is_default)
SELECT t.id, 'COT', 'Presupuestos', 1, 6, false
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.invoice_series s
  WHERE s.tenant_id = t.id
    AND s.code = 'COT'
);

-- Navegacion tenant: modulo "Presupuestos".
DO $$
BEGIN
  IF to_regclass('public.app_navigation_modules') IS NOT NULL THEN
    UPDATE public.app_navigation_modules
    SET
      label = 'Presupuestos',
      icon = 'request_quote',
      scope = 'tenant',
      is_active = true,
      sort_order = 25
    WHERE module_key = 'presupuestos'
      AND scope = 'tenant';

    INSERT INTO public.app_navigation_modules (module_key, label, icon, scope, sort_order, is_active)
    SELECT 'presupuestos', 'Presupuestos', 'request_quote', 'tenant', 25, true
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.app_navigation_modules
      WHERE module_key = 'presupuestos'
        AND scope = 'tenant'
    );
  END IF;
END $$;

-- Permiso declarativo para roles. El modulo actual queda protegido por el permiso
-- general de facturacion en UI, pero este permiso permite granularidad posterior.
DO $$
BEGIN
  IF to_regclass('public.permission_catalog') IS NOT NULL THEN
    UPDATE public.permission_catalog
    SET
      label = 'Gestion de presupuestos',
      description = 'Crear, editar, emitir, aceptar/rechazar y convertir presupuestos sin envio de email.'
    WHERE permission_key = 'estimates.manage';

    INSERT INTO public.permission_catalog (permission_key, label, description)
    SELECT
      'estimates.manage',
      'Gestion de presupuestos',
      'Crear, editar, emitir, aceptar/rechazar y convertir presupuestos sin envio de email.'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.permission_catalog
      WHERE permission_key = 'estimates.manage'
    );
  END IF;
END $$;

-- Agrega estimates.manage a presets de roles con facturacion, si existe la tabla.
DO $$
BEGIN
  IF to_regclass('public.role_system_presets') IS NOT NULL THEN
    UPDATE public.role_system_presets
    SET permission_keys = (
      SELECT array_agg(DISTINCT p ORDER BY p)
      FROM unnest(coalesce(permission_keys, ARRAY[]::text[]) || ARRAY['estimates.manage']) AS p
    )
    WHERE is_active = true
      AND (
        role_key IN ('tenant_admin', 'manager', 'billing_agent')
        OR 'billing.manage' = ANY(coalesce(permission_keys, ARRAY[]::text[]))
      );
  END IF;
END $$;
