/**
 * @file customer-advance-application.test.cjs
 * @description Behavior coverage for the "Aplicar anticipo" flow (Dominican
 * Republic accounting decision: the unallocated part of a receipt is a
 * customer liability that gets applied to an open invoice later via
 * public.zyron_apply_customer_advance —
 * supabase/migrations/20261002000000_payment_posting_allocation_fix.sql).
 *
 * Two kinds of coverage, matching existing conventions:
 *  - text/regex assertions over renderer.js (style used by
 *    action-bar.test.cjs / scm-goods-receipt-posting.test.cjs);
 *  - module-level unit tests for the pure helpers in
 *    components/customer-advances.js (style used by
 *    scm-goods-receipt-posting.test.cjs, which requires
 *    components/scm-receipts.js via its CommonJS export).
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const rendererPath = path.join(root, 'renderer.js')
const indexHtmlPath = path.join(root, 'index.html')

const ZyronCustomerAdvances = require('../../components/customer-advances.js')

const readRenderer = () => fs.readFileSync(rendererPath, 'utf8')

// ---------------------------------------------------------------------------
// index.html wiring
// ---------------------------------------------------------------------------

test('index.html loads components/customer-advances.js as a same-origin script before renderer.js', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8')
  const advancesIdx = html.indexOf('<script src="./components/customer-advances.js"></script>')
  const rendererIdx = html.indexOf('<script src="./renderer.js"></script>')
  assert.ok(advancesIdx !== -1, 'expected components/customer-advances.js to be loaded')
  assert.ok(rendererIdx !== -1 && advancesIdx < rendererIdx, 'components/customer-advances.js must load before renderer.js')
})

// ---------------------------------------------------------------------------
// renderer.js: no more "Pendiente" payment status
// ---------------------------------------------------------------------------

test('the Registrar pago form no longer offers a "Pendiente" payment status', () => {
  const source = readRenderer()
  const registerPanelMatch = source.match(/const registerPanel = `([\s\S]*?)`;/)
  assert.ok(registerPanelMatch, 'expected the registerPanel template to exist')
  assert.doesNotMatch(registerPanelMatch[1], /pay-reg-status/, 'the status <select> must be removed')
  assert.doesNotMatch(registerPanelMatch[1], />Pendiente</, 'no "Pendiente" option must remain in the form')
})

test('the Registrar pago form has a date input defaulting to today, wired to p_payment_date', () => {
  const source = readRenderer()
  const registerPanelMatch = source.match(/const registerPanel = `([\s\S]*?)`;/)
  assert.match(registerPanelMatch[1], /id="pay-reg-date"\s+type="date"/)
  assert.match(source, /paymentDate:\s*document\.getElementById\('pay-reg-date'\)\?\.value \|\| today/)
})

// ---------------------------------------------------------------------------
// renderer.js: "Aplicar anticipo" action + wiring
// ---------------------------------------------------------------------------

test('the payments list offers "Aplicar anticipo" only when unallocated_amount > 0', () => {
  const source = readRenderer()
  const tableMatch = source.match(/const paymentsTable = \(payRows \|\| \[\]\)([\s\S]*?)\.join\(''\);/)
  assert.ok(tableMatch, 'expected the paymentsTable builder to exist')
  assert.match(tableMatch[1], /Number\(r\.unallocated_amount \|\| 0\) > 0\.0001/)
  assert.match(tableMatch[1], /data-pay-apply-advance="\$\{escapeHtml\(\s*r\.id\s*\)\}"/)
})

test('openAdvancePanel filters open invoices through ZyronCustomerAdvances and calls the apply RPC on submit', () => {
  const source = readRenderer()
  const panelMatch = source.match(/const openAdvancePanel = \(paymentId, customerId\) => \{([\s\S]*?)\n {4}\};/)
  assert.ok(panelMatch, 'expected the openAdvancePanel handler to exist')
  const body = panelMatch[1]
  assert.match(body, /window\.ZyronCustomerAdvances\.openInvoicesForCustomer\(arRows, customerId \|\| null\)/)
  assert.match(body, /window\.ZyronCustomerAdvances\.buildAdvanceAllocations\(entries\)/)
  assert.match(body, /window\.ZyronCustomerAdvances\.validateAdvanceAllocations\(allocations, available\)/)
  assert.match(body, /paymentsApplyCustomerAdvanceViaDb\(tid, paymentId, entries\)/)
  assert.match(body, /await renderPagosModule\(\)/, 'must refresh the list after applying')
})

test('paymentsApplyCustomerAdvanceViaDb calls the zyron_apply_customer_advance RPC and surfaces errors', () => {
  const source = readRenderer()
  const fnMatch = source.match(/const paymentsApplyCustomerAdvanceViaDb = async \([\s\S]*?\n\};/)
  assert.ok(fnMatch, 'expected paymentsApplyCustomerAdvanceViaDb to exist')
  const body = fnMatch[0]
  assert.match(body, /dbRpc\(\s*'zyron_apply_customer_advance'/)
  assert.match(body, /p_tenant_id:\s*tenantId/)
  assert.match(body, /p_payment_id:\s*paymentId/)
  assert.match(body, /p_allocations:\s*rpcAllocations/)
  assert.match(body, /p_apply_date:/)
  assert.match(body, /if \(result\.error\) return \{ data: \{ error: result\.error\.message/)
  assert.doesNotMatch(body, /table:\s*'payment_allocations'/, 'must not insert allocations directly; the RPC owns that')
})

// ---------------------------------------------------------------------------
// components/customer-advances.js pure helpers
// ---------------------------------------------------------------------------

test('openInvoicesForCustomer keeps only positive-balance invoices for the given customer', () => {
  const invoices = [
    { id: 'i1', customer_id: 'c1', total: 100, amount_paid: 40 },
    { id: 'i2', customer_id: 'c1', total: 100, amount_paid: 100 },
    { id: 'i3', customer_id: 'c2', total: 50, amount_paid: 0 },
    { id: 'i4', customer_id: 'c1', balance_due: 10 }
  ]
  const result = ZyronCustomerAdvances.openInvoicesForCustomer(invoices, 'c1')
  assert.deepEqual(result.map((r) => r.id), ['i1', 'i4'])
})

test('openInvoicesForCustomer returns every open invoice when the payment has no customer', () => {
  const invoices = [
    { id: 'i1', customer_id: 'c1', total: 100, amount_paid: 40 },
    { id: 'i2', customer_id: 'c2', total: 50, amount_paid: 0 }
  ]
  const result = ZyronCustomerAdvances.openInvoicesForCustomer(invoices, null)
  assert.deepEqual(result.map((r) => r.id), ['i1', 'i2'])
})

test('buildAdvanceAllocations maps invoiceId/amount to invoice_id/amount and drops empty rows', () => {
  const result = ZyronCustomerAdvances.buildAdvanceAllocations([
    { invoiceId: 'i1', amount: 25.5 },
    { invoiceId: '', amount: 10 },
    { invoiceId: 'i2', amount: 0 },
    { invoiceId: 'i3', amount: -5 }
  ])
  assert.deepEqual(result, [{ invoice_id: 'i1', amount: 25.5 }])
})

test('validateAdvanceAllocations rejects a zero/negative sum', () => {
  const result = ZyronCustomerAdvances.validateAdvanceAllocations([], 100)
  assert.equal(result.ok, false)
  assert.match(result.error, /mayor que cero/)
})

test('validateAdvanceAllocations rejects a sum over the available amount', () => {
  const result = ZyronCustomerAdvances.validateAdvanceAllocations([{ invoice_id: 'i1', amount: 150 }], 100)
  assert.equal(result.ok, false)
  assert.match(result.error, /no puede superar el anticipo disponible/)
})

test('validateAdvanceAllocations accepts a sum within the available amount', () => {
  const result = ZyronCustomerAdvances.validateAdvanceAllocations([{ invoice_id: 'i1', amount: 60 }, { invoice_id: 'i2', amount: 40 }], 100)
  assert.equal(result.ok, true)
  assert.equal(result.sum, 100)
})
