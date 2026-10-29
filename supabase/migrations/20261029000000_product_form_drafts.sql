-- Product form drafts: database-persisted drafts for the new-product form.
--
--   1. Stores in-progress new product forms in public.product_form_drafts
--      keyed by (tenant_id, user_id), so users can pick up where they left off
--      across workstations without data loss when interrupted.
--   2. Strict user isolation via Row Level Security (RLS): each authenticated
--      user can only access their own draft in tenants they belong to.
--   3. Automatically maintains updated_at via a BEFORE UPDATE trigger.

CREATE TABLE IF NOT EXISTS public.product_form_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_product_form_drafts_user_id ON public.product_form_drafts (user_id);

ALTER TABLE public.product_form_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_form_drafts_own" ON public.product_form_drafts;
CREATE POLICY "product_form_drafts_own" ON public.product_form_drafts
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND tenant_id IN (SELECT public.get_user_tenants()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND tenant_id IN (SELECT public.get_user_tenants()));

REVOKE ALL ON public.product_form_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_form_drafts TO authenticated;

CREATE OR REPLACE FUNCTION public.product_form_drafts_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_product_form_drafts_touch ON public.product_form_drafts;
CREATE TRIGGER tr_product_form_drafts_touch
  BEFORE UPDATE ON public.product_form_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.product_form_drafts_touch();

NOTIFY pgrst, 'reload schema';
