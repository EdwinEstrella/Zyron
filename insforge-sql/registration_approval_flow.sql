-- Compatibilidad del flujo Registro -> Solicitud -> Aprobacion Super Admin.
-- Ejecutar despues de zyron_base_schema.sql si quieres columnas explicitas
-- para reportes/debug, ademas de request_payload.

ALTER TABLE public.user_access_requests
  ADD COLUMN IF NOT EXISTS requested_email text;

ALTER TABLE public.user_access_requests
  ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.user_access_requests
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.user_access_requests
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.user_access_requests
  ADD COLUMN IF NOT EXISTS request_status text;

UPDATE public.user_access_requests
SET
  requested_email = COALESCE(requested_email, email, request_payload->>'email'),
  username = COALESCE(username, request_payload->>'username', full_name),
  phone = COALESCE(phone, request_payload->>'phone'),
  notes = COALESCE(notes, request_payload->>'notes'),
  request_status = COALESCE(request_status, status, 'pending')
WHERE requested_email IS NULL
   OR username IS NULL
   OR phone IS NULL
   OR notes IS NULL
   OR request_status IS NULL;

CREATE INDEX IF NOT EXISTS user_access_requests_status_idx
  ON public.user_access_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS user_access_requests_request_status_idx
  ON public.user_access_requests (request_status, created_at DESC);

CREATE INDEX IF NOT EXISTS app_users_status_role_idx
  ON public.app_users (status, global_role);

