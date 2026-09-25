-- Fine-grained action permissions for the standard action bar (Phase 1 pilots).
-- Additive only: new permission_catalog rows plus a bounded .manage cascade.
-- Runs as a single implicit statement batch, touches no row-level security
-- policy and grants nothing directly to any tenant role assignment table.

INSERT INTO public.permission_catalog (permission_key, label, description)
VALUES
  ('invoices.create', 'Crear facturas', 'Permite crear facturas nuevas o duplicar una existente.'),
  ('invoices.edit', 'Editar facturas', 'Permite editar una factura mientras esta en borrador.'),
  ('invoices.void', 'Anular facturas', 'Permite eliminar o anular una factura en borrador o pendiente.'),
  ('invoices.print', 'Imprimir facturas', 'Permite imprimir o exportar una factura (A4, ticket termico, HTML).'),
  ('invoices.authorize', 'Emitir facturas', 'Permite emitir una factura desde el estado borrador.'),
  ('invoices.process', 'Procesar facturas', 'Permite ejecutar procesos adicionales sobre facturas emitidas.'),
  ('estimates.create', 'Crear presupuestos', 'Permite crear presupuestos nuevos o duplicar uno existente.'),
  ('estimates.edit', 'Editar presupuestos', 'Permite editar un presupuesto mientras esta en borrador.'),
  ('estimates.void', 'Anular presupuestos', 'Permite eliminar un presupuesto en borrador, pendiente o rechazado.'),
  ('estimates.print', 'Imprimir presupuestos', 'Permite imprimir o exportar un presupuesto (A4, ticket termico, HTML).'),
  ('estimates.authorize', 'Autorizar presupuestos', 'Permite emitir, aceptar o rechazar un presupuesto pendiente.'),
  ('estimates.process', 'Convertir presupuestos', 'Permite convertir un presupuesto aceptado o pendiente en una factura.'),
  ('customers.create', 'Crear clientes', 'Permite registrar clientes nuevos.'),
  ('customers.edit', 'Editar clientes', 'Permite editar los datos de un cliente existente.'),
  ('customers.void', 'Anular clientes', 'Permite activar o desactivar un cliente.')
ON CONFLICT (permission_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description;

-- Extend the .manage cascade additively: it already satisfies its own .view.
-- It now also satisfies exactly these six fine-grained verbs, and nothing else.
CREATE OR REPLACE FUNCTION public.permission_satisfies(granted_key text, requested_key text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  RETURN granted_key IS NOT NULL AND requested_key IS NOT NULL AND (
    granted_key = requested_key OR
    (right(granted_key, 7) = '.manage' AND requested_key = regexp_replace(granted_key, '\.manage$', '.view')) OR
    (right(granted_key, 7) = '.delete' AND requested_key IN (regexp_replace(granted_key, '\.delete$', '.manage'), regexp_replace(granted_key, '\.delete$', '.view'))) OR
    (right(granted_key, 5) = '.edit' AND requested_key = regexp_replace(granted_key, '\.edit$', '.view')) OR
    (right(granted_key, 7) = '.manage' AND requested_key IN (
      regexp_replace(granted_key, '\.manage$', '.create'),
      regexp_replace(granted_key, '\.manage$', '.edit'),
      regexp_replace(granted_key, '\.manage$', '.void'),
      regexp_replace(granted_key, '\.manage$', '.print'),
      regexp_replace(granted_key, '\.manage$', '.authorize'),
      regexp_replace(granted_key, '\.manage$', '.process')
    ))
  );
END $$;

GRANT EXECUTE ON FUNCTION public.permission_satisfies(text, text) TO authenticated;

-- Post-deploy sanity checks (run manually against the target database):
--   select public.permission_satisfies('invoices.manage', 'invoices.void');    -- expect true
--   select public.permission_satisfies('invoices.manage', 'invoices.delete');  -- expect false
