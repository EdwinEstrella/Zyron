/**
 * Retirada: reportes viven en el cliente Zyron (`reportsManageViaDb`).
 * Eliminar slug `manage-reports` en InsForge (MCP delete-function o panel).
 */
module.exports = async function manageReportsRetired() {
  return new Response(
    JSON.stringify({
      error:
        'manage-reports edge retirado. Actualiza el app Zyron; la logica corre por IPC contra la base InsForge.'
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
