# Roadmap Zyron — checklist vs código

Leyenda: **Estado** = `Hecho` | `Parcial` | `Pendiente`. **Código** = módulo o tabla en el repo / Insforge.

> Flujo auth + aprobación super admin: **no romper** al ampliar features.

---

## FACTURACIÓN BÁSICA

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Crear facturas | Parcial | Edge `create-invoice-with-stock`, módulo Facturas `index.html` |
| Editar facturas | Pendiente | |
| Eliminar facturas | Pendiente | |
| Facturas recurrentes | Pendiente | Fase 2 — modelo `invoice_schedule` o similar |
| Facturas proforma | Pendiente | |
| Notas de crédito / débito | Pendiente | |
| Facturación por productos/servicios | Parcial | Items en edge actual; ampliar líneas |
| Borradores / duplicar / historial | Pendiente | Estados `draft` + UI |
| Numeración automática / series | Pendiente | Tabla `invoice_series`; ver `insforge-functions` |

---

## PAGOS Y COBROS

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Registro de pagos | Parcial | CRUD tabla `payments` |
| Métodos de pago, parciales, CXC, recordatorios, conciliación | Pendiente | Fase 2 — tablas `payment_allocations`, `ar_aging` |

---

## CLIENTES

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Registro / edición | Parcial | CRUD `customers` |
| Historial, segmentación, créditos, exportación | Pendiente | Fase 2 |

---

## PRODUCTOS / SERVICIOS

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Registro productos | Parcial | CRUD `products` |
| Servicios, categorías, impuestos/UoM | Pendiente | Ampliar esquema |

---

## INVENTARIO

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Control stock (básico) | Parcial | Campo `stock` en `products`; edge factura |
| Alertas, movimientos, kardex, multi-almacén | Pendiente | Fase 2 — `stock_movements`, `warehouses` |

---

## REPORTES

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Listado exportaciones | Parcial | CRUD `report_exports` |
| PDF/Excel, reportes fiscales | Pendiente | Fase 2 |

---

## IMPUESTOS Y CUMPLIMIENTO

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| ITBIS/IVA, NCF, e-factura, retenciones | Pendiente | Tablas `tax_rates`, `fiscal_sequences` (diseño) |

---

## USUARIOS Y ROLES

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Multiusuario | Parcial | `app_users`, `tenant_memberships` |
| Roles y permisos | Parcial | `role_catalog`, `permission_catalog`, `role_permissions`; presets en BD `role_system_presets` |
| Control de acceso | Parcial | RPCs super admin, edge `approve-access-request` |
| Registro de actividad | Parcial | `audit_logs` (edge) |

---

## DOCUMENTOS Y FORMATO

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Plantillas PDF, logo, email | Pendiente | Fase 2 |

---

## SISTEMA / TECNOLOGÍA

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Multiempresa | Parcial | `tenants`, membresías |
| Multi-moneda / idioma / firma | Pendiente | `app_settings` o tablas dedicadas |
| QR en facturas | Pendiente | URL base desde `app_settings` (`invoice_qr_base_url`), no string fijo en código |

---

## FUNCIONES AVANZADAS

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Dashboard métricas | Parcial | Super: `get-super-admin-overview`; tenant: KPIs desde tablas en `index.html` |
| Proyecciones, BI, IA | Pendiente | |

---

## EXPERIENCIA DE USUARIO

| Requisito | Estado | Código / notas |
|-----------|--------|----------------|
| Navegación modular | Parcial | Tabla `app_navigation_modules` + carga en `index.html` |
| Búsqueda / filtros / atajos | Pendiente | |
| Notificaciones tiempo real | Parcial | `realtime.connect` en bootstrap |

---

## Configuración app (Electron)

Credenciales **no van en el repo**. Usa un archivo JSON local (no `.env`):

| Archivo | Cuándo |
|---------|--------|
| `insforge.local.json` | Desarrollo: en la **raíz del repo** (junto a `package.json`). Con Electron Forge `main.js` corre desde `.vite/build`; la app también busca por `process.cwd()` al iniciar con `npm start`. Gitignored |
| `insforge.json` | `app.getPath('userData')`, o **junto al ejecutable** (misma carpeta que el `.exe` en Windows, portable), o `resources/insforge.json` si lo incluyes al empaquetar |

Campos: `baseUrl`, `anonKey` (ver plantilla `insforge.config.example.json`). Asi la configuracion viaja con el instalador o con el usuario sin depender de variables de entorno.

Esquema y seeds de menu (`app_navigation_modules`) y presets de rol (`role_system_presets`): aplicarlos con **MCP Insforge** (`run-raw-sql` u operaciones equivalentes), no con archivos `.sql` versionados en este repo.
