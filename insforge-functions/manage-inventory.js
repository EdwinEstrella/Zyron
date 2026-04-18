/**
 * Retirada: inventario avanzado vive en el cliente Zyron (`index.html`):
 * `inventoryBootstrapViaDb`, `inventoryListWarehousesViaDb`, `inventoryListStockByWarehouseViaDb`,
 * `inventoryListKardexViaDb`, `inventoryListLowStockViaDb`, `inventoryUpsertWarehouseViaDb`,
 * `inventoryDeleteWarehouseViaDb`, `inventoryManualAdjustViaDb`.
 * El slug `manage-inventory` debe eliminarse del proyecto InsForge (MCP delete-function o panel).
 */
module.exports = async function manageInventoryRetired() {
  return new Response(
    JSON.stringify({
      error:
        'manage-inventory edge retirado. Actualiza el app Zyron; la logica corre por IPC contra la base InsForge.'
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
