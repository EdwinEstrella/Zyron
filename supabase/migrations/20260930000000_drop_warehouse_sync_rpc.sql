-- The app is online-only: warehouses are written directly to public.warehouses under RLS.
-- zyron_sync_warehouse was only called by the removed local-first sync engine, and it
-- failed with 42702 ("tenant_id" ambiguous) because its RETURNS TABLE columns shadow
-- the warehouses columns. Drop it instead of keeping dead, broken code.
DROP FUNCTION IF EXISTS public.zyron_sync_warehouse(uuid, uuid, text, text, boolean, boolean);
