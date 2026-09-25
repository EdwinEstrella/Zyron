/**
 * ZyronCustomerAdvances — pure helpers for the "Aplicar anticipo" flow
 * (renderPagosModule 'payments' tab in renderer.js), which applies part of
 * a payment's unallocated_amount ("anticipo de cliente") to open invoices
 * later, via public.zyron_apply_customer_advance (see
 * supabase/migrations/20261002000000_payment_posting_allocation_fix.sql).
 *
 * That RPC owns the payment_allocations insert, the invoice
 * amount_paid/status update, the payments.unallocated_amount decrement and
 * the Dr customer_advances / Cr accounts_receivable journal entry; this
 * module is the pure, side-effect-free half (open-invoice filtering,
 * allocation-row shaping, client-side sum guard), loaded as a plain
 * same-origin <script> before renderer.js (same pattern as
 * components/action-bar.js and components/scm-receipts.js) so it can be
 * unit-tested without a DOM.
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
  if (root) {
    root.ZyronCustomerAdvances = api
  }
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict'

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

  /**
   * Open invoices (balance_due > 0) eligible for an advance application.
   * `invoices` is the same accounts-receivable row shape
   * fetchAccountsReceivableViaDb() already returns (balance_due precomputed,
   * or derived from total/amount_paid when absent). When paymentCustomerId
   * is null/undefined every open invoice is returned, matching
   * zyron_apply_customer_advance's own check, which only enforces the
   * customer match when payment.customer_id is set.
   */
  const openInvoicesForCustomer = (invoices, paymentCustomerId) =>
    (invoices || []).filter((inv) => {
      const bal = Number(
        inv.balance_due != null ? inv.balance_due : Number(inv.total || 0) - Number(inv.amount_paid || 0)
      )
      if (!(bal > 0.0001)) return false
      if (paymentCustomerId == null) return true
      return String(inv.customer_id || '') === String(paymentCustomerId)
    })

  /**
   * Raw {invoiceId, amount} rows captured from the modal's per-invoice
   * amount inputs -> RPC-ready {invoice_id, amount} allocations for
   * zyron_apply_customer_advance, same invoiceId/amount -> invoice_id/amount
   * mapping paymentsCreatePaymentViaDb() already uses for zyron_post_payment.
   * Rows with no invoice or a non-positive amount are dropped.
   */
  const buildAdvanceAllocations = (entries) =>
    (entries || [])
      .filter((e) => e && e.invoiceId && Number(e.amount) > 0)
      .map((e) => ({ invoice_id: e.invoiceId, amount: round2(e.amount) }))

  /**
   * Client-side guard mirroring zyron_apply_customer_advance's own checks
   * (sum > 0, sum <= payment.unallocated_amount) so the user gets a fast,
   * friendly error before the round-trip.
   */
  const validateAdvanceAllocations = (allocations, availableAmount) => {
    const sum = round2((allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0))
    if (sum <= 0) {
      return { ok: false, error: 'Debe aplicar un monto mayor que cero.', sum }
    }
    if (sum - round2(availableAmount) > 0.0001) {
      return { ok: false, error: 'La suma aplicada no puede superar el anticipo disponible.', sum }
    }
    return { ok: true, error: null, sum }
  }

  return {
    openInvoicesForCustomer,
    buildAdvanceAllocations,
    validateAdvanceAllocations
  }
})
