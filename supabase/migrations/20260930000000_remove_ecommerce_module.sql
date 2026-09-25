-- Remove E-commerce module completely: tables, indexes, permissions, and navigation entries.

-- 1. Drop e-commerce tables and dependent objects
DROP TABLE IF EXISTS public.ecom_order_items CASCADE;
DROP TABLE IF EXISTS public.ecom_orders CASCADE;
DROP TABLE IF EXISTS public.ecom_products CASCADE;
DROP TABLE IF EXISTS public.ecom_settings CASCADE;

-- 2. Remove ecommerce navigation module
DELETE FROM public.app_navigation_modules WHERE module_key = 'ecommerce';

-- 3. Remove ecommerce permissions from role system presets
UPDATE public.role_system_presets
SET permission_keys = array_remove(array_remove(permission_keys, 'ecommerce.view'), 'ecommerce.manage')
WHERE 'ecommerce.view' = ANY(permission_keys) OR 'ecommerce.manage' = ANY(permission_keys);

-- 4. Delete tenant role permissions pointing to ecommerce
DELETE FROM public.role_permissions
WHERE permission_id IN (
  SELECT id FROM public.permission_catalog WHERE permission_key IN ('ecommerce.view', 'ecommerce.manage')
);

-- 5. Delete ecommerce permissions from catalog
DELETE FROM public.permission_catalog
WHERE permission_key IN ('ecommerce.view', 'ecommerce.manage');
