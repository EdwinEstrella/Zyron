/**
 * @file product-form-drafts-ui.test.cjs
 * @description Behavior coverage for product form drafts UI (save, resume banner, discard, cleanup).
 *
 * Assertions:
 * 1. Three helpers exist and target product_form_drafts (load, save, delete).
 * 2. Save helper does update-or-insert and never sends user_id.
 * 3. #inv-form-draft button is present only in create mode (!editId).
 * 4. Banner elements #inv-draft-resume and #inv-draft-discard exist with expected Spanish text.
 * 5. Discard asks for user confirmation via window.ZyronDialog.confirm before deleting.
 * 6. Successful product creation deletes the draft via productDraftDeleteViaDb only when resumed.
 * 7. Draft values in banner are escaped with escapeHtml.
 * 8. TENANT_SCOPED_TABLES includes product_form_drafts.
 *
 * Text/regex assertions over renderer.js (no live database or DOM required).
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const rendererPath = path.join(root, 'renderer.js')

const readRenderer = () => fs.readFileSync(rendererPath, 'utf8')

test('three product draft helpers exist and target product_form_drafts', () => {
  const source = readRenderer()

  // Load helper
  assert.match(
    source,
    /const\s+productDraftLoadViaDb\s*=\s*async\s*\(\w*\)\s*=>\s*\{[\s\S]*?table:\s*['"]product_form_drafts['"][\s\S]*?\};/,
    'productDraftLoadViaDb must exist and query product_form_drafts'
  )

  // Save helper
  assert.match(
    source,
    /const\s+productDraftSaveViaDb\s*=\s*async\s*\([\w,\s]*\)\s*=>\s*\{[\s\S]*?table:\s*['"]product_form_drafts['"][\s\S]*?\};/,
    'productDraftSaveViaDb must exist and operate on product_form_drafts'
  )

  // Delete helper
  assert.match(
    source,
    /const\s+productDraftDeleteViaDb\s*=\s*async\s*\(\w*\)\s*=>\s*\{[\s\S]*?table:\s*['"]product_form_drafts['"][\s\S]*?\};/,
    'productDraftDeleteViaDb must exist and delete from product_form_drafts'
  )
})

test('save helper does update-or-insert and never sends user_id', () => {
  const source = readRenderer()
  const match = source.match(
    /const\s+productDraftSaveViaDb\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\r?\n\};/
  )
  assert.ok(match, 'expected productDraftSaveViaDb to exist')
  const body = match[1]

  // Performs select check
  assert.match(body, /dbSelect\s*\(\s*\{[\s\S]*?table:\s*['"]product_form_drafts['"]/, 'must check existing draft with dbSelect')

  // Does update if existing, insert otherwise
  assert.match(body, /dbUpdate\s*\(\s*\{[\s\S]*?table:\s*['"]product_form_drafts['"]/, 'must call dbUpdate on existing draft')
  assert.match(body, /dbInsert\s*\(\s*\{[\s\S]*?table:\s*['"]product_form_drafts['"]/, 'must call dbInsert when no draft exists')

  // Never sends user_id
  assert.doesNotMatch(body, /user_id/, 'must never send user_id (RLS and column default handle it)')
})

test('inv-form-draft button is present only in create mode', () => {
  const source = readRenderer()

  // Match the button definition in the footer template
  assert.match(
    source,
    /\$\{\s*!editId\s*\?\s*['"]<button[^>]*id=["']inv-form-draft["'][^>]*>Guardar borrador<\/button>['"]\s*:\s*['"]{2}\s*\}/,
    'inv-form-draft button must be rendered conditionally only when !editId'
  )

  // Verify button properties
  assert.match(
    source,
    /id=["']inv-form-draft["']\s+class=["'][^"']*border-outline-variant[^"']*["']>Guardar borrador<\/button>/,
    'inv-form-draft must have secondary styling matching Cancelar and Spanish label'
  )
})

test('banner contains inv-draft-resume and inv-draft-discard with required Spanish text', () => {
  const source = readRenderer()

  // Banner text
  assert.match(
    source,
    /Tienes un borrador sin terminar:\s*<b>/,
    'banner must display the Spanish notification text'
  )
  assert.match(
    source,
    /\(guardado\s+\$\{/,
    'banner must show the formatted save timestamp'
  )

  // Resume button
  assert.match(
    source,
    /id=["']inv-draft-resume["'][^>]*>Seguir editando<\/button>/,
    'resume button #inv-draft-resume must exist with text "Seguir editando"'
  )

  // Discard button
  assert.match(
    source,
    /id=["']inv-draft-discard["'][^>]*>Descartar borrador<\/button>/,
    'discard button #inv-draft-discard must exist with text "Descartar borrador"'
  )
})

test('discard handler asks for user confirmation before deleting', () => {
  const source = readRenderer()
  const match = source.match(
    /document\.getElementById\(['"]inv-draft-discard['"]\)\?\.addEventListener\(['"]click['"],\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\r?\n\s*\}\);/
  )
  assert.ok(match, 'expected #inv-draft-discard click listener to exist')
  const body = match[1]

  assert.match(
    body,
    /window\.ZyronDialog\.confirm\(\s*['"]¿Descartar el borrador\? Esta acción no se puede deshacer\.['"]\s*\)/,
    'must prompt confirm with exact Spanish dialog'
  )
  assert.match(body, /productDraftDeleteViaDb\s*\(/, 'must call productDraftDeleteViaDb when confirmed')
})

test('successful create calls productDraftDeleteViaDb before closing', () => {
  const source = readRenderer()
  const match = source.match(
    /document\.getElementById\('inv-form'\)\?\.addEventListener\('submit',\s*async\s*\(ev\)\s*=>\s*\{([\s\S]*?)\r?\n\s*\}\);\r?\n\r?\n\s*document\.getElementById\('inv-form-cancel'\)/
  )
  assert.ok(match, 'expected #inv-form submit listener to exist')
  const body = match[1]

  assert.match(
    body,
    /if\s*\(\s*!editId\s*&&\s*state\.inventarioUi\?\.draftResumed\s*\)\s*\{[\s\S]*?productDraftDeleteViaDb\s*\(\s*tid\s*\)[\s\S]*?\}[\s\S]*?closeSheet\s*\(/,
    'must call productDraftDeleteViaDb(tid) when !editId and draftResumed before closeSheet'
  )
})

test('draft values in banner are properly escaped with escapeHtml', () => {
  const source = readRenderer()
  const bannerMatch = source.match(/if\s*\(\s*showDraftBanner\s*\)\s*\{([\s\S]*?)const formPage/)
  assert.ok(bannerMatch, 'expected showDraftBanner block to exist')
  const bannerBody = bannerMatch[1]

  assert.match(
    bannerBody,
    /escapeHtml\s*\(\s*draftTitle\s*\)/,
    'draftTitle must be escaped with escapeHtml in banner'
  )
  assert.match(
    bannerBody,
    /escapeHtml\s*\(\s*draftTime\s*\)/,
    'draftTime must be escaped with escapeHtml in banner'
  )
})

test('TENANT_SCOPED_TABLES includes product_form_drafts', () => {
  const source = readRenderer()
  assert.match(
    source,
    /const\s+TENANT_SCOPED_TABLES\s*=\s*new\s+Set\(\[[\s\S]*?['"]product_form_drafts['"][\s\S]*?\]\);/,
    'TENANT_SCOPED_TABLES must include product_form_drafts'
  )
})
