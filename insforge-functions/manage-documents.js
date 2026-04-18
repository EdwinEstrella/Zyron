/**
 * Retirada: branding de documentos PDF/HTML vive en el cliente Zyron (`index.html`):
 * `invoiceDocumentBrandingUpsertViaDb` (app_settings + auditoria).
 * El slug `manage-documents` debe eliminarse del proyecto InsForge (MCP delete-function o panel).
 */
module.exports = async function manageDocumentsRetired() {
  return new Response(
    JSON.stringify({
      error:
        'manage-documents edge retirado. Actualiza el app Zyron; la logica corre por IPC contra la base InsForge.'
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
