# Diseño: Gestión de planes y asignación automática de licencias

Este documento detalla la arquitectura técnica para la gestión global de planes de servicio SaaS y el control automático de cupos de licencias (miembros) en Zyron, asegurando la consistencia offline-first y el aislamiento multi-inquilino.

## Enfoque Técnico

El sistema gestionará planes de servicio de forma global. Cada inquilino (`tenants`) estará asociado a un plan de servicio (`planes_servicio`). Al agregar miembros a una empresa (`tenant_memberships`), un disparador en PostgreSQL impedirá la inserción si se excede el cupo de usuarios del plan contratado. Localmente, `localdb.js` validará estos límites offline antes de sincronizar.

## Decisiones de Arquitectura

| Decisión                     | Opción Elegida                                         | Alternativas Consideradas                   | Razón y Tradeoffs                                                                                                  |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Estructuración de planes** | Columna `plan_id` directa en `public.tenants`          | Tabla intermedia `suscripciones_inquilinos` | Más simple de sincronizar de forma local-first y reduce uniones de tablas (joins) complejas en consultas offline.  |
| **Control de límites**       | Trigger en PostgreSQL + Validación en `localdb.js`     | Solo validación en UI / backend             | Máxima seguridad e integridad a nivel base de datos, con una experiencia fluida offline mediante doble validación. |
| **Asignación de Licencia**   | Automática al insertar/activar en `tenant_memberships` | Tabla de asignación manual de licencias     | Mayor agilidad de usuario; cualquier miembro activo consume una licencia de manera implícita.                      |

## Flujo de Datos

```
[UI: Gestión de Equipo] ──(Validar cupo en localdb)──> [Insertar miembro local]
                                                              │
                                                        (Sincronización)
                                                              ▼
[DB PostgreSQL] <──(Trigger: fn_validar_limites_plan)── [tenant_memberships]
```

## Cambios de Archivos

| Archivo                                                  | Acción    | Descripción                                                                                                                                                 |
| -------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/20260521142000_gestion-planes-licencias.sql` | Crear     | Migración SQL para crear `planes_servicio`, agregar FK en `tenants` y crear el trigger de validación de licencias.                                          |
| `localdb.js`                                             | Modificar | Agregar validación local de límites de usuarios y facturas al realizar inserciones/actualizaciones en `tenant_memberships` y `invoices`.                    |
| `sync.js`                                                | Modificar | Descarga y sincronización local de la tabla global `planes_servicio`.                                                                                       |
| `renderer.js`                                            | Modificar | Agregar dropdown de planes en el editor de empresas de la vista superadmin, actualizar el envío del formulario y mostrar límites actuales en Configuración. |

## Interfaces y Contratos

### Estructura de Tablas (PostgreSQL)

```sql
CREATE TABLE public.planes_servicio (
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

-- Seed de planes iniciales
INSERT INTO public.planes_servicio (codigo_plan, nombre, limite_usuarios, limite_facturas_mes, precio) VALUES
  ('basico', 'Plan Basico', 3, 50, 0.00),
  ('profesional', 'Plan Profesional', 10, 500, 49.00),
  ('premium', 'Plan Premium', 100, -1, 99.00);
```

### Modificación en tabla `public.tenants`

```sql
ALTER TABLE public.tenants ADD COLUMN plan_id uuid REFERENCES public.planes_servicio (id);
```

## Estrategia de Pruebas

| Capa                  | Qué Probar                  | Enfoque                                                                                                                   |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Base de datos**     | Disparador de cupos         | Pruebas de inserción manual con SQL para superar el límite de usuarios de un plan de un tenant ficticio, esperando fallo. |
| **Localdb (Offline)** | Validación local de límites | Mock de `cacheMemoria` local simulando límite excedido, asegurando que `insertLocal` lance un error capturable.           |
| **UI (Superadmin)**   | Cambio de plan de empresa   | Simulación de Playwright para seleccionar un tenant, cambiar su plan en el selector de empresas y guardar con éxito.      |

## Migración y Rollout

- **Transición de datos**: Todos los tenants existentes en la base de datos se asociarán por defecto al `Plan Basico` de forma automática en la migración SQL.
- **Rollout**: Despliegue en caliente de base de datos sin tiempos de inactividad, ya que los campos son retrocompatibles.

## Preguntas Abiertas

- [ ] ¿El límite de facturas mensuales debe disparar una restricción dura (bloqueo) o solo una advertencia visual? _(Propuesta: Restricción dura al intentar facturar offline/online)_
