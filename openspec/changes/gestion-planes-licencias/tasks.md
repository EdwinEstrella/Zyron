# Plan de Tareas: Gestión de planes y asignación automática de licencias (Issue #19)

Este plan de tareas detalla los pasos de implementación para habilitar la facturación de planes de servicio SaaS y el control dinámico de cupos de miembros activos e invoices en Zyron, garantizando la retrocompatibilidad y la consistencia local-first.

## Tareas de Implementación

### [x] Fase 1: Base de Datos y Migración SQL (Cero Inglés)

- [x] Crear la migración `migrations/20260521142000_gestion-planes-licencias.sql`.
- [x] Definir la tabla `public.planes_servicio` con los campos correspondientes.
- [x] Cargar los registros semilla de los planes (Básico, Profesional, Premium).
- [x] Agregar la columna `plan_id` (FK) a la tabla `public.tenants`.
- [x] Actualizar todos los tenants existentes para asociarlos al "Plan Básico" por defecto.
- [x] Crear la función trigger `public.fn_validar_limites_plan()` para validar el cupo de usuarios activos de manera estricta online.
- [x] Crear el disparador `trg_validar_limites_plan` en la tabla `public.tenant_memberships`.

### [ ] Fase 2: Persistencia Offline-First (`localdb.js` y `sync.js`)

- [ ] En `sync.js`, integrar la tabla global `planes_servicio` en la lista de descarga y sincronización offline.
- [ ] En `localdb.js`, implementar validación local en `insertLocal` / `updateLocal` para `tenant_memberships` que compruebe los límites de usuarios activos definidos en el plan.
- [ ] En `localdb.js`, implementar validación local en `insertLocal` para `invoices` que verifique si el inquilino ha alcanzado su cupo de facturación del mes actual según su plan.

### [ ] Fase 3: Frontend y Módulos de Interfaz (`renderer.js`)

- [ ] En `renderEmpresasModule` (Superadmin), cargar y listar todos los planes de servicio de `planes_servicio`.
- [ ] Incorporar un selector dropdown del "Plan de Servicio" en el formulario de edición de empresas de Superadmin.
- [ ] En la tabla de empresas de Superadmin, agregar la columna para mostrar el plan activo de cada inquilino.
- [ ] Modificar el manejador de submit del formulario de empresas para persistir el `planId` seleccionado.
- [ ] En el panel de **Configuración** del inquilino común, cargar los datos de su plan y uso.
- [ ] Diseñar e integrar una tarjeta de visualización ("Plan de Servicio y Consumo de Licencias") con barras de progreso en Tailwind.

### [ ] Fase 4: Pruebas y Validación Final

- [ ] Crear un archivo de prueba en `tests/` para evaluar la restricción local e impedir la adición de usuarios excedidos.
- [ ] Comprobar el comportamiento offline simulado.

---

## Review Workload Forecast

- **Estimated lines of code changed**: ~280-320 lines.
- **Complexity**: Moderate (Trigger SQL + Offline localdb validation).
- **PR Strategy Recommendation**: Single PR (within the 400-line budget limit).
- **Decision needed before apply**: No.
