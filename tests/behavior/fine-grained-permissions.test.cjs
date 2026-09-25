/**
 * @file fine-grained-permissions.test.cjs
 * @description Behavior tests for the fine-grained action permissions migration
 * (supabase/migrations/20260929000000_fine_grained_action_permissions.sql).
 * These are text/regex assertions over the SQL file — no live database is required.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const migrationPath = path.join(root, 'supabase/migrations/20260929000000_fine_grained_action_permissions.sql')

const read = () => fs.readFileSync(migrationPath, 'utf8')

const SIX_VERB_MODULES = ['invoices', 'estimates']
const THREE_VERB_MODULES = ['customers']
const SIX_VERBS = ['create', 'edit', 'void', 'print', 'authorize', 'process']
const THREE_VERBS = ['create', 'edit', 'void']
const NOT_GRANTED_TO_THREE_VERB_MODULES = ['print', 'authorize', 'process']

test('migration file exists and is a plain additive script', () => {
  assert.ok(fs.existsSync(migrationPath), 'expected the migration file to exist')
  const sql = read()
  assert.doesNotMatch(sql, /^\s*BEGIN\s*;/m, 'migration must not open an explicit transaction block (PL/pgSQL function BEGIN is not a transaction control statement)')
  assert.doesNotMatch(sql, /^\s*COMMIT\s*;/m, 'migration must not commit an explicit transaction block')
  assert.doesNotMatch(sql, /role_permissions/, 'migration must not touch role_permissions rows')
  assert.doesNotMatch(sql, /CREATE POLICY/, 'migration must not create RLS policies')
})

test('migration inserts exactly the 15 expected permission_catalog rows', () => {
  const sql = read()
  for (const mod of SIX_VERB_MODULES) {
    for (const verb of SIX_VERBS) {
      assert.match(sql, new RegExp(`'${mod}\\.${verb}'`), `expected ${mod}.${verb} catalog row`)
    }
  }
  for (const mod of THREE_VERB_MODULES) {
    for (const verb of THREE_VERBS) {
      assert.match(sql, new RegExp(`'${mod}\\.${verb}'`), `expected ${mod}.${verb} catalog row`)
    }
    for (const verb of NOT_GRANTED_TO_THREE_VERB_MODULES) {
      assert.doesNotMatch(sql, new RegExp(`'${mod}\\.${verb}'`), `${mod}.${verb} must not exist`)
    }
  }

  const rowKeys = sql.match(/'(invoices|estimates|customers)\.(create|edit|void|print|authorize|process)'/g) || []
  assert.equal(new Set(rowKeys).size, 15, 'expected exactly 15 distinct catalog rows')
})

test('catalog insert uses ON CONFLICT upsert semantics', () => {
  const sql = read()
  assert.match(sql, /INSERT INTO public\.permission_catalog/)
  assert.match(sql, /ON CONFLICT\s*\(permission_key\)\s*DO UPDATE/i)
})

test('permission_satisfies keeps its search_path guard and every prior clause', () => {
  const sql = read()
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.permission_satisfies/)
  assert.match(sql, /SET search_path\s*=\s*public\b/i)
  assert.match(sql, /granted_key = requested_key/, 'identity clause must be preserved')
  assert.match(sql, /right\(granted_key,\s*7\)\s*=\s*'\.manage'\s*AND\s*requested_key\s*=\s*regexp_replace\(granted_key,\s*'\\\.manage\$',\s*'\.view'\)/, 'manage->view clause must be preserved')
  assert.match(sql, /right\(granted_key,\s*7\)\s*=\s*'\.delete'\s*AND\s*requested_key IN\s*\(regexp_replace\(granted_key,\s*'\\\.delete\$',\s*'\.manage'\),\s*regexp_replace\(granted_key,\s*'\\\.delete\$',\s*'\.view'\)\)/, 'delete->manage/view clause must be preserved')
  assert.match(sql, /right\(granted_key,\s*5\)\s*=\s*'\.edit'\s*AND\s*requested_key\s*=\s*regexp_replace\(granted_key,\s*'\\\.edit\$',\s*'\.view'\)/, 'edit->view clause must be preserved')
})

test('permission_satisfies grows a bounded six-verb manage cascade', () => {
  const sql = read()
  const clauseMatch = sql.match(/right\(granted_key,\s*7\)\s*=\s*'\.manage'\s*AND\s*requested_key IN\s*\(([\s\S]*?)\)\s*\)/i)
  assert.ok(clauseMatch, 'expected a new bounded IN-list clause for the .manage cascade')

  const clauseBody = clauseMatch[1]
  const verbMatches = clauseBody.match(/\.(create|edit|void|print|authorize|process)'/g) || []
  assert.equal(new Set(verbMatches).size, 6, 'cascade must satisfy exactly the six fine-grained verbs')
  assert.doesNotMatch(clauseBody, /\.delete'/, 'the six-verb cascade must not satisfy delete')
  assert.doesNotMatch(clauseBody, /\.view'/, 'the six-verb cascade must not duplicate the existing view cascade')
})

test('grants execute on permission_satisfies to authenticated', () => {
  const sql = read()
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.permission_satisfies\(text,\s*text\)\s*TO authenticated/i)
})
