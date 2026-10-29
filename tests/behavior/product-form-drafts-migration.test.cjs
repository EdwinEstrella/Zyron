/**
 * @file product-form-drafts-migration.test.cjs
 * @description Behavior tests for the product form drafts migration
 * (supabase/migrations/20261029000000_product_form_drafts.sql).
 * Text/regex assertions over the SQL file — no live database required,
 * matching the style of payment-posting-migration.test.cjs.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const migrationPath = path.join(root, 'supabase/migrations/20261029000000_product_form_drafts.sql')

const read = () => fs.readFileSync(migrationPath, 'utf8')

test('migration file exists and contains explanatory header comments', () => {
  assert.ok(fs.existsSync(migrationPath), 'expected migration file to exist')
  const sql = read()
  assert.match(sql, /^-- Product form drafts:/m, 'expected header comment introducing the migration')
})

test('defines table public.product_form_drafts with expected schema and columns', () => {
  const sql = read()
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.product_form_drafts\s*\(/)
  assert.match(sql, /id\s+uuid\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/)
  assert.match(sql, /tenant_id\s+uuid\s+NOT NULL\s+REFERENCES\s+public\.tenants\s*\(id\)\s+ON DELETE CASCADE/)
  assert.match(sql, /user_id\s+uuid\s+NOT NULL\s+DEFAULT\s+auth\.uid\(\)\s+REFERENCES\s+auth\.users\s*\(id\)\s+ON DELETE CASCADE/)
  assert.match(sql, /payload\s+jsonb\s+NOT NULL\s+DEFAULT\s+'\{\}'::jsonb/)
  assert.match(sql, /created_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/)
  assert.match(sql, /updated_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/)
})

test('enforces UNIQUE (tenant_id, user_id) for one draft per user per tenant', () => {
  const sql = read()
  assert.match(sql, /UNIQUE\s*\(\s*tenant_id\s*,\s*user_id\s*\)/)
})

test('creates foreign-key coverage index on user_id', () => {
  const sql = read()
  assert.match(sql, /CREATE INDEX IF NOT EXISTS\s+\w+\s+ON\s+public\.product_form_drafts\s*\(\s*user_id\s*\);/)
})

test('enables row level security on public.product_form_drafts', () => {
  const sql = read()
  assert.match(sql, /ALTER TABLE\s+public\.product_form_drafts\s+ENABLE ROW LEVEL SECURITY;/)
})

test('configures idempotent RLS policy product_form_drafts_own using auth.uid() and get_user_tenants()', () => {
  const sql = read()
  assert.match(sql, /DROP POLICY IF EXISTS\s+["']?product_form_drafts_own["']?\s+ON\s+public\.product_form_drafts;/)
  assert.match(sql, /CREATE POLICY\s+["']?product_form_drafts_own["']?\s+ON\s+public\.product_form_drafts/)
  assert.match(sql, /FOR ALL/)
  assert.match(sql, /TO authenticated/)

  // Both USING and WITH CHECK must wrap auth.uid() and check tenant_id via get_user_tenants()
  const usingMatch = sql.match(/USING\s*\(\s*user_id\s*=\s*\(\s*SELECT\s+auth\.uid\(\)\s*\)\s+AND\s+tenant_id\s+IN\s*\(\s*SELECT\s+public\.get_user_tenants\(\)\s*\)\s*\)/)
  assert.ok(usingMatch, 'policy must check user_id = (SELECT auth.uid()) AND tenant_id IN (SELECT public.get_user_tenants()) in USING clause')

  const withCheckMatch = sql.match(/WITH CHECK\s*\(\s*user_id\s*=\s*\(\s*SELECT\s+auth\.uid\(\)\s*\)\s+AND\s+tenant_id\s+IN\s*\(\s*SELECT\s+public\.get_user_tenants\(\)\s*\)\s*\)/)
  assert.ok(withCheckMatch, 'policy must check user_id = (SELECT auth.uid()) AND tenant_id IN (SELECT public.get_user_tenants()) in WITH CHECK clause')
})

test('revokes access from anon and grants CRUD to authenticated', () => {
  const sql = read()
  assert.match(sql, /REVOKE ALL ON\s+public\.product_form_drafts\s+FROM anon;/)
  assert.match(sql, /GRANT SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+public\.product_form_drafts\s+TO authenticated;/)
})

test('creates updated_at BEFORE UPDATE trigger with search_path protection', () => {
  const sql = read()
  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+public\.product_form_drafts_touch\(\)/)
  assert.match(sql, /SET search_path\s*=\s*public/)
  assert.match(sql, /NEW\.updated_at\s*=\s*now\(\);/)
  assert.match(sql, /DROP TRIGGER IF EXISTS\s+tr_product_form_drafts_touch\s+ON\s+public\.product_form_drafts;/)
  assert.match(sql, /CREATE TRIGGER\s+tr_product_form_drafts_touch\s+BEFORE UPDATE\s+ON\s+public\.product_form_drafts/)
  assert.match(sql, /FOR EACH ROW\s+EXECUTE FUNCTION\s+public\.product_form_drafts_touch\(\);/)
})

test('ends with PostgREST schema reload notification', () => {
  const sql = read()
  assert.match(sql, /NOTIFY pgrst,\s*'reload schema';/)
})
