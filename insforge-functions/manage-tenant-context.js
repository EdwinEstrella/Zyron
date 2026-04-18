/**
 * Retirada: contexto de tenant (moneda/locale) vive en el cliente Zyron (`index.html`):
 * lectura vía `app_settings` + `tenantContextUpsertViaDb` para `upsert_context`.
 * El slug `manage-tenant-context` debe eliminarse del proyecto InsForge (MCP delete-function o panel).
 */
module.exports = async function manageTenantContextRetired() {
  return new Response(
    JSON.stringify({
      error:
        'manage-tenant-context edge retirado. Actualiza el app Zyron; la logica corre por IPC contra la base InsForge.'
    }),
    {
      status: 410,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    }
  )
}
