-- Crear una empresa y asignar un usuario como dueno de negocio.
-- Cambia email/nombres antes de ejecutar.
--
-- Esto NO crea la cuenta Auth/password; el usuario debe registrarse o existir
-- en Auth con el mismo correo. La app enlazara auth_user_id por email al login.

WITH owner_user AS (
  INSERT INTO public.app_users (
    email,
    full_name,
    global_role,
    status
  )
  VALUES (
    lower('dueno@empresa.com'),
    'Dueno Empresa',
    'user',
    'active'
  )
  ON CONFLICT (email) DO UPDATE
  SET
    full_name = COALESCE(public.app_users.full_name, excluded.full_name),
    global_role = 'user',
    status = 'active',
    updated_at = now()
  RETURNING id
),
tenant_row AS (
  INSERT INTO public.tenants (
    slug,
    display_name,
    legal_name,
    email,
    status,
    created_by
  )
  SELECT
    'mi-empresa',
    'Mi Empresa',
    'Mi Empresa SRL',
    lower('dueno@empresa.com'),
    'active',
    id
  FROM owner_user
  ON CONFLICT (slug) DO UPDATE
  SET
    display_name = excluded.display_name,
    legal_name = excluded.legal_name,
    email = excluded.email,
    status = 'active',
    updated_at = now()
  RETURNING id
)
INSERT INTO public.tenant_memberships (
  tenant_id,
  app_user_id,
  role_key,
  status,
  is_owner
)
SELECT
  tenant_row.id,
  owner_user.id,
  'tenant_admin',
  'active',
  true
FROM tenant_row, owner_user
ON CONFLICT (tenant_id, app_user_id) DO UPDATE
SET
  role_key = 'tenant_admin',
  status = 'active',
  is_owner = true,
  updated_at = now();

