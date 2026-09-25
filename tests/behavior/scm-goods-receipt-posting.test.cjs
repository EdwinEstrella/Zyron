/**
 * @file scm-goods-receipt-posting.test.cjs
 * @description Behavior coverage for the goods-receipt accounting bug fix.
 * The 'recepciones' tab in renderCadenaSuministroModule (renderer.js) used
 * to insert scm_goods_receipts with no line items and never post to the
 * ledger. It must now capture receipt lines, insert
 * scm_goods_receipt_items, and call public.zyron_post_goods_receipt.
 *
 * Two kinds of coverage, matching existing conventions:
 *  - text/regex assertions over renderer.js (style used by
 *    action-bar.test.cjs / online-only-refactor.test.cjs);
 *  - module-level unit tests for the pure helpers in
 *    components/scm-receipts.js (style used by action-bar.test.cjs, which
 *    requires components/action-bar.js via its CommonJS export).
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const rendererPath = path.join(root, 'renderer.js')

const ZyronScmReceipts = require('../../components/scm-receipts.js')

const readRenderer = () => fs.readFileSync(rendererPath, 'utf8')

const extractReceiptHandler = (source) => {
  const match = source.match(
    /document\.getElementById\('btn-registrar-recepcion'\)\?\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n {4}\}\);/
  )
  assert.ok(match, 'expected the btn-registrar-recepcion click handler to exist in renderer.js')
  return match[1]
}

// ---------------------------------------------------------------------------
// renderer.js wiring
// ---------------------------------------------------------------------------

test('the receipt handler inserts scm_goods_receipt_items before posting', () => {
  const handler = extractReceiptHandler(readRenderer())
  assert.match(handler, /table:\s*'scm_goods_receipt_items'/, 'must insert the receipt line items')
  assert.match(handler, /ZyronScmReceipts\.buildReceiptItemRows/, 'must shape rows via the shared pure helper')
})

test('the receipt handler posts through public.zyron_post_goods_receipt', () => {
  const handler = extractReceiptHandler(readRenderer())
  assert.match(handler, /dbRpc\(\s*'zyron_post_goods_receipt'/, 'must call the posting RPC')
  assert.match(handler, /p_tenant_id:\s*tid/)
  assert.match(handler, /p_receipt_id:\s*receipt\.id/)
})

test('the receipt handler surfaces a posting failure instead of swallowing it', () => {
  const handler = extractReceiptHandler(readRenderer())
  assert.match(handler, /if \(post\.error\) \{[\s\S]*?window\.ZyronDialog\.alert/, 'a failed RPC call must alert the user')
})

test('the receipt handler advances scm_purchase_order_items.quantity_received for PO-linked lines', () => {
  const handler = extractReceiptHandler(readRenderer())
  assert.match(handler, /ZyronScmReceipts\.buildQuantityReceivedPatches/)
  assert.match(handler, /table:\s*'scm_purchase_order_items'/)
})

test('index.html loads components/scm-receipts.js before renderer.js', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  const scmIdx = html.indexOf('components/scm-receipts.js')
  const rendererIdx = html.indexOf('src="./renderer.js"')
  assert.ok(scmIdx > -1, 'index.html must load components/scm-receipts.js')
  assert.ok(scmIdx < rendererIdx, 'components/scm-receipts.js must load before renderer.js')
})

// ---------------------------------------------------------------------------
// components/scm-receipts.js pure helpers
// ---------------------------------------------------------------------------

test('defaultLinesFromPurchaseOrder derives remaining quantity at the PO unit cost', () => {
  const poItems = [
    { id: 'poi-1', product_id: 'prod-1', quantity_ordered: 10, quantity_received: 4, unit_cost: 12.5 },
    { id: 'poi-2', product_id: 'prod-2', quantity_ordered: 5, quantity_received: 5, unit_cost: 3 },
    { id: 'poi-3', product_id: null, quantity_ordered: 2, quantity_received: 0, unit_cost: 1 }
  ]
  const lines = ZyronScmReceipts.defaultLinesFromPurchaseOrder(poItems)
  assert.deepEqual(lines, [{ po_item_id: 'poi-1', product_id: 'prod-1', quantity: 6, unit_cost: 12.5 }])
})

test('buildReceiptItemRows shapes tenant-scoped insert rows and drops zero-quantity lines', () => {
  const rows = ZyronScmReceipts.buildReceiptItemRows('tenant-1', 'receipt-1', [
    { product_id: 'prod-1', quantity: 6, unit_cost: 12.5, po_item_id: 'poi-1' },
    { productId: 'prod-2', quantity: 0, unitCost: 3 }
  ])
  assert.deepEqual(rows, [
    { tenant_id: 'tenant-1', receipt_id: 'receipt-1', po_item_id: 'poi-1', product_id: 'prod-1', quantity: 6, unit_cost: 12.5 }
  ])
})

test('buildQuantityReceivedPatches sums added quantity per PO item', () => {
  const poItems = [{ id: 'poi-1', quantity_ordered: 10, quantity_received: 4 }]
  const receivedLines = [
    { po_item_id: 'poi-1', quantity: 4 },
    { po_item_id: 'poi-1', quantity: 2 }
  ]
  const patches = ZyronScmReceipts.buildQuantityReceivedPatches(poItems, receivedLines)
  assert.deepEqual(patches, [{ id: 'poi-1', quantity_received: 10 }])
})

test('buildQuantityReceivedPatches ignores manually captured lines with no po_item_id', () => {
  const patches = ZyronScmReceipts.buildQuantityReceivedPatches(
    [{ id: 'poi-1', quantity_ordered: 10, quantity_received: 0 }],
    [{ product_id: 'prod-1', quantity: 3 }]
  )
  assert.deepEqual(patches, [])
})
