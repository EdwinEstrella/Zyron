/**
 * @file product-form-duplicate-sku.test.cjs
 * @description Behavior coverage for the duplicate-SKU bug fix in the inventory product form.
 *
 * 1. When creating a product (no editId) and saveProductAccountMappingViaDb returns mappingError,
 *    the #inv-form submit handler must switch the sheet to edit mode for the created product
 *    (state.inventarioUi with editId: String(productId)) and re-render before alerting,
 *    preventing duplicate creation retries with the same SKU.
 * 2. Database errors for unique constraint violations on SKU (error code 23505 or
 *    products_tenant_id_sku_key) must return a user-friendly Spanish message instead of the raw DB error,
 *    reused across create_product and update_product.
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

const extractInvFormSubmitBody = (source) => {
  const match = source.match(
    /document\.getElementById\('inv-form'\)\?\.addEventListener\('submit',\s*async\s*\(ev\)\s*=>\s*\{([\s\S]*?)\r?\n\s*\}\);\r?\n\r?\n\s*document\.getElementById\('inv-form-cancel'\)/
  )
  assert.ok(match, 'expected #inv-form submit listener to exist in renderer.js')
  return match[1]
}

const extractProductsManageViaDbBody = (source) => {
  const match = source.match(/const productsManageViaDb = async \(body\) => \{([\s\S]*?)\r?\n\};/)
  assert.ok(match, 'expected productsManageViaDb to exist in renderer.js')
  return match[1]
}

const extractProductsFriendlyDbErrorBody = (source) => {
  const match = source.match(/const productsFriendlyDbError = \((?:err,\s*sku|sku,\s*err)\) => \{([\s\S]*?)\r?\n\};/)
  assert.ok(match, 'expected productsFriendlyDbError helper to exist in renderer.js')
  return match[1]
}

test('inv-form submit handler sets editId to created productId on mappingError before alerting', () => {
  const body = extractInvFormSubmitBody(readRenderer())

  assert.match(body, /if\s*\(\s*mappingError\s*\)\s*\{/, 'must check mappingError')
  assert.match(
    body,
    /state\.inventarioUi\s*=\s*\{\s*\.\.\.state\.inventarioUi,\s*sheet:\s*'form',\s*editId:\s*String\(productId\),\s*selectedId:\s*String\(productId\)\s*\};/,
    'must update state.inventarioUi with editId: String(productId) and selectedId: String(productId)'
  )
  assert.match(body, /await renderInventarioModule\(\);/, 'must re-render inventory module before alerting')

  // Verify the state change and render happen before the alert
  const stateUpdateIndex = body.indexOf('editId: String(productId)')
  const alertIndex = body.indexOf('El artículo se guardó, pero no su configuración contable:')
  assert.ok(stateUpdateIndex !== -1, 'state update must be present')
  assert.ok(alertIndex !== -1, 'specific error alert must be present')
  assert.ok(stateUpdateIndex < alertIndex, 'state update must occur before alerting the user')
})

test('inv-form submit handler keeps existing behavior for edit path when mappingError occurs', () => {
  const body = extractInvFormSubmitBody(readRenderer())
  assert.match(
    body,
    /if\s*\(!editId\)\s*\{[\s\S]*?\}\r?\n\s*window\.ZyronDialog\.alert\(mappingError\.message\s*\|\|\s*'El artículo se guardó, pero no su configuración contable\.'\);/,
    'edit path must alert and return without resetting editId'
  )
})

test('friendly SKU helper exists, checks 23505 and products_tenant_id_sku_key', () => {
  const body = extractProductsFriendlyDbErrorBody(readRenderer())
  assert.match(body, /23505/, 'must check PostgreSQL unique constraint violation error code 23505')
  assert.match(body, /products_tenant_id_sku_key/, 'must check products_tenant_id_sku_key constraint name')
})

test('friendly SKU helper returns the friendly Spanish duplicate-SKU message', () => {
  const source = readRenderer()
  assert.match(
    source,
    /Ya existe un artículo con el código/,
    'must contain the Spanish duplicate-SKU message text'
  )
  assert.match(
    source,
    /Ya existe un artículo con el código \(SKU\) ["']?\$\{[^}]+\}["']?\./,
    'must interpolate the SKU into the Spanish error message'
  )
})

test('productsFriendlyDbError is used in both create_product and update_product', () => {
  const body = extractProductsManageViaDbBody(readRenderer())

  const createBranchMatch = body.match(/if\s*\(action === 'create_product'\)\s*\{([\s\S]*?)\r?\n\s*\}\r?\n\s*if\s*\(action === 'update_product'\)/)
  assert.ok(createBranchMatch, 'expected create_product branch in productsManageViaDb')
  assert.match(createBranchMatch[1], /productsFriendlyDbError\s*\(/, 'create_product branch must use productsFriendlyDbError')

  const updateBranchMatch = body.match(/if\s*\(action === 'update_product'\)\s*\{([\s\S]*?)\r?\n\s*\}\r?\n\s*if\s*\(action === 'export_catalog'\)/)
  assert.ok(updateBranchMatch, 'expected update_product branch in productsManageViaDb')
  assert.match(updateBranchMatch[1], /productsFriendlyDbError\s*\(/, 'update_product branch must use productsFriendlyDbError')
})
