-- Desplegada en el backend Insforge (Zyron) con MCP user-insforge-zyron / run-raw-sql.
-- super_admin_list_app_users: devolver filas reales de public.app_users (columna status).
-- Si tu RPC actual deriva "status" desde user_access_requests u otra logica, el panel
-- "Usuarios del sistema" mostrara mal el estado aunque la tabla este bien actualizada.
--
-- Seguridad: antes de usar en produccion, restringe quien puede ejecutar esta funcion
-- (GRANT / politicas Insforge) o anade dentro del cuerpo la comprobacion de super_admin
-- segun el modelo de auth de tu instancia.

CREATE OR REPLACE FUNCTION public.super_admin_list_app_users()
RETURNS SETOF public.app_users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.*
  FROM public.app_users u
  ORDER BY u.created_at DESC;
$$;
