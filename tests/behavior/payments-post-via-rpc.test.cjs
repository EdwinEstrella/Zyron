/**
 * @file payments-post-via-rpc.test.cjs
 * @description Behavior coverage for the CxC cash-receipt accounting bug fix.
 * paymentsCreatePaymentViaDb() (renderer.js) used to insert directly into
 * payments/payment_allocations and recompute invoice totals in JS, without
 * ever posting a journal entry. It must now delegate to the
 * public.zyron_post_payment RPC, which owns the allocations, the invoice
 * amount_paid/status update and the accounting entry.
 *
 * These are text/regex assertions over renderer.js — no live database or
 * DOM is required, matching the style used by action-bar.test.cjs and
 * fine-grained-permissions.test.cjs.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const rendererPath = path.join(root, 'renderer.js')

const readRenderer = () => fs.readFileSync(rendererPath, 'utf8')

/** Extracts the paymentsCreatePaymentViaDb function body (up to the next
 * top-level const declaration, paymentsSetReconciliationViaDb). */
const extractPaymentsCreatePaymentBody = (source) => {
  const match = source.match(
    /const paymentsCreatePaymentViaDb = async \(tenantId, body\) => \{([\s\S]*?)\r?\n\};\r?\n\r?\nconst paymentsSetReconciliationViaDb/
  )
  assert.ok(match, 'expected paymentsCreatePaymentViaDb to exist in renderer.js')
  return match[1]
}

test('paymentsCreatePaymentViaDb calls the zyron_post_payment RPC', () => {
  const body = extractPaymentsCreatePaymentBody(readRenderer())
  assert.match(body, /dbRpc\(\s*'zyron_post_payment'/, 'must post through public.zyron_post_payment')
  assert.match(body, /p_tenant_id:\s*tenantId/)
  assert.match(body, /p_amount:\s*amount/)
  assert.match(body, /p_allocations:\s*rpcAllocations/)
})

test('paymentsCreatePaymentViaDb passes p_payment_date to the RPC (the 9-arg signature added in 20261002000000)', () => {
  const body = extractPaymentsCreatePaymentBody(readRenderer())
  assert.match(body, /p_payment_date:\s*body\.paymentDate/, 'must forward the form date to the RPC')
})

test('paymentsCreatePaymentViaDb never books a "pending" payment status (a receipt only exists once money is confirmed)', () => {
  const body = extractPaymentsCreatePaymentBody(readRenderer())
  assert.doesNotMatch(body, /'pending'/, 'the client-side pending status patch must be removed; payments are always completed')
  assert.doesNotMatch(body, /body\.status/, 'body.status is no longer read; the form no longer offers a status choice')
})

test('paymentsCreatePaymentViaDb no longer inserts directly into payments or payment_allocations', () => {
  const body = extractPaymentsCreatePaymentBody(readRenderer())
  assert.doesNotMatch(body, /dbInsert\(\s*\{\s*table:\s*'payments'/, 'ledger-affecting payment insert must go through the RPC, not a direct dbInsert')
  assert.doesNotMatch(body, /table:\s*'payment_allocations'/, 'allocations must be written by the RPC, not the client')
})

test('paymentsCreatePaymentViaDb still rejects allocations that exceed the payment amount before calling the RPC', () => {
  const body = extractPaymentsCreatePaymentBody(readRenderer())
  assert.match(body, /allocSum - amount > 0\.0001/, 'client-side guard for over-allocation must remain (fast, friendly error before the round-trip)')
})

test('paymentsCreatePaymentViaDb maps invoiceId/amount allocations to the RPC snake_case shape', () => {
  const body = extractPaymentsCreatePaymentBody(readRenderer())
  assert.match(body, /invoice_id:\s*a\.invoiceId/, 'allocations sent to the RPC must use invoice_id, matching zyron_post_payment jsonb shape')
})

test('paymentsCreatePaymentViaDb surfaces RPC errors instead of swallowing them', () => {
  const body = extractPaymentsCreatePaymentBody(readRenderer())
  assert.match(body, /if \(result\.error\) return \{ data: \{ error: result\.error\.message/)
})
