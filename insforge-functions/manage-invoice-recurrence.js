/**
 * Retirada: plantillas de recurrencia viven en el cliente Zyron (`index.html`):
 * `invoiceRecurrenceCreateViaDb`, `invoiceRecurrenceUpdateViaDb`, `invoiceRecurrenceDeleteViaDb`.
 * El slug `manage-invoice-recurrence` debe eliminarse del proyecto InsForge (MCP delete-function o panel).
 */
module.exports = async function manageInvoiceRecurrenceRetired() {
  return new Response(
    JSON.stringify({
      error:
        'manage-invoice-recurrence edge retirado. Actualiza el app Zyron; la logica corre por IPC contra la base InsForge.'
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
