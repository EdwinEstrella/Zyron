/**
 * @file ap-purchase-bill-withholding.test.cjs
 * @description Behavior tests for the Accounts Payable (CxP) MVP M2 migration
 * (supabase/migrations/20261004000000_ap_purchase_bill_withholding.sql):
 * scm_purchase_bills withholding columns/CHECKs, scm_purchase_bill_items
 * line_kind CHECK, the status CHECK (NOT VALID), the partial unique NCF
 * index, the atomic zyron_create_purchase_bill RPC and the withholding-aware
 * zyron_post_purchase_bill RPC. Text/regex assertions over the SQL file — no
 * live database required, matching the style used by
 * ap-classification-withholding-controls.test.cjs (M1).
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const migrationPath = path.join(root, 'supabase/migrations/20261004000000_ap_purchase_bill_withholding.sql')

const read = () => fs.readFileSync(migrationPath, 'utf8')

// ---------------------------------------------------------------------------
// 1. scm_purchase_bills withholding columns + CHECKs
// ---------------------------------------------------------------------------

test('scm_purchase_bills gains supplier_classification as a nullable snapshot column', () => {
  const sql = read()
  assert.match(sql, /ADD COLUMN IF NOT EXISTS supplier_classification text,/)
  assert.doesNotMatch(sql, /supplier_classification text NOT NULL/)
})

test('supplier_classification is constrained to the four DGII classifications or NULL', () => {
  const sql = read()
  assert.match(sql, /ADD CONSTRAINT scm_purchase_bills_supplier_classification_check/)
  assert.match(
    sql,
    /CHECK \(supplier_classification IS NULL OR supplier_classification IN \('formal', 'informal', 'individual', 'foreign'\)\)/
  )
})

test('isr_withholding_pct and itbis_withholding_pct default to 0 and are bounded 0..100', () => {
  const sql = read()
  assert.match(sql, /ADD COLUMN IF NOT EXISTS isr_withholding_pct numeric\(5, 2\) NOT NULL DEFAULT 0,/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS itbis_withholding_pct numeric\(5, 2\) NOT NULL DEFAULT 0,/)
  assert.match(sql, /CHECK \(isr_withholding_pct >= 0 AND isr_withholding_pct <= 100\)/)
  assert.match(sql, /CHECK \(itbis_withholding_pct >= 0 AND itbis_withholding_pct <= 100\)/)
})

test('isr_withheld and itbis_withheld default to 0 and cannot be negative', () => {
  const sql = read()
  assert.match(sql, /ADD COLUMN IF NOT EXISTS isr_withheld numeric\(14, 2\) NOT NULL DEFAULT 0,/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS itbis_withheld numeric\(14, 2\) NOT NULL DEFAULT 0;/)
  assert.match(sql, /CONSTRAINT scm_purchase_bills_isr_withheld_check\s*\n\s*CHECK \(isr_withheld >= 0\)/)
  assert.match(sql, /CONSTRAINT scm_purchase_bills_itbis_withheld_check\s*\n\s*CHECK \(itbis_withheld >= 0\)/)
})

test('the sum of both withheld amounts can never exceed the bill total', () => {
  const sql = read()
  assert.match(sql, /ADD CONSTRAINT scm_purchase_bills_withheld_not_exceed_total_check/)
  assert.match(sql, /CHECK \(isr_withheld \+ itbis_withheld <= total\)/)
})

// ---------------------------------------------------------------------------
// 2. scm_purchase_bill_items.line_kind CHECK
// ---------------------------------------------------------------------------

test('scm_purchase_bill_items.line_kind is constrained to product/expense/service', () => {
  const sql = read()
  assert.match(sql, /ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'product';/)
  assert.match(sql, /ADD CONSTRAINT scm_purchase_bill_items_line_kind_check/)
  assert.match(sql, /CHECK \(line_kind IN \('product', 'expense', 'service'\)\)/)
})

// ---------------------------------------------------------------------------
// 3. scm_purchase_bills.status CHECK, added NOT VALID
// ---------------------------------------------------------------------------

test('scm_purchase_bills gains a status CHECK covering draft/posted/partial/paid/void, added NOT VALID', () => {
  const sql = read()
  assert.match(sql, /ADD CONSTRAINT scm_purchase_bills_status_check/)
  assert.match(
    sql,
    /CHECK \(status IN \('draft', 'posted', 'partial', 'paid', 'void'\)\) NOT VALID;/
  )
})

// ---------------------------------------------------------------------------
// 4. Partial unique NCF index
// ---------------------------------------------------------------------------

test('a partial unique index prevents duplicate case-insensitive supplier NCFs on non-void bills', () => {
  const sql = read()
  const idxMatch = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS scm_purchase_bills_supplier_ncf_unique_idx[\s\S]*?;/)
  assert.ok(idxMatch, 'expected the partial unique NCF index')
  const body = idxMatch[0]
  assert.match(body, /ON public\.scm_purchase_bills \(tenant_id, supplier_id, upper\(supplier_ncf\)\)/)
  assert.match(body, /WHERE supplier_ncf IS NOT NULL AND status <> 'void';/)
})

// ---------------------------------------------------------------------------
// 5. zyron_create_purchase_bill
// ---------------------------------------------------------------------------

function extractFunction(sql, name) {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\nEND \\$\\$;`)
  const match = sql.match(re)
  assert.ok(match, `expected function ${name} to be defined`)
  return match[0]
}

test('zyron_create_purchase_bill has the exact signature from design and is SECURITY DEFINER', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(
    fn,
    /CREATE OR REPLACE FUNCTION public\.zyron_create_purchase_bill\(\s*p_tenant_id uuid,\s*p_supplier_id uuid,\s*p_supplier_ncf text,\s*p_bill_date date,\s*p_due_date date,\s*p_currency text,\s*p_items jsonb,\s*p_isr_pct numeric DEFAULT NULL,\s*p_itbis_pct numeric DEFAULT NULL,\s*p_notes text DEFAULT NULL,\s*p_post boolean DEFAULT true\s*\) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS \$\$/
  )
})

test('zyron_create_purchase_bill guards on purchase_bills.create', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(fn, /IF NOT public\.check_user_permission\(p_tenant_id, 'purchase_bills\.create'\) THEN/)
})

test('zyron_create_purchase_bill requires the supplier to belong to the tenant and be active', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(fn, /SELECT \* INTO v_supplier FROM public\.scm_suppliers WHERE id = p_supplier_id AND tenant_id = p_tenant_id;/)
  assert.match(fn, /IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no encontrado\.'; END IF;/)
  assert.match(fn, /IF NOT v_supplier\.is_active THEN RAISE EXCEPTION 'El proveedor no está activo\.'; END IF;/)
})

test('zyron_create_purchase_bill rejects an empty item list', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(fn, /IF p_items IS NULL OR jsonb_array_length\(p_items\) = 0 THEN/)
  assert.match(fn, /RAISE EXCEPTION 'La factura debe tener al menos una línea\.';/)
})

test('zyron_create_purchase_bill rejects product lines (MVP: expense/service only)', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(fn, /IF v_line_kind IS NULL OR v_line_kind NOT IN \('expense', 'service'\) THEN/)
  assert.match(fn, /RAISE EXCEPTION 'Las líneas de una factura de compra directa solo admiten gasto o servicio\.';/)
})

test('zyron_create_purchase_bill validates quantity, unit_cost, discount and tax_rate', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(fn, /IF v_quantity <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero\.'; END IF;/)
  assert.match(fn, /IF v_unit_cost < 0 THEN RAISE EXCEPTION 'El costo unitario no puede ser negativo\.'; END IF;/)
  assert.match(fn, /IF v_discount < 0 OR v_discount > 100 THEN RAISE EXCEPTION 'El descuento debe estar entre 0 y 100\.'; END IF;/)
  assert.match(fn, /IF v_tax_rate < 0 THEN RAISE EXCEPTION 'La tasa de impuesto no puede ser negativa\.'; END IF;/)
})

test('zyron_create_purchase_bill computes net/tax exactly per the design formula', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  const netMatches = fn.match(/v_net := round\(v_quantity \* v_unit_cost \* \(1 - v_discount \/ 100\), 2\);/g) || []
  assert.ok(netMatches.length >= 2, 'expected the net formula in both the validation pass and the insert pass')
  const taxMatches = fn.match(/v_tax := round\(v_net \* v_tax_rate \/ 100, 2\);/g) || []
  assert.ok(taxMatches.length >= 1, 'expected the tax formula derived from net')
})

test('zyron_create_purchase_bill resolves withholding pct from explicit override, else ap_withholding_settings, else 0', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(
    fn,
    /SELECT \* INTO v_settings FROM public\.ap_withholding_settings\s*WHERE tenant_id = p_tenant_id AND classification = v_supplier\.classification;/
  )
  assert.match(fn, /v_isr_pct := COALESCE\(p_isr_pct, v_settings\.isr_pct, 0\);/)
  assert.match(fn, /v_itbis_pct := COALESCE\(p_itbis_pct, v_settings\.itbis_pct, 0\);/)
  assert.match(fn, /v_isr_withheld := round\(v_subtotal \* v_isr_pct \/ 100, 2\);/)
  assert.match(fn, /v_itbis_withheld := round\(v_tax_total \* v_itbis_pct \/ 100, 2\);/)
})

test('zyron_create_purchase_bill defaults due_date to bill_date + supplier.credit_days', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(fn, /v_due_date := COALESCE\(p_due_date, p_bill_date \+ v_supplier\.credit_days\);/)
})

test('zyron_create_purchase_bill numbers the bill via zyron_next_scm_number with the FC prefix', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(fn, /v_bill_number := public\.zyron_next_scm_number\(p_tenant_id, 'purchase_bill', 'FC'\);/)
})

test('zyron_create_purchase_bill inserts the bill in draft status carrying the classification snapshot and withholding amounts', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  const insertMatch = fn.match(/INSERT INTO public\.scm_purchase_bills \([\s\S]*?RETURNING id INTO v_bill_id;/)
  assert.ok(insertMatch, 'expected the bill insert')
  const body = insertMatch[0]
  assert.match(body, /supplier_classification, isr_withholding_pct, itbis_withholding_pct, isr_withheld, itbis_withheld/)
  assert.match(body, /'draft', p_notes,/)
  assert.match(body, /v_supplier\.classification, v_isr_pct, v_itbis_pct, v_isr_withheld, v_itbis_withheld/)
})

test('zyron_create_purchase_bill inserts one scm_purchase_bill_items row per validated line', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(
    fn,
    /INSERT INTO public\.scm_purchase_bill_items \(\s*tenant_id, bill_id, description, quantity, unit_cost, discount, tax_rate, line_total, line_kind\s*\) VALUES/
  )
})

test('zyron_create_purchase_bill posts in the same transaction only when p_post is true, and always returns the bill id', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_create_purchase_bill')
  assert.match(fn, /IF p_post THEN\s*PERFORM public\.zyron_post_purchase_bill\(p_tenant_id, v_bill_id\);\s*END IF;/)
  assert.match(fn, /RETURN v_bill_id;\nEND \$\$;/)
})

// ---------------------------------------------------------------------------
// 6. zyron_post_purchase_bill: withholding legs + preserved behavior
// ---------------------------------------------------------------------------

test('zyron_post_purchase_bill keeps its original 2-arg signature', () => {
  const sql = read()
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.zyron_post_purchase_bill\(p_tenant_id uuid, p_bill_id uuid\)\s*RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS \$\$/
  )
})

test('zyron_post_purchase_bill guards on purchase_bills.authorize (design D12), replacing the umbrella check', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  assert.match(fn, /IF NOT public\.check_user_permission\(p_tenant_id, 'purchase_bills\.authorize'\) THEN/)
  assert.doesNotMatch(fn, /zyron_purchasing_allowed/)
})

test('zyron_post_purchase_bill preserves the lock-and-require-draft guard and the idempotent already-posted lookup', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  assert.match(fn, /SELECT \* INTO v_bill FROM public\.scm_purchase_bills WHERE id = p_bill_id AND tenant_id = p_tenant_id FOR UPDATE;/)
  assert.match(fn, /IF NOT FOUND THEN RAISE EXCEPTION 'Factura de compra no encontrada\.'; END IF;/)
  const idempotentMatch = fn.match(/IF v_bill\.status <> 'draft' THEN[\s\S]*?RETURN v_entry;\s*END IF;/)
  assert.ok(idempotentMatch, 'expected the idempotent already-posted lookup')
  assert.match(idempotentMatch[0], /se\.source_type = 'purchase_bill' AND se\.source_id = p_bill_id/)
})

test('zyron_post_purchase_bill validates the NCF against the classification before posting', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  assert.match(
    fn,
    /IF NOT public\.zyron_ap_ncf_valid\(v_bill\.supplier_classification, v_bill\.supplier_ncf\) THEN\s*RAISE EXCEPTION 'NCF inválido para el tipo de proveedor\.';\s*END IF;/
  )
})

test('zyron_post_purchase_bill preserves the product/GR-IR/inventory account branching for legacy product lines', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  assert.match(fn, /WHEN v_line\.line_kind = 'product' AND v_bill\.goods_receipt_id IS NOT NULL\s*THEN public\.zyron_accounting_control\(p_tenant_id, 'gr_ir_clearing'\)/)
  assert.match(fn, /WHEN v_line\.line_kind = 'product' AND v_line\.product_id IS NOT NULL\s*THEN public\.zyron_resolve_product_account\(p_tenant_id, v_line\.product_id, 'inventory'\)/)
  assert.match(fn, /ELSE public\.zyron_accounting_control\(p_tenant_id, 'purchase_expense'\)/)
})

test('zyron_post_purchase_bill raises when a resolved control account is NULL', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  const raiseMatches = fn.match(/RAISE EXCEPTION 'Cuenta de control % no configurada', '\w+';/g) || []
  assert.ok(raiseMatches.length >= 5, 'expected a NULL-control guard for expense, tax credit, AP and both withholding controls')
  for (const key of ['purchase_expense', 'purchase_tax_credit', 'accounts_payable', 'isr_withholding_payable', 'itbis_withholding_payable']) {
    assert.match(fn, new RegExp(`RAISE EXCEPTION 'Cuenta de control % no configurada', '${key}';`))
  }
})

test('zyron_post_purchase_bill credits accounts_payable net of both withheld amounts', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  assert.match(fn, /v_ap_net := v_bill\.total - COALESCE\(v_bill\.isr_withheld, 0\) - COALESCE\(v_bill\.itbis_withheld, 0\);/)
  const apLine = fn.match(/v_account := public\.zyron_accounting_control\(p_tenant_id, 'accounts_payable'\);[\s\S]*?'debit', 0, 'credit', v_ap_net\s*\)\);/)
  assert.ok(apLine, 'expected the accounts_payable credit leg using v_ap_net')
})

test('zyron_post_purchase_bill posts the five journal legs: expense debit, tax credit debit, AP credit, ISR credit, ITBIS credit', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  // Leg 1: expense/product debit — built inside the item loop, always present when net != 0.
  assert.match(fn, /'debit', v_net, 'credit', 0,\s*'source_line_id', v_line\.id/)
  // Leg 2: purchase_tax_credit debit, only when tax_total > 0.
  assert.match(fn, /IF COALESCE\(v_bill\.tax_total, 0\) > 0 THEN[\s\S]*?'debit', v_bill\.tax_total, 'credit', 0/)
  // Leg 3: accounts_payable credit, net of withholdings, unconditional.
  assert.match(fn, /'debit', 0, 'credit', v_ap_net/)
  // Leg 4: isr_withholding_payable credit, only when isr_withheld > 0.
  assert.match(fn, /IF COALESCE\(v_bill\.isr_withheld, 0\) > 0 THEN[\s\S]*?'debit', 0, 'credit', v_bill\.isr_withheld/)
  // Leg 5: itbis_withholding_payable credit, only when itbis_withheld > 0.
  assert.match(fn, /IF COALESCE\(v_bill\.itbis_withheld, 0\) > 0 THEN[\s\S]*?'debit', 0, 'credit', v_bill\.itbis_withheld/)
})

test('zyron_post_purchase_bill omits a zero-net line from the journal entirely', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  assert.match(fn, /IF v_net = 0 THEN CONTINUE; END IF;/)
})

test('zyron_post_purchase_bill keeps posting through purchase_bill / purchase_bill.posted and the original memo/metadata', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  assert.match(
    fn,
    /public\.zyron_post_accounting_entry\(\s*p_tenant_id, 'purchase_bill', p_bill_id, 'purchase_bill\.posted', COALESCE\(v_bill\.bill_date, current_date\), COALESCE\(v_bill\.currency, 'DOP'\),/
  )
  assert.match(fn, /jsonb_build_object\('supplier_id', v_bill\.supplier_id\)/)
})

test('zyron_post_purchase_bill still sets status to posted and stamps posted_at/updated_at', () => {
  const sql = read()
  const fn = extractFunction(sql, 'zyron_post_purchase_bill')
  assert.match(fn, /UPDATE public\.scm_purchase_bills SET status = 'posted', posted_at = now\(\), updated_at = now\(\) WHERE id = p_bill_id;/)
})

// ---------------------------------------------------------------------------
// 7. Grants
// ---------------------------------------------------------------------------

test('both RPCs are revoked from PUBLIC and granted to authenticated', () => {
  const sql = read()
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.zyron_create_purchase_bill\(uuid, uuid, text, date, date, text, jsonb, numeric, numeric, text, boolean\) FROM PUBLIC;/
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.zyron_create_purchase_bill\(uuid, uuid, text, date, date, text, jsonb, numeric, numeric, text, boolean\) TO authenticated;/
  )
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.zyron_post_purchase_bill\(uuid, uuid\) FROM PUBLIC;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.zyron_post_purchase_bill\(uuid, uuid\) TO authenticated;/)
})

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

test('migration performs no destructive DDL on tables (only CHECK constraints are dropped/recreated)', () => {
  const sql = read()
  assert.doesNotMatch(sql, /DROP TABLE/i)
  assert.doesNotMatch(sql, /DROP COLUMN/i)
})
