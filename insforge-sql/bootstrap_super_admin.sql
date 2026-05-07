-- Bootstrap de super admin para Zyron.
-- Cambia el email antes de ejecutar.
--
-- Uso:
-- 1. Crea/registrate en Auth con este mismo correo.
-- 2. Ejecuta este SQL.
-- 3. Inicia sesion en Zyron con ese correo.
--
-- La app enlazara auth_user_id automaticamente por email si este registro aun
-- no lo tiene.

INSERT INTO public.app_users (
  email,
  full_name,
  global_role,
  status
)
VALUES (
  lower('admin@tu-dominio.com'),
  'Super Admin',
  'super_admin',
  'active'
)
ON CONFLICT (email) DO UPDATE
SET
  full_name = COALESCE(public.app_users.full_name, excluded.full_name),
  global_role = 'super_admin',
  status = 'active',
  updated_at = now();

