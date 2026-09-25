/**
 * ZyronScmReceipts — pure helpers for the goods-receipt posting flow
 * (renderCadenaSuministroModule 'recepciones' tab in renderer.js).
 *
 * public.zyron_post_goods_receipt(p_tenant_id, p_receipt_id) (see
 * supabase/migrations/20260927000000_purchases_accounting_integration.sql)
 * only moves stock/kardex/accounting for rows already present in
 * scm_goods_receipt_items; it never creates those rows and never advances
 * scm_purchase_order_items.quantity_received. This module is the pure,
 * side-effect-free half of that flow (line derivation, insert-row shaping,
 * quantity_received patch computation), loaded as a plain same-origin
 * <script> before renderer.js (same pattern as components/action-bar.js) so
 * it can be unit-tested without a DOM.
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
  if (root) {
    root.ZyronScmReceipts = api
  }
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict'

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

  /**
   * Default receipt lines for a purchase order: one per PO item that still
   * has an open balance (quantity_ordered - quantity_received > 0), carrying
   * the PO's own unit cost. Fully-received or malformed lines are dropped.
   */
  const defaultLinesFromPurchaseOrder = (poItems) =>
    (poItems || [])
      .map((item) => {
        const ordered = Number(item.quantity_ordered) || 0
        const received = Number(item.quantity_received) || 0
        return {
          po_item_id: item.id,
          product_id: item.product_id,
          quantity: round2(ordered - received),
          unit_cost: Number(item.unit_cost) || 0
        }
      })
      .filter((line) => line.product_id && line.quantity > 0)

  /**
   * Insert-ready rows for public.scm_goods_receipt_items, from either
   * defaultLinesFromPurchaseOrder() output or a manually captured line
   * ({ productId, quantity, unitCost, poItemId? }).
   */
  const buildReceiptItemRows = (tenantId, receiptId, lines) =>
    (lines || [])
      .map((line) => ({
        tenant_id: tenantId,
        receipt_id: receiptId,
        po_item_id: line.po_item_id ?? line.poItemId ?? null,
        product_id: line.product_id ?? line.productId ?? null,
        quantity: Number(line.quantity) || 0,
        unit_cost: Number(line.unit_cost ?? line.unitCost ?? 0) || 0
      }))
      .filter((row) => row.product_id && row.quantity > 0)

  /**
   * public.zyron_post_goods_receipt never touches scm_purchase_order_items,
   * so the caller advances quantity_received itself for every posted line
   * that came from a PO. Pure helper: given the PO's current items and the
   * receipt lines that were just posted, returns the patch list
   * [{ id, quantity_received }] to write back (one row per po_item_id, added
   * quantities summed when a PO item was split across lines).
   */
  const buildQuantityReceivedPatches = (poItems, receivedLines) => {
    const byId = new Map((poItems || []).map((item) => [String(item.id), item]))
    const addedByPoItemId = new Map()
    for (const line of receivedLines || []) {
      const poItemId = line.po_item_id ?? line.poItemId
      if (!poItemId) continue
      const key = String(poItemId)
      addedByPoItemId.set(key, (addedByPoItemId.get(key) || 0) + (Number(line.quantity) || 0))
    }
    const patches = []
    for (const [key, addedQty] of addedByPoItemId) {
      const item = byId.get(key)
      if (!item || addedQty <= 0) continue
      patches.push({ id: item.id, quantity_received: round2((Number(item.quantity_received) || 0) + addedQty) })
    }
    return patches
  }

  return {
    defaultLinesFromPurchaseOrder,
    buildReceiptItemRows,
    buildQuantityReceivedPatches
  }
})
