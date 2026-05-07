# Features de `idea/InvoiceShelf`

Este documento resume las funcionalidades detectadas en el proyecto `idea/InvoiceShelf`, una aplicacion web de facturacion, cobros y gestion administrativa construida con Laravel, Vue y una API versionada bajo `/api/v1`.

## 1. Instalacion y primer arranque

InvoiceShelf incluye un asistente de instalacion para preparar la aplicacion antes de usarla. El flujo permite seleccionar idioma, validar requisitos del servidor, revisar permisos de archivos, configurar la base de datos, definir el dominio de la app, iniciar sesion durante la instalacion y finalizar el setup.

Soporte observado:

- Pantalla `/installation` en el frontend.
- Endpoints para `wizard-step`, `wizard-language`, `requirements`, `permissions`, `database/config`, `set-domain`, `login` y `finish`.
- Configuracion para MySQL, PostgreSQL y SQLite en archivos Docker de desarrollo.
- Validaciones de requisitos y permisos antes de completar la instalacion.

## 2. Autenticacion de administradores

El panel administrativo tiene login, logout, verificacion de sesion y recuperacion de contrasena. Usa autenticacion protegida por Sanctum para las rutas internas.

Funcionalidad:

- Inicio de sesion de usuarios administradores.
- Cierre de sesion.
- Comprobacion de usuario autenticado.
- Solicitud de email de recuperacion de contrasena con throttling.
- Restablecimiento de contrasena mediante token.
- Rutas publicas de `login`, `forgot-password` y `reset-password`.

## 3. Dashboard administrativo

El dashboard centraliza metricas de negocio para la empresa activa. El frontend incluye componentes de estadisticas, graficos y tablas para presentar el estado general de ventas, pagos, clientes y documentos.

Funcionalidad:

- Vista `/admin/dashboard`.
- Endpoint `/dashboard`.
- Componentes de estadisticas pequenas y grandes.
- Grafico de dashboard.
- Tabla de datos recientes o resumidos.
- Control de acceso por permiso `dashboard`.

## 4. Gestion de clientes

El modulo de clientes permite administrar contactos comerciales y consultar informacion asociada a su actividad.

Funcionalidad:

- Listado de clientes.
- Creacion, edicion, visualizacion y eliminacion masiva.
- Vista individual de cliente.
- Estadisticas por cliente.
- Asociacion con direcciones.
- Uso de campos personalizados en clientes.
- Relacion con facturas, presupuestos, pagos y gastos.
- Permisos separados para ver, crear, editar y eliminar clientes.

## 5. Productos, servicios, items y unidades

El proyecto maneja items facturables reutilizables para facturas, presupuestos y facturas recurrentes.

Funcionalidad:

- Listado de items.
- Creacion y edicion de items.
- Eliminacion masiva de items.
- Gestion de unidades.
- Asociacion con tipos de impuesto.
- Uso de items dentro de lineas de factura, presupuesto y factura recurrente.
- Permisos para ver, crear, editar y eliminar items.

## 6. Facturas

El modulo de facturas cubre el ciclo principal de venta: crear documentos, calcular importes, aplicar impuestos, enviarlos al cliente, cambiar estados, duplicarlos y generar PDF.

Funcionalidad:

- Listado de facturas.
- Creacion, edicion, detalle y eliminacion masiva.
- Lineas de factura con items, cantidades, precios, descuentos e impuestos.
- Seleccion de cliente.
- Campos personalizados.
- Notas reutilizables.
- Calculo de subtotales, impuestos y totales.
- Cambio de estado de factura.
- Clonado de facturas.
- Envio de factura por email.
- Previsualizacion del email antes de enviarlo.
- Plantillas de factura.
- Generacion de PDF mediante jobs y servicios internos.
- Pagina publica para ver factura por hash: `/customer/invoices/view/:hash`.
- Permisos para ver, crear, editar, eliminar y enviar facturas.

## 7. Presupuestos o estimaciones

El modulo de estimates permite crear propuestas previas a la factura y convertirlas en facturas cuando el cliente las aprueba.

Funcionalidad:

- Listado de presupuestos.
- Creacion, edicion, detalle y eliminacion masiva.
- Lineas con items, impuestos, descuentos y totales.
- Seleccion de plantillas de presupuesto.
- Cambio de estado.
- Clonado de presupuestos.
- Conversion de presupuesto a factura.
- Aceptacion de presupuesto desde el portal de cliente.
- Generacion de PDF por job.
- Permisos para ver, crear, editar, eliminar y emitir presupuestos.

## 8. Facturas recurrentes

El sistema incluye facturacion recurrente para automatizar documentos repetitivos.

Funcionalidad:

- Listado de facturas recurrentes.
- Creacion, edicion, detalle y eliminacion masiva.
- Configuracion de frecuencia mediante endpoint dedicado.
- Reutilizacion de items, impuestos, clientes y notas.
- Vista de facturas generadas desde una recurrencia.
- Permisos especificos para ver, crear, editar y eliminar facturas recurrentes.
- Dependencia funcional con el permiso de envio de facturas.

## 9. Pagos

El modulo de pagos registra cobros asociados a clientes y facturas.

Funcionalidad:

- Listado de pagos.
- Creacion, edicion, detalle y eliminacion masiva.
- Creacion de pago desde una factura.
- Asociacion con cliente y factura.
- Uso de metodos de pago.
- Campos personalizados.
- Notas.
- Envio de recibo o comprobante de pago por email.
- Previsualizacion del email antes del envio.
- Generacion de PDF de pago mediante job.
- Permisos para ver, crear, editar, eliminar y enviar pagos.

## 10. Metodos de pago

El sistema permite administrar los metodos por los que se registran cobros.

Funcionalidad:

- CRUD API de metodos de pago.
- Vista de configuracion `payment-mode`.
- Uso de metodos en pagos del panel admin.
- Exposicion de metodo de pago en el portal de cliente.

## 11. Gastos

El modulo de gastos permite registrar egresos de la empresa y vincularlos con clientes cuando aplica.

Funcionalidad:

- Listado de gastos.
- Creacion, edicion y eliminacion masiva.
- Duplicado de gastos.
- Subida de recibos.
- Visualizacion o descarga de recibos asociados.
- Asociacion con cliente.
- Categorizacion de gastos.
- Campos personalizados.
- Permisos para ver, crear, editar y eliminar gastos.

## 12. Categorias de gasto

El proyecto incluye categorias para organizar y reportar gastos.

Funcionalidad:

- CRUD API de categorias.
- Vista de configuracion `expense-category`.
- Uso de categorias dentro del modulo de gastos.

## 13. Portal de cliente

InvoiceShelf tiene un area separada para clientes, con autenticacion propia y rutas bajo `/{company:slug}/customer`.

Funcionalidad:

- Login de cliente.
- Recuperacion y restablecimiento de contrasena.
- Dashboard de cliente.
- Listado y detalle de facturas.
- Listado y detalle de presupuestos.
- Aceptacion de presupuestos.
- Listado y detalle de pagos.
- Consulta de metodo de pago.
- Listado y detalle de gastos visibles para el cliente.
- Edicion de perfil y direcciones.
- Bootstrap de datos del portal.
- Resolucion por slug de empresa.

## 14. Empresas multiples

El sistema soporta multiples empresas por usuario y seleccion de empresa activa.

Funcionalidad:

- Creacion de empresas.
- Listado de empresas disponibles para el usuario.
- Eliminacion de empresas.
- Transferencia de propiedad a otro usuario.
- Endpoint de empresa actual.
- Middleware de empresa para aislar datos.
- Configuracion independiente de compania.
- Logo e informacion fiscal/comercial por empresa.

## 15. Usuarios, roles y permisos

El panel incluye gestion de usuarios y roles con permisos granulares.

Funcionalidad:

- Listado, creacion, edicion y eliminacion masiva de usuarios.
- Roles configurables.
- Catalogo de abilities.
- Permisos por modulo: clientes, items, impuestos, presupuestos, facturas, facturas recurrentes, pagos, gastos, campos personalizados, reportes, proveedores de tipo de cambio, notas y dashboard.
- Dependencias entre permisos para evitar roles incompletos.
- Rutas protegidas por `bouncer`.
- Vistas con `meta.ability` o `meta.isOwner` para limitar acceso en frontend.

## 16. Campos personalizados

El sistema permite extender entidades con campos configurables.

Funcionalidad:

- CRUD de campos personalizados.
- Tipos de campo: input, textarea, numero, telefono, URL, fecha, hora, fecha/hora, dropdown y switch.
- Opciones configurables para campos desplegables.
- Uso en clientes, facturas, presupuestos, pagos y gastos.
- Valores persistidos mediante modelo `CustomFieldValue`.
- Permisos para ver, crear, editar y eliminar campos personalizados.

## 17. Impuestos

InvoiceShelf gestiona tipos de impuesto y tasas aplicables a items y documentos.

Funcionalidad:

- CRUD de tipos de impuesto.
- Uso de impuestos en items.
- Selector de impuestos en creacion de facturas y presupuestos.
- Calculo de impuestos por linea y totales.
- Reporte de impuestos.
- Permisos para ver, crear, editar y eliminar tipos de impuesto.

## 18. Monedas y tipos de cambio

El proyecto incluye soporte para multiples monedas y proveedores de tipo de cambio.

Funcionalidad:

- Catalogo de monedas.
- Consulta de monedas usadas.
- Actualizacion masiva de tipos de cambio.
- Consulta de tipo de cambio para una moneda.
- Consulta de proveedor activo.
- Listado de monedas soportadas.
- CRUD de proveedores de tipo de cambio.
- Logs de tipo de cambio mediante modelo `ExchangeRateLog`.
- Componente de conversion de tipo de cambio en documentos.

## 19. Reportes financieros

El modulo de reportes agrupa vistas financieras descargables.

Funcionalidad:

- Vista `/admin/reports`.
- Reporte de ventas.
- Reporte de perdidas y ganancias.
- Reporte de gastos.
- Reporte de impuestos.
- Descarga de reporte en PDF.
- Control de acceso por permiso `view-financial-reports`.

## 20. Notas reutilizables

El sistema administra notas que pueden insertarse en documentos.

Funcionalidad:

- CRUD de notas.
- Uso de notas en facturas, presupuestos, facturas recurrentes y pagos.
- Permisos para ver todas las notas y administrarlas.

## 21. Plantillas y PDF

InvoiceShelf contiene infraestructura para generar PDF de documentos comerciales.

Funcionalidad:

- Plantillas para facturas.
- Plantillas para presupuestos.
- Imagenes de preview de plantillas PDF.
- Servicio `PDFService`.
- Drivers de PDF, incluyendo Gotenberg.
- Configuracion de driver PDF desde settings.
- Generacion de PDF mediante jobs para facturas, presupuestos y pagos.
- Sanitizacion HTML para PDF.
- Fuentes locales incluidas.

## 22. Email y notificaciones por correo

La aplicacion permite configurar proveedores de email y enviar documentos.

Funcionalidad:

- Configuracion de mail drivers.
- Drivers basicos, SMTP, SES y Mailgun.
- Lectura y guardado de configuracion de email.
- Test de configuracion de correo.
- Configuracion de mail por empresa.
- Envio de facturas, presupuestos y pagos.
- Previsualizacion de emails antes de enviar.
- Plantillas Blade para emails HTML y texto.
- Modelo `EmailLog` para registro de correos.

## 23. Almacenamiento de archivos y discos

El proyecto soporta almacenamiento configurable para archivos, backups, logos, avatars y recibos.

Funcionalidad:

- CRUD de discos.
- Drivers de disco locales y remotos.
- Componentes para Local, S3, S3 compatible, Dropbox y DigitalOcean Spaces.
- Subida de logo de empresa.
- Subida de avatar de usuario.
- Subida y consulta de recibos de gastos.
- Integracion con media library.

## 24. Backups

InvoiceShelf incluye gestion de copias de seguridad.

Funcionalidad:

- CRUD de backups.
- Creacion de backup mediante job.
- Descarga de backup.
- Configuracion de backup en settings.
- Validaciones para ruta zip, disco de backup y discos del filesystem.
- Soporte de notificaciones de backup traducidas.

## 25. Actualizaciones automaticas

El sistema tiene un flujo de auto-update desde el panel.

Funcionalidad:

- Comprobacion de nueva version.
- Descarga de update.
- Descompresion.
- Copia de archivos.
- Eliminacion de archivos obsoletos.
- Ejecucion de migraciones.
- Finalizacion de actualizacion.
- Bloqueo por requisitos del servidor cuando no se cumplen.

## 26. Modulos y extensibilidad

InvoiceShelf tiene una seccion de modulos para ampliar funcionalidades.

Funcionalidad:

- Listado de modulos.
- Vista individual de modulo.
- Verificacion de API token.
- Activacion y desactivacion de modulos.
- Descarga de modulo.
- Subida de modulo.
- Descompresion.
- Copia/instalacion.
- Finalizacion de instalacion.
- Servicio `Module` y facade interna.
- Control reservado a owner.

## 27. Busqueda, configuracion general y datos auxiliares

El backend expone endpoints de soporte para formularios, busquedas y preferencias generales.

Funcionalidad:

- Busqueda global.
- Busqueda de usuarios.
- Paises.
- Monedas.
- Zonas horarias.
- Formatos de fecha.
- Formatos de hora.
- Siguiente numero de documento.
- Placeholders para numeracion.
- Bootstrap inicial de datos del panel.
- Configuracion global de la aplicacion.

## 28. Preferencias y personalizacion

El panel de settings permite ajustar comportamiento y formato de documentos.

Funcionalidad:

- Ajustes de cuenta.
- Informacion de compania.
- Preferencias generales.
- Personalizacion de facturas, presupuestos, pagos e items.
- Numeracion personalizada.
- Fechas de vencimiento y expiracion por defecto.
- Formatos por defecto.
- Retrospectiva de facturas.
- Configuracion de conversion de presupuesto a factura.
- Notificaciones.
- Configuracion de PDF.
- Configuracion de correo.
- Configuracion de discos.
- Backup y actualizacion.

## 29. Internacionalizacion

El proyecto esta preparado para multiples idiomas.

Funcionalidad:

- Archivos de traduccion JSON para decenas de idiomas.
- Locales disponibles en `lang/locales.js`.
- Traducciones de validacion, paginacion, auth y passwords.
- Soporte de seleccion de idioma durante instalacion.
- Textos del frontend mediante `$t(...)`.

## 30. API publica/interna versionada

La aplicacion concentra su backend principal en `/api/v1`.

Funcionalidad:

- Endpoint `ping` para comprobar instancia self-hosted.
- Endpoint de version de app.
- Recursos REST para clientes, items, unidades, facturas, presupuestos, facturas recurrentes, pagos, metodos de pago, gastos, categorias, campos personalizados, backups, discos, impuestos, roles y usuarios.
- Endpoints especificos para acciones de dominio: enviar, clonar, cambiar estado, convertir, duplicar, subir recibos, descargar backups y actualizar app.
- Separacion entre rutas admin y rutas de portal de cliente.

## 31. Jobs, eventos y tareas programadas

El backend incluye procesos asincronos y tareas de mantenimiento.

Funcionalidad:

- Jobs para generar PDF de facturas, presupuestos y pagos.
- Job para crear backups.
- Endpoint `/cron` protegido por middleware de cron.
- Comando de actualizacion probado en tests.
- Configuracion de colas.

## 32. Testing y calidad

El proyecto incluye cobertura automatizada de unidades y features.

Funcionalidad:

- Tests unitarios para modelos principales: usuarios, companias, clientes, facturas, presupuestos, pagos, gastos, impuestos, campos personalizados, recurrentes, settings y otros.
- Tests feature para modulos admin: dashboard, clientes, facturas, presupuestos, pagos, gastos, backups, roles, usuarios, settings, monedas, ubicacion, notas, etc.
- Tests feature para portal de cliente: dashboard, facturas, presupuestos, pagos, gastos y perfil.
- Pest/PHPUnit configurado.
- ESLint y Prettier para frontend.

## 33. Docker y despliegue

El repositorio trae configuraciones para desarrollo y produccion.

Funcionalidad:

- Dockerfile de desarrollo.
- Dockerfile de produccion.
- Compose para SQLite, MySQL y PostgreSQL.
- Variantes con Gotenberg para generacion PDF.
- Adminer para entorno de desarrollo.
- Scripts de entrypoint e inyeccion en produccion.
- Makefile y scripts de apoyo.

## 34. Seguridad y control de acceso

El proyecto aplica varias capas de seguridad funcional.

Funcionalidad:

- Autenticacion Sanctum para admin.
- Guard separado para portal de cliente.
- Middleware `company` para contexto empresarial.
- Middleware `bouncer` para permisos.
- Rutas de owner para settings sensibles.
- Throttling en recuperacion de contrasena admin.
- Validaciones de requests mediante controllers y rules.
- Sanitizacion de HTML para PDF.
- Politicas por recurso.
