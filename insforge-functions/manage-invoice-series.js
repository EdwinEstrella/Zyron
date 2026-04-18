/**
 * Retirada: series de facturacion viven en el cliente Zyron (`index.html`):
 * `invoiceSeriesUpsertViaDb`, `invoiceSeriesDeleteViaDb` (IPC dbInsert/dbUpdate/dbDelete).
 * El slug `manage-invoice-series` debe eliminarse del proyecto InsForge (MCP delete-function o panel).
 */
module.exports = async function manageInvoiceSeriesRetired() {
  return new Response(
    JSON.stringify({
      error:
        'manage-invoice-series edge retirado. Actualiza el app Zyron; la logica corre por IPC contra la base InsForge.'
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
