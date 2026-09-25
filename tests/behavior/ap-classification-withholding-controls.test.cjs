/**
 * @file ap-classification-withholding-controls.test.cjs
 * @description Behavior tests for the Accounts Payable (CxP) MVP M1 migration
 * (supabase/migrations/20261003000000_ap_classification_withholding_controls.sql):
 * supplier classification, per-tenant AP withholding settings, three new
 * control accounts (supplier_advances, isr_withholding_payable,
 * itbis_withholding_payable), suppliers/purchase_bills/supplier_payments
 * permission keys plus the scm.manage/scm.view umbrella, and the
 * zyron_ap_ncf_valid NCF-shape validator.
 * Text/regex assertions over the SQL file — no live database required,
 * matching the style used by payment-posting-migration.test.cjs.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const migrationPath = path.join(root, 'supabase/migrations/20261003000000_ap_classification_withholding_controls.sql')

const read = () => fs.readFileSync(migrationPath, 'utf8')

// ---------------------------------------------------------------------------
// 1. scm_suppliers.classification
// ---------------------------------------------------------------------------

test('scm_suppliers gains a classification column defaulting existing rows to formal', () => {
  const sql = read()
  assert.match(
    sql,
    /ALTER TABLE public\.scm_suppliers\s+ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'formal';/
  )
})

test('scm_suppliers.classification is constrained to the four DGII classifications', () => {
  const sql = read()
  assert.match(sql, /ADD CONSTRAINT scm_suppliers_classification_check/)
  assert.match(
    sql,
    /CHECK \(classification IN \('formal', 'informal', 'individual', 'foreign'\)\)/
  )
})

// ---------------------------------------------------------------------------
// 2. public.ap_withholding_settings
// ---------------------------------------------------------------------------

test('ap_withholding_settings is a per-tenant per-classification table with a composite PK', () => {
  const sql = read()
  const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.ap_withholding_settings \([\s\S]*?\);/)
  assert.ok(tableMatch, 'expected ap_withholding_settings table definition')
  const body = tableMatch[0]
  assert.match(body, /tenant_id uuid NOT NULL REFERENCES public\.tenants \(id\) ON DELETE CASCADE/)
  assert.match(body, /classification text NOT NULL CHECK \(classification IN \('formal', 'informal', 'individual', 'foreign'\)\)/)
  assert.match(body, /isr_pct numeric\(5,2\) NOT NULL DEFAULT 0 CHECK \(isr_pct >= 0 AND isr_pct <= 100\)/)
  assert.match(body, /itbis_pct numeric\(5,2\) NOT NULL DEFAULT 0 CHECK \(itbis_pct >= 0 AND itbis_pct <= 100\)/)
  assert.match(body, /updated_at timestamptz NOT NULL DEFAULT now\(\)/)
  assert.match(body, /PRIMARY KEY \(tenant_id, classification\)/)
})

test('ap_withholding_settings does not reuse or alias the AR tenant_fiscal_settings pct fields', () => {
  const sql = read()
  const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.ap_withholding_settings \([\s\S]*?\);/)
  assert.doesNotMatch(tableMatch[0], /tenant_fiscal_settings/)
})

test('ap_withholding_settings enables RLS with tenant-member read and purchase_bills.manage write, InitPlan-optimized', () => {
  const sql = read()
  assert.match(sql, /ALTER TABLE public\.ap_withholding_settings ENABLE ROW LEVEL SECURITY;/)

  const readPolicy = sql.match(/CREATE POLICY "ap_withholding_settings_read"[\s\S]*?;/)
  assert.ok(readPolicy, 'expected a read policy')
  assert.match(readPolicy[0], /FOR SELECT TO authenticated/)
  assert.match(readPolicy[0], /\(SELECT public\.is_super_admin\(\)\)/)
  assert.match(readPolicy[0], /tenant_id IN \(SELECT public\.get_user_tenants\(\)\)/)

  const insertPolicy = sql.match(/CREATE POLICY "ap_withholding_settings_insert"[\s\S]*?;/)
  assert.ok(insertPolicy, 'expected an insert policy')
  assert.match(insertPolicy[0], /FOR INSERT TO authenticated/)
  assert.match(insertPolicy[0], /\(SELECT public\.is_super_admin\(\)\)/)
  assert.match(insertPolicy[0], /tenant_id IN \(SELECT public\.get_user_tenants\(\)\)/)
  assert.match(insertPolicy[0], /public\.check_user_permission\(tenant_id, 'purchase_bills\.manage'\)/)

  const updatePolicy = sql.match(/CREATE POLICY "ap_withholding_settings_update"[\s\S]*?;/)
  assert.ok(updatePolicy, 'expected an update policy')
  assert.match(updatePolicy[0], /FOR UPDATE TO authenticated/)
  assert.match(updatePolicy[0], /public\.check_user_permission\(tenant_id, 'purchase_bills\.manage'\)/)
})

test('ap_withholding_settings has no policy allowing writes without purchase_bills.manage', () => {
  const sql = read()
  const policies = sql.match(/CREATE POLICY "ap_withholding_settings_\w+"[\s\S]*?;/g) || []
  assert.ok(policies.length >= 3, 'expected at least 3 policies (read, insert, update)')
  const writePolicies = policies.filter((p) => /FOR (INSERT|UPDATE)/.test(p))
  assert.ok(writePolicies.length >= 2, 'expected insert and update policies')
  for (const policy of writePolicies) {
    assert.match(policy, /check_user_permission\(tenant_id, 'purchase_bills\.manage'\)/)
  }
})

test('existing tenants are seeded with placeholder ISR/ITBIS rates per classification', () => {
  const sql = read()
  const seedMatch = sql.match(/INSERT INTO public\.ap_withholding_settings \(tenant_id, classification, isr_pct, itbis_pct\)[\s\S]*?ON CONFLICT \(tenant_id, classification\) DO NOTHING;/)
  assert.ok(seedMatch, 'expected an existing-tenant seed insert')
  const body = seedMatch[0]
  assert.match(body, /\('formal', 0, 0\)/)
  assert.match(body, /\('informal', 10, 100\)/)
  assert.match(body, /\('individual', 10, 100\)/)
  assert.match(body, /\('foreign', 27, 100\)/)
})

test('a comment marks the withholding defaults as placeholders needing accountant confirmation', () => {
  const sql = read()
  assert.match(sql, /placeholder/i)
  assert.match(sql, /accountant/i)
})

test('future tenants are seeded by a dedicated SECURITY DEFINER trigger, revoked from PUBLIC', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_seed_ap_withholding_settings\(\)[\s\S]*?RETURN NEW;\nEND \$\$;/)
  assert.ok(fnMatch, 'expected zyron_seed_ap_withholding_settings() function')
  const body = fnMatch[0]
  assert.match(body, /SECURITY DEFINER/)
  assert.match(body, /SET search_path\s*=\s*public\b/)
  assert.match(body, /NEW\.id, 'formal', 0, 0/)
  assert.match(body, /NEW\.id, 'informal', 10, 100/)
  assert.match(body, /NEW\.id, 'individual', 10, 100/)
  assert.match(body, /NEW\.id, 'foreign', 27, 100/)

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.zyron_seed_ap_withholding_settings\(\) FROM PUBLIC;/)
  assert.match(
    sql,
    /CREATE TRIGGER tr_zyron_seed_ap_withholding_settings AFTER INSERT ON public\.tenants\s+FOR EACH ROW EXECUTE FUNCTION public\.zyron_seed_ap_withholding_settings\(\);/
  )
})

// ---------------------------------------------------------------------------
// 3. Control accounts: supplier_advances, isr_withholding_payable,
//    itbis_withholding_payable.
// ---------------------------------------------------------------------------

const PRIOR_CONTROL_KEYS = [
  'cash_bank', 'accounts_receivable', 'inventory', 'sales_revenue', 'sales_tax_payable',
  'cost_of_sales', 'inventory_adjustment_gain', 'inventory_adjustment_loss',
  'accounts_payable', 'purchase_tax_credit', 'gr_ir_clearing', 'purchase_expense',
  'customer_advances',
]
const NEW_CONTROL_KEYS = ['supplier_advances', 'isr_withholding_payable', 'itbis_withholding_payable']

test('the control_key CHECK constraint carries forward every prior key plus the 3 new AP keys (16 total)', () => {
  const sql = read()
  assert.match(sql, /ADD CONSTRAINT accounting_control_accounts_control_key_check/)
  const checkMatch = sql.match(/CHECK \(control_key IN \([\s\S]*?\)\);/)
  assert.ok(checkMatch, 'expected the control_key CHECK constraint body')
  const body = checkMatch[0]
  for (const key of [...PRIOR_CONTROL_KEYS, ...NEW_CONTROL_KEYS]) {
    assert.match(body, new RegExp(`'${key}'`), `expected control_key ${key} to still be allowed`)
  }
})

test('1400/2400/2410 are seeded for existing tenants with the correct account_type and normal_balance', () => {
  const sql = read()
  const seedMatch = sql.match(/INSERT INTO public\.accounting_accounts[\s\S]*?'itbis_withholding_payable'\)[\s\S]*?ON CONFLICT \(tenant_id, code\) DO NOTHING;/)
  assert.ok(seedMatch, 'expected an accounting_accounts seed row block including the new controls')
  const body = seedMatch[0]
  assert.match(body, /'1400', 'Anticipos a proveedores', 'asset', 'debit', 'supplier_advances'/)
  assert.match(body, /'2400', 'ISR retenido por pagar', 'liability', 'credit', 'isr_withholding_payable'/)
  assert.match(body, /'2410', 'ITBIS retenido por pagar', 'liability', 'credit', 'itbis_withholding_payable'/)
})

test('the control-account mapping for the 3 new controls joins on both code and account_type', () => {
  const sql = read()
  const mapMatch = sql.match(/INSERT INTO public\.accounting_control_accounts \(tenant_id, control_key, account_id\)\s*SELECT t\.id, s\.control_key, a\.id[\s\S]*?ON CONFLICT \(tenant_id, control_key\) DO UPDATE SET account_id = EXCLUDED\.account_id, updated_at = now\(\);/)
  assert.ok(mapMatch, 'expected the control-account mapping insert for the new controls')
  const body = mapMatch[0]
  assert.match(body, /\('supplier_advances', '1400', 'asset'\)/)
  assert.match(body, /\('isr_withholding_payable', '2400', 'liability'\)/)
  assert.match(body, /\('itbis_withholding_payable', '2410', 'liability'\)/)
  assert.match(body, /a\.code = s\.code AND a\.account_type = s\.account_type/, 'expected the join to check both code and account_type')
})

test('zyron_seed_accounting_controls() is replaced carrying forward every prior account and control plus the 3 new ones', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_seed_accounting_controls\(\)[\s\S]*?RETURN NEW;\nEND \$\$;/)
  assert.ok(fnMatch, 'expected zyron_seed_accounting_controls() to be replaced')
  const body = fnMatch[0]

  const priorCodes = ['1010', '1100', '1150', '1300', '2100', '2150', '2200', '2300', '4100', '4200', '5100', '5200', '5300']
  for (const code of priorCodes) {
    assert.match(body, new RegExp(`'${code}'`), `expected pre-existing code ${code} to still be seeded for new tenants`)
  }
  assert.match(body, /'1400', 'Anticipos a proveedores', 'asset', 'debit', true/)
  assert.match(body, /'2400', 'ISR retenido por pagar', 'liability', 'credit', true/)
  assert.match(body, /'2410', 'ITBIS retenido por pagar', 'liability', 'credit', true/)

  for (const key of [...PRIOR_CONTROL_KEYS, ...NEW_CONTROL_KEYS]) {
    assert.match(body, new RegExp(`\\('${key}', '\\d{4}'\\)`), `expected control mapping for ${key} in the seed trigger`)
  }
})

// ---------------------------------------------------------------------------
// 4. Permissions: suppliers.*, purchase_bills.*, supplier_payments.*, plus
//    the scm.manage/scm.view umbrella.
// ---------------------------------------------------------------------------

test('permission_catalog gains suppliers.*, purchase_bills.* and supplier_payments.* keys via ON CONFLICT DO UPDATE', () => {
  const sql = read()
  const insertMatch = sql.match(/INSERT INTO public\.permission_catalog \(permission_key, label, description\)\s*VALUES[\s\S]*?ON CONFLICT \(permission_key\) DO UPDATE\s*SET label = EXCLUDED\.label,\s*description = EXCLUDED\.description;/)
  assert.ok(insertMatch, 'expected a permission_catalog insert with ON CONFLICT DO UPDATE')
  const body = insertMatch[0]
  const expectedKeys = [
    'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.void', 'suppliers.manage',
    'purchase_bills.view', 'purchase_bills.create', 'purchase_bills.authorize', 'purchase_bills.manage',
    'supplier_payments.view', 'supplier_payments.create', 'supplier_payments.manage',
  ]
  for (const key of expectedKeys) {
    assert.match(body, new RegExp(`\\('${key.replace('.', '\\.')}',`), `expected permission_catalog row for ${key}`)
  }
})

test('permission_satisfies carries forward every prior clause from 20260929000000_fine_grained_action_permissions.sql', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.permission_satisfies\(granted_key text, requested_key text\)[\s\S]*?END \$\$;/)
  assert.ok(fnMatch, 'expected permission_satisfies() to be replaced')
  const body = fnMatch[0]
  assert.match(body, /LANGUAGE plpgsql IMMUTABLE SET search_path = public/)
  assert.match(body, /granted_key = requested_key OR/)
  assert.match(body, /right\(granted_key, 7\) = '\.manage' AND requested_key = regexp_replace\(granted_key, '\\\.manage\$', '\.view'\)/)
  assert.match(body, /right\(granted_key, 7\) = '\.delete' AND requested_key IN \(regexp_replace\(granted_key, '\\\.delete\$', '\.manage'\), regexp_replace\(granted_key, '\\\.delete\$', '\.view'\)\)/)
  assert.match(body, /right\(granted_key, 5\) = '\.edit' AND requested_key = regexp_replace\(granted_key, '\\\.edit\$', '\.view'\)/)
  for (const verb of ['create', 'edit', 'void', 'print', 'authorize', 'process']) {
    assert.match(body, new RegExp(`regexp_replace\\(granted_key, '\\\\\\.manage\\$', '\\.${verb}'\\)`), `expected the .manage cascade to still satisfy .${verb}`)
  }
})

test('permission_satisfies adds the scm.manage/scm.view umbrella over suppliers/purchase_bills/supplier_payments', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.permission_satisfies\(granted_key text, requested_key text\)[\s\S]*?END \$\$;/)
  const body = fnMatch[0]
  assert.match(body, /granted_key = 'scm\.manage'/)
  assert.match(body, /requested_key LIKE 'suppliers\.%'/)
  assert.match(body, /requested_key LIKE 'purchase_bills\.%'/)
  assert.match(body, /requested_key LIKE 'supplier_payments\.%'/)
  assert.match(body, /granted_key = 'scm\.view' AND requested_key IN \('suppliers\.view', 'purchase_bills\.view', 'supplier_payments\.view'\)/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.permission_satisfies\(text, text\) TO authenticated;/)
})

// ---------------------------------------------------------------------------
// 5. zyron_ap_ncf_valid
// ---------------------------------------------------------------------------

test('zyron_ap_ncf_valid is IMMUTABLE and returns boolean', () => {
  const sql = read()
  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.zyron_ap_ncf_valid\(p_classification text, p_ncf text\)\s*RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS \$\$/
  )
})

test('formal suppliers require B01/B14/B15 or E31/E44/E45', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_ap_ncf_valid[\s\S]*?\n\$\$;/)
  assert.ok(fnMatch)
  const formalBranch = fnMatch[0].match(/WHEN p_classification = 'formal' THEN[\s\S]*?WHEN p_classification IN/)
  assert.ok(formalBranch, 'expected a formal branch')
  const branch = formalBranch[0]
  assert.match(branch, /B\(01\|14\|15\)\[0-9\]\{8\}/)
  assert.match(branch, /E\(31\|44\|45\)\[0-9\]\{10\}/)
})

test('informal/individual suppliers require buyer-issued B11 or E41', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_ap_ncf_valid[\s\S]*?\n\$\$;/)
  const branchMatch = fnMatch[0].match(/WHEN p_classification IN \('informal', 'individual'\) THEN[\s\S]*?WHEN p_classification = 'foreign'/)
  assert.ok(branchMatch, 'expected an informal/individual branch')
  const branch = branchMatch[0]
  assert.match(branch, /B11\[0-9\]\{8\}/)
  assert.match(branch, /E41\[0-9\]\{10\}/)
})

test('foreign suppliers accept no NCF, or B13/B17/E47 when present', () => {
  const sql = read()
  const fnMatch = sql.match(/CREATE OR REPLACE FUNCTION public\.zyron_ap_ncf_valid[\s\S]*?\n\$\$;/)
  const branchMatch = fnMatch[0].match(/WHEN p_classification = 'foreign' THEN[\s\S]*?ELSE false/)
  assert.ok(branchMatch, 'expected a foreign branch')
  const branch = branchMatch[0]
  assert.match(branch, /p_ncf IS NULL OR btrim\(p_ncf\) = ''/)
  assert.match(branch, /B\(13\|17\)\[0-9\]\{8\}/)
  assert.match(branch, /E47\[0-9\]\{10\}/)
})

test('zyron_ap_ncf_valid is granted to authenticated', () => {
  const sql = read()
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.zyron_ap_ncf_valid\(text, text\) TO authenticated;/)
})

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

test('migration performs no destructive DDL on tables (only the control_key CHECK constraint is dropped and recreated)', () => {
  const sql = read()
  assert.doesNotMatch(sql, /DROP TABLE/i)
  assert.doesNotMatch(sql, /DROP COLUMN/i)
})
