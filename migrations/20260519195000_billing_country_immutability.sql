CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_country_code text;

ALTER TABLE public.user_access_requests
  ADD COLUMN IF NOT EXISTS billing_country_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_billing_country_code_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_billing_country_code_check
      CHECK (billing_country_code IS NULL OR billing_country_code IN ('AR', 'DO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_access_requests_billing_country_code_check'
  ) THEN
    ALTER TABLE public.user_access_requests
      ADD CONSTRAINT user_access_requests_billing_country_code_check
      CHECK (billing_country_code IS NULL OR billing_country_code IN ('AR', 'DO'));
  END IF;
END $$;

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

CREATE OR REPLACE FUNCTION public.prevent_billing_country_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.billing_country_code IS NOT NULL
     AND NEW.billing_country_code IS DISTINCT FROM OLD.billing_country_code THEN
    RAISE EXCEPTION 'billing_country_code is immutable once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_billing_country_change ON public.tenants;
CREATE TRIGGER tr_prevent_billing_country_change
BEFORE UPDATE OF billing_country_code ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.prevent_billing_country_change();

CREATE OR REPLACE FUNCTION public.zyron_country_context(p_country_code text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(p_country_code)
    WHEN 'AR' THEN jsonb_build_object(
      'version', 1,
      'defaultCurrency', 'ARS',
      'defaultLocale', 'es',
      'priceDisplayCurrency', NULL,
      'billingCountryCode', 'AR',
      'taxLabel', 'IVA',
      'defaultTaxRate', 21,
      'ncfEnabled', false,
      'authorityLabel', 'ARCA / AFIP',
      'fiscalIdLabel', 'CUIT'
    )
    ELSE jsonb_build_object(
      'version', 1,
      'defaultCurrency', 'DOP',
      'defaultLocale', 'es',
      'priceDisplayCurrency', NULL,
      'billingCountryCode', 'DO',
      'taxLabel', 'ITBIS',
      'defaultTaxRate', 18,
      'ncfEnabled', true,
      'authorityLabel', 'DGII',
      'fiscalIdLabel', 'RNC'
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.zyron_seed_country_defaults(p_tenant_id uuid, p_country_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country text := upper(trim(p_country_code));
  v_context jsonb;
BEGIN
  IF v_country NOT IN ('AR', 'DO') THEN
    RAISE EXCEPTION 'Invalid billing country code';
  END IF;

  v_context := public.zyron_country_context(v_country);

  INSERT INTO public.tenant_fiscal_settings (
    tenant_id,
    country_code,
    tax_label,
    default_tax_rate,
    prices_tax_inclusive,
    ncf_enabled,
    electronic_invoicing_requested,
    updated_at
  ) VALUES (
    p_tenant_id,
    v_country,
    CASE WHEN v_country = 'AR' THEN 'IVA' ELSE 'ITBIS' END,
    CASE WHEN v_country = 'AR' THEN 21 ELSE 18 END,
    false,
    v_country = 'DO',
    false,
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET country_code = excluded.country_code,
      tax_label = excluded.tax_label,
      default_tax_rate = excluded.default_tax_rate,
      prices_tax_inclusive = excluded.prices_tax_inclusive,
      ncf_enabled = excluded.ncf_enabled,
      electronic_invoicing_requested = excluded.electronic_invoicing_requested,
      updated_at = now();

  INSERT INTO public.app_settings (tenant_id, setting_key, setting_value, value, updated_at)
  VALUES (p_tenant_id, 'zyron_tenant_context', v_context::text, v_context, now())
  ON CONFLICT (tenant_id, setting_key) DO UPDATE
  SET setting_value = excluded.setting_value,
      value = excluded.value,
      updated_at = now();

  IF v_country = 'AR' THEN
    INSERT INTO public.tax_rates_catalog (tenant_id, code, label, rate_percent, sort_order, is_default, is_active)
    VALUES
      (p_tenant_id, 'iva_21', 'IVA tasa general 21%', 21, 10, true, true),
      (p_tenant_id, 'iva_105', 'IVA tasa reducida 10.5%', 10.5, 20, false, true),
      (p_tenant_id, 'iva_27', 'IVA tasa incrementada 27%', 27, 30, false, true),
      (p_tenant_id, 'exento', 'Exento 0%', 0, 40, false, true)
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET label = excluded.label,
        rate_percent = excluded.rate_percent,
        sort_order = excluded.sort_order,
        is_default = excluded.is_default,
        is_active = true;
  ELSE
    INSERT INTO public.tax_rates_catalog (tenant_id, code, label, rate_percent, sort_order, is_default, is_active)
    VALUES
      (p_tenant_id, 'itbis_18', 'ITBIS tasa general 18%', 18, 10, true, true),
      (p_tenant_id, 'itbis_16', 'ITBIS tasa reducida 16%', 16, 20, false, true),
      (p_tenant_id, 'exento', 'Exento 0%', 0, 30, false, true)
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET label = excluded.label,
        rate_percent = excluded.rate_percent,
        sort_order = excluded.sort_order,
        is_default = excluded.is_default,
        is_active = true;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_billing_country_once(p_tenant_id uuid, p_country_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country text := upper(trim(p_country_code));
  v_app_user_id uuid;
  v_is_admin boolean := false;
  v_updated uuid;
BEGIN
  IF v_country NOT IN ('AR', 'DO') THEN
    RAISE EXCEPTION 'Invalid billing country code';
  END IF;

  SELECT id, global_role IN ('super_admin', 'project_admin')
    INTO v_app_user_id, v_is_admin
  FROM public.app_users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_app_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated app user not found';
  END IF;

  IF NOT v_is_admin AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.app_user_id = v_app_user_id
      AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not allowed to set billing country for this tenant';
  END IF;

  UPDATE public.tenants
  SET billing_country_code = v_country,
      updated_at = now()
  WHERE id = p_tenant_id
    AND billing_country_code IS NULL
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'Billing country already set or tenant not found';
  END IF;

  PERFORM public.zyron_seed_country_defaults(p_tenant_id, v_country);

  RETURN jsonb_build_object('ok', true, 'tenantId', p_tenant_id, 'billingCountryCode', v_country);
END;
$$;

INSERT INTO public.app_navigation_modules (module_key, label, icon, scope, sort_order, is_active)
VALUES ('fiscal', 'Fiscal', 'receipt_long', 'tenant', 85, true)
ON CONFLICT (scope, module_key) DO UPDATE
SET label = excluded.label,
    icon = excluded.icon,
    sort_order = LEAST(public.app_navigation_modules.sort_order, excluded.sort_order),
    is_active = true;

INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES ('fiscal.manage', 'Fiscal / cumplimiento', 'Gestionar configuracion fiscal, tasas y comprobantes.')
ON CONFLICT (permission_key) DO UPDATE
SET label = excluded.label,
    description = excluded.description;
