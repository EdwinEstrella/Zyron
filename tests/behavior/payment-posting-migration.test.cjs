/**
 * @file payment-posting-migration.test.cjs
 * @description Behavior tests for the customer-advance accounting migration
 * (supabase/migrations/20261002000000_payment_posting_allocation_fix.sql).
 * Dominican Republic accounting decision: the unallocated part of a receipt
 * is a customer liability ("anticipo de cliente"), not a debit balance
 * parked inside accounts_receivable, and a payment date is now explicit
 * (p_payment_date) instead of always current_date.
 * Text/regex assertions over the SQL file — no live database required,
 * matching the style used by fine-grained-permissions.test.cjs.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const migrationPath = path.join(root, 'supabase/migrations/20261002000000_payment_posting_allocation_fix.sql')

const read = () => fs.readFileSync(migrationPath, 'utf8')

// ---------------------------------------------------------------------------
// customer_advances control account
// ---------------------------------------------------------------------------

test('the control_key CHECK constraint now allows customer_advances', () => {
  const sql = read()
  assert.match(sql, /ADD CONSTRAINT accounting_control_accounts_control_key_check/)
  assert.match(sql, /CHECK \(control_key IN \([\s\S]*?'customer_advances'[\s\S]*?\)\)/)
})

test('customer_advances is seeded for existing tenants with a liability account', () => {
  const sql = read()
  const seedMatch = sql.match(/INSERT INTO public\.accounting_accounts[\s\S]*?'customer_advances'\)[\s\S]*?ON CONFLICT \(tenant_id, code\) DO NOTHING;/)
  assert.ok(seedMatch, 'expected an accounting_accounts seed row for customer_advances')
  assert.match(seedMatch[0], /'2300', 'Anticipos de clientes', 'liability', 'credit', 'customer_advances'/)
  assert.match(sql, /INSERT INTO public\.accounting_control_accounts[\s\S]*?\('customer_advances', '2300'\)/)
})

test('the new-tenant seed trigger function carries forward every prior account and adds customer_advances/2300', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_seed_accounting_controls\(\)[\s\S]*?RETURN NEW;\nEND \$\$;/)
  assert.ok(fnMatch, 'expected zyron_seed_accounting_controls() to be replaced')
  const body = fnMatch[0]
  // Carried forward from 20260924000000_accounting_overhaul.sql / 20260927000000_purchases_accounting_integration.sql.
  for (const code of ['1010', '1100', '1150', '1300', '2100', '2150', '2200', '4100', '4200', '5100', '5200', '5300']) {
    assert.match(body, new RegExp(`'${code}'`), `expected pre-existing code ${code} to still be seeded for new tenants`)
  }
  assert.match(body, /'2300', 'Anticipos de clientes', 'liability', 'credit', true/)
  assert.match(body, /\('customer_advances', '2300'\)/)
})

// ---------------------------------------------------------------------------
// zyron_post_payment: signature change (DROP old 8-arg, CREATE 9-arg)
// ---------------------------------------------------------------------------

test('the old 8-arg zyron_post_payment signature is dropped', () => {
  const sql = read()
  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.zyron_post_payment\(uuid, numeric, text, uuid, text, text, text, jsonb\);/
  )
})

test('zyron_post_payment gains p_payment_date as the last parameter, defaulting to current_date', () => {
  const sql = read()
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.zyron_post_payment\(p_tenant_id uuid, p_amount numeric, p_currency text, p_customer_id uuid, p_method text, p_reference text, p_notes text, p_allocations jsonb, p_payment_date date DEFAULT current_date\)/
  )
})

test('zyron_post_payment keeps SECURITY DEFINER, search_path and the permission check', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_post_payment\([\s\S]*?\nEND \$\$;/)
  assert.ok(fnMatch)
  assert.match(fnMatch[0], /SECURITY DEFINER/)
  assert.match(fnMatch[0], /SET search_path\s*=\s*public\b/)
  assert.match(fnMatch[0], /zyron_accounting_allowed\(p_tenant_id, 'accounting\.ledger\.manage'\)/)
})

test('the allocation-sum guard still only rejects over-allocation, not partial allocation', () => {
  const sql = read()
  assert.match(sql, /IF v_sum > p_amount THEN RAISE EXCEPTION/, 'must reject SUM(allocations) > amount')
  assert.doesNotMatch(sql, /IF v_sum <> p_amount THEN RAISE EXCEPTION/, 'must not require exact full allocation')
})

test('payments.payment_date and the journal entry date use p_payment_date, not current_date', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_post_payment\([\s\S]*?\nEND \$\$;/)
  const body = fnMatch[0]
  assert.match(body, /VALUES \(p_tenant_id,p_customer_id,p_amount,upper\(p_currency\),'completed',p_payment_date,/, 'payments.payment_date must be p_payment_date')
  assert.match(body, /zyron_post_accounting_entry\(p_tenant_id,'payment',v_payment,'payment\.received',p_payment_date,/, 'the journal entry date must be p_payment_date')
})

test('zyron_post_payment splits the unallocated remainder into customer_advances instead of accounts_receivable', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_post_payment\([\s\S]*?\nEND \$\$;/)
  const body = fnMatch[0]
  assert.match(body, /v_remainder := p_amount - v_sum;/)
  assert.match(body, /zyron_accounting_control\(p_tenant_id,'cash_bank'\),'debit',p_amount,'credit',0/, 'cash_bank leg debits the full amount')
  assert.match(body, /IF v_sum > 0 THEN[\s\S]*?zyron_accounting_control\(p_tenant_id,'accounts_receivable'\),'debit',0,'credit',v_sum/, 'accounts_receivable is credited only the allocated sum, and only when positive')
  assert.match(body, /IF v_remainder > 0 THEN[\s\S]*?zyron_accounting_control\(p_tenant_id,'customer_advances'\),'debit',0,'credit',v_remainder/, 'customer_advances is credited the unallocated remainder, and only when positive')
})

test('the new 9-arg zyron_post_payment signature is granted to authenticated and revoked from PUBLIC', () => {
  const sql = read()
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.zyron_post_payment\(uuid,numeric,text,uuid,text,text,text,jsonb,date\) FROM PUBLIC;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.zyron_post_payment\(uuid,numeric,text,uuid,text,text,text,jsonb,date\) TO authenticated;/)
})

test('payments/payment_allocations columns match the effective schema (payment_date, method, payment_method_code)', () => {
  const sql = read()
  assert.match(sql, /payment_date/)
  assert.match(sql, /\bmethod\b/)
  assert.match(sql, /payment_method_code/)
  assert.doesNotMatch(sql, /\bpaid_at\b/)
  assert.doesNotMatch(sql, /\bpayment_method\b(?!_code)/)
})

// ---------------------------------------------------------------------------
// zyron_apply_customer_advance
// ---------------------------------------------------------------------------

test('zyron_apply_customer_advance exists with the expected signature and security posture', () => {
  const sql = read()
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.zyron_apply_customer_advance\(p_tenant_id uuid, p_payment_id uuid, p_allocations jsonb, p_apply_date date DEFAULT current_date\)/
  )
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_apply_customer_advance\([\s\S]*?\nEND \$\$;/)
  assert.ok(fnMatch)
  assert.match(fnMatch[0], /SECURITY DEFINER/)
  assert.match(fnMatch[0], /SET search_path\s*=\s*public\b/)
  assert.match(fnMatch[0], /zyron_accounting_allowed\(p_tenant_id, 'accounting\.ledger\.manage'\)/)
})

test('zyron_apply_customer_advance locks the payment row and requires it to be completed', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_apply_customer_advance\([\s\S]*?\nEND \$\$;/)
  const body = fnMatch[0]
  assert.match(body, /SELECT \* INTO v_payment FROM public\.payments WHERE id=p_payment_id AND tenant_id=p_tenant_id FOR UPDATE;/)
  assert.match(body, /IF v_payment\.status <> 'completed' THEN RAISE EXCEPTION/)
})

test('zyron_apply_customer_advance rejects a sum over the available unallocated_amount', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_apply_customer_advance\([\s\S]*?\nEND \$\$;/)
  const body = fnMatch[0]
  assert.match(body, /IF v_sum <= 0 THEN RAISE EXCEPTION/)
  assert.match(body, /IF v_sum > COALESCE\(v_payment\.unallocated_amount, 0\) THEN RAISE EXCEPTION/)
})

test('zyron_apply_customer_advance decrements payments.unallocated_amount and posts Dr customer_advances / Cr accounts_receivable', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_apply_customer_advance\([\s\S]*?\nEND \$\$;/)
  const body = fnMatch[0]
  assert.match(body, /UPDATE public\.payments SET unallocated_amount = unallocated_amount - v_sum/)
  assert.match(body, /zyron_accounting_control\(p_tenant_id,'customer_advances'\),'debit',v_sum,'credit',0/)
  assert.match(body, /zyron_accounting_control\(p_tenant_id,'accounts_receivable'\),'debit',0,'credit',v_sum/)
})

test('zyron_apply_customer_advance posts through a source distinct from the original payment source (fresh source_id, own event_type)', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_apply_customer_advance\([\s\S]*?\nEND \$\$;/)
  const body = fnMatch[0]
  assert.match(body, /zyron_post_accounting_entry\(p_tenant_id,'payment_advance_application',gen_random_uuid\(\),'payment\.advance_applied'/)
})

test('zyron_apply_customer_advance is granted to authenticated and revoked from PUBLIC', () => {
  const sql = read()
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.zyron_apply_customer_advance\(uuid,uuid,jsonb,date\) FROM PUBLIC;/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.zyron_apply_customer_advance\(uuid,uuid,jsonb,date\) TO authenticated;/)
})

test('migration performs no destructive DDL on tables (only the superseded function signature is dropped)', () => {
  const sql = read()
  assert.doesNotMatch(sql, /DROP TABLE/i)
  assert.doesNotMatch(sql, /DROP FUNCTION public\.zyron_apply_customer_advance/i)
})
