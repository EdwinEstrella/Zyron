-- Migración SQL: Gestión de planes y licencias automáticas
-- Creado: 2026-05-21 14:20:00

CREATE TABLE IF NOT EXISTS public.planes_servicio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_plan text UNIQUE NOT NULL,
  nombre text NOT NULL,
  limite_usuarios integer NOT NULL,
  limite_facturas_mes integer NOT NULL,
  precio numeric(14,2) NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS en planes_servicio
ALTER TABLE public.planes_servicio ENABLE ROW LEVEL SECURITY;

-- Politicas RLS para planes_servicio
CREATE POLICY "Permitir lectura publica de planes" 
  ON public.planes_servicio FOR SELECT 
  USING (activo = true);

CREATE POLICY "Permitir gestion total a super administradores" 
  ON public.planes_servicio FOR ALL 
  USING (public.is_super_admin() OR public.is_strict_super_admin());

-- Seed de planes iniciales
INSERT INTO public.planes_servicio (codigo_plan, nombre, limite_usuarios, limite_facturas_mes, precio)
VALUES
  ('basico', 'Plan Basico', 3, 50, 0.00),
  ('profesional', 'Plan Profesional', 10, 500, 49.00),
  ('premium', 'Plan Premium', 100, -1, 99.00)
ON CONFLICT (codigo_plan) DO UPDATE
SET nombre = excluded.nombre,
    limite_usuarios = excluded.limite_usuarios,
    limite_facturas_mes = excluded.limite_facturas_mes,
    precio = excluded.precio;

-- Modificar tabla de tenants para asociarle el plan
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.planes_servicio (id);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 3;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS allow_more_users boolean NOT NULL DEFAULT false;

-- Asociar los tenants existentes al Plan Basico
UPDATE public.tenants
SET plan_id = (SELECT id FROM public.planes_servicio WHERE codigo_plan = 'basico')
WHERE plan_id IS NULL;

-- Sincronizar columna max_users con el limite del plan si aplica
UPDATE public.tenants t
SET max_users = p.limite_usuarios
FROM public.planes_servicio p
WHERE t.plan_id = p.id;

-- Funcion disparadora para validar limites de usuarios activos en la empresa
CREATE OR REPLACE FUNCTION public.fn_validar_limites_plan()
RETURNS trigger AS $$
DECLARE
  v_max_usuarios integer;
  v_permitir_crecer boolean;
  v_usuarios_activos integer;
  v_plan_id uuid;
BEGIN
  -- Obtener el plan del tenant y su configuracion
  SELECT plan_id, allow_more_users, max_users INTO v_plan_id, v_permitir_crecer, v_max_usuarios
  FROM public.tenants
  WHERE id = NEW.tenant_id;

  -- Si no hay plan asignado, asumimos plan basico
  IF v_plan_id IS NULL THEN
    SELECT id, limite_usuarios INTO v_plan_id, v_max_usuarios
    FROM public.planes_servicio
    WHERE codigo_plan = 'basico';
  ELSE
    SELECT limite_usuarios INTO v_max_usuarios
    FROM public.planes_servicio
    WHERE id = v_plan_id;
  END IF;

  -- Si el plan tiene limite y no permite crecimiento flexible, validar
  IF NOT COALESCE(v_permitir_crecer, false) AND NEW.status = 'active' THEN
    -- Contar usuarios activos en la empresa, excluyendo al usuario actual si ya era miembro activo (en caso de UPDATE)
    SELECT COUNT(*) INTO v_usuarios_activos
    FROM public.tenant_memberships
    WHERE tenant_id = NEW.tenant_id
      AND status = 'active'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Si supera el limite permitido, lanzar excepcion
    IF v_usuarios_activos >= v_max_usuarios THEN
      RAISE EXCEPTION 'Limite de usuarios excedido para este plan de servicio. El limite es % usuarios activos.', v_max_usuarios;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear el disparador en tenant_memberships
DROP TRIGGER IF EXISTS trg_validar_limites_plan ON public.tenant_memberships;
CREATE TRIGGER trg_validar_limites_plan
  BEFORE INSERT OR UPDATE ON public.tenant_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_limites_plan();
