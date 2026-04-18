/**
 * Retirada: fiscal / NCF / tasas vive en el cliente Zyron (`taxComplianceManageViaDb`).
 * Eliminar slug `manage-tax-compliance` en InsForge (MCP delete-function o panel).
 */
module.exports = async function manageTaxComplianceRetired() {
  return new Response(
    JSON.stringify({
      error:
        'manage-tax-compliance edge retirado. Actualiza el app Zyron; la logica corre por IPC contra la base InsForge.'
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
