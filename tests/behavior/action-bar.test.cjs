/**
 * @file action-bar.test.cjs
 * @description Unit behavior tests for components/action-bar.js (window.ZyronActionBar).
 * Loaded via its CommonJS export so it runs under `node --test` without a browser.
 */

const assert = require('node:assert/strict')
const test = require('node:test')

const ZyronActionBar = require('../../components/action-bar.js')

const makeInvoiceCfg = () => ({
  module: 'invoices',
  actionAttr: 'data-inv-action',
  lockedTitle: 'No disponible: documento bloqueado',
  isLocked: (doc, action) => {
    const st = String(doc?.status || '').toLowerCase()
    if (action === 'edit') return st !== 'draft'
    if (action === 'void') return !(st === 'draft' || st === 'pending')
    return false
  },
  buttons: [
    { action: 'edit', slot: 'more', verb: 'edit', label: 'Editar', className: 'btn-edit' },
    { action: 'void', slot: 'more', verb: 'del', label: 'Eliminar', className: 'btn-del' },
    {
      action: 'authorize',
      slot: 'primary',
      verb: 'issue',
      label: 'Emitir',
      className: 'btn-issue',
      when: (doc) => String(doc?.status || '').toLowerCase() === 'draft'
    }
  ]
})

test.beforeEach(() => {
  ZyronActionBar.permissions.reset()
})

test('hides an action whose permission key is explicitly denied', async () => {
  await ZyronActionBar.permissions.load('t1', ['invoices.edit', 'invoices.void'], async (key) =>
    key === 'invoices.edit' ? false : true
  )
  const cfg = makeInvoiceCfg()
  const html = ZyronActionBar.render(cfg, { slot: 'more', doc: { id: 'inv-1', status: 'draft' } })

  assert.doesNotMatch(html, /verb="edit"|data-inv-action="edit"/, 'denied edit action must not render')
  assert.match(html, /data-inv-action="del"/, 'granted void action must still render')
})

test('hides an action whose when() callback returns false for the current document', async () => {
  await ZyronActionBar.permissions.load('t1', ['invoices.authorize'], async () => true)
  const cfg = makeInvoiceCfg()
  const issued = ZyronActionBar.render(cfg, { slot: 'primary', doc: { id: 'inv-1', status: 'pending' } })
  const draft = ZyronActionBar.render(cfg, { slot: 'primary', doc: { id: 'inv-2', status: 'draft' } })

  assert.equal(issued, '', 'authorize action must be hidden when when() is false')
  assert.match(draft, /data-inv-action="issue"/, 'authorize action must render when when() is true')
})

test('renders edit/void disabled (not hidden) when the document is locked', async () => {
  await ZyronActionBar.permissions.load('t1', ['invoices.edit', 'invoices.void'], async () => true)
  const cfg = makeInvoiceCfg()

  const lockedHtml = ZyronActionBar.render(cfg, { slot: 'more', doc: { id: 'inv-1', status: 'paid' } })
  assert.match(lockedHtml, /data-inv-action="edit"/, 'locked edit action must still render')
  assert.match(lockedHtml, /disabled/, 'locked edit action must render disabled')
  assert.match(lockedHtml, /aria-disabled="true"/, 'locked action must be marked aria-disabled')

  const unlockedHtml = ZyronActionBar.render(cfg, { slot: 'more', doc: { id: 'inv-2', status: 'draft' } })
  const editButton = unlockedHtml.match(/<button[^>]*data-inv-action="edit"[^>]*>/)[0]
  assert.doesNotMatch(editButton, /disabled/, 'unlocked edit action must not be disabled')
})

test('escapes attribute and label values to prevent markup injection', async () => {
  await ZyronActionBar.permissions.load('t1', ['invoices.void'], async () => true)
  const cfg = makeInvoiceCfg()
  const doc = { id: '"><img src=x onerror=alert(1)>', status: 'draft' }
  const html = ZyronActionBar.render(cfg, { slot: 'more', doc })

  assert.doesNotMatch(html, /<img/, 'raw markup from doc.id must never appear unescaped')
  assert.match(html, /&quot;&gt;&lt;img/, 'doc.id must be HTML-escaped inside the rendered attribute')
})

test('fails open when the permission check throws, so an RPC error never hides UI', async () => {
  await ZyronActionBar.permissions.load('t1', ['invoices.void'], async () => {
    throw new Error('network down')
  })
  const cfg = makeInvoiceCfg()
  const html = ZyronActionBar.render(cfg, { slot: 'more', doc: { id: 'inv-1', status: 'draft' } })

  assert.match(html, /data-inv-action="del"/, 'an errored permission check must fail open (visible), not hide the action')
})

test('drops a stale load() result when a newer load() started later resolves first', async () => {
  let releaseFirst
  const firstLoad = ZyronActionBar.permissions.load(
    't1',
    ['invoices.void'],
    () => new Promise((resolve) => { releaseFirst = () => resolve(false) })
  )
  await ZyronActionBar.permissions.load('t2', ['invoices.void'], async () => true)
  releaseFirst()
  await firstLoad

  assert.equal(ZyronActionBar.permissions.has('invoices.void'), true, 'the newer load() must win over the stale one')
  assert.equal(ZyronActionBar.permissions.state.tenantId, 't2', 'state must reflect the newer tenant, not the stale one')
})

test('reset() clears cached permissions back to fail-open unknowns', async () => {
  await ZyronActionBar.permissions.load('t1', ['invoices.void'], async () => false)
  assert.equal(ZyronActionBar.permissions.has('invoices.void'), false)

  ZyronActionBar.permissions.reset()

  assert.equal(ZyronActionBar.permissions.has('invoices.void'), true, 'after reset(), an unknown key fails open')
  assert.equal(ZyronActionBar.permissions.state.tenantId, null)
})

test('keysFor() returns the distinct permission keys required by a set of configs, including .view', () => {
  const cfg = makeInvoiceCfg()
  const keys = ZyronActionBar.keysFor([cfg])

  assert.equal(new Set(keys).size, keys.length, 'keysFor() must not return duplicate keys')
  assert.ok(keys.includes('invoices.view'), 'keysFor() must always include the module .view key for search/filter')
  assert.ok(keys.includes('invoices.edit'))
  assert.ok(keys.includes('invoices.void'))
  assert.ok(keys.includes('invoices.authorize'))
})

test('keysFor() dedupes keys shared across multiple configs', () => {
  const cfgA = makeInvoiceCfg()
  const cfgB = makeInvoiceCfg()
  const keys = ZyronActionBar.keysFor([cfgA, cfgB])

  assert.equal(keys.filter((k) => k === 'invoices.edit').length, 1, 'a key required by two configs must appear once')
})

const loadRendererBar = (name) => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../renderer.js'), 'utf8')
  const match = source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`))
  assert.ok(match, `${name} config must exist in renderer.js`)
  return new Function(`return (${match[1]})`)()
}

test('Clientes bar never renders print, authorize or process, even with every permission granted', async () => {
  const cfg = loadRendererBar('CLIENTE_BAR')
  const actions = cfg.buttons.map((b) => b.action).sort()
  assert.deepEqual(actions, ['create', 'edit', 'void'], 'CLIENTE_BAR must configure only create/edit/void')

  await ZyronActionBar.permissions.load('t1', ZyronActionBar.keysFor([cfg]), async () => true)
  assert.equal(ZyronActionBar.can(cfg, 'print'), true, 'permission is granted, so absence must come from config')
  const doc = { id: 'c-1', is_active: true }
  const html = ['toolbar', 'primary', 'more', 'row'].map((slot) => ZyronActionBar.render(cfg, { slot, doc })).join('')
  assert.doesNotMatch(html, /print|authorize|process|Imprimir|Autorizar|Procesar/i)
  assert.match(html, /cli-new-btn-top/)
  assert.match(html, /data-cli-edit="c-1"/)
})

test('permissions are fetched once per load; render() and can() never trigger another fetch', async () => {
  const cfgs = [makeInvoiceCfg(), loadRendererBar('CLIENTE_BAR')]
  const keys = ZyronActionBar.keysFor(cfgs)
  let calls = 0
  await ZyronActionBar.permissions.load('t1', keys, async () => {
    calls += 1
    return true
  })
  assert.equal(calls, keys.length, 'each distinct key is checked exactly once')

  for (const cfg of cfgs) {
    for (const slot of ['toolbar', 'primary', 'more', 'row']) {
      ZyronActionBar.render(cfg, { slot, doc: { id: 'x', status: 'draft' } })
    }
    ZyronActionBar.can(cfg, 'edit')
    ZyronActionBar.can(cfg, 'search')
  }
  assert.equal(calls, keys.length, 'rendering several modules must not re-fetch permissions')
})

test('bind() delegates click events for un-disabled action buttons and ignores disabled ones', () => {
  const listeners = new Map()
  const fakeRoot = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type)
  }
  const cfg = makeInvoiceCfg()
  const calls = []
  const unbind = ZyronActionBar.bind(fakeRoot, cfg, (action, id) => calls.push([action, id]))

  const enabledButton = { disabled: false, getAttribute: (name) => (name === cfg.actionAttr ? 'del' : 'inv-1') }
  const disabledButton = { disabled: true, getAttribute: (name) => (name === cfg.actionAttr ? 'edit' : 'inv-2') }

  listeners.get('click')({ target: { closest: () => enabledButton } })
  listeners.get('click')({ target: { closest: () => disabledButton } })

  assert.deepEqual(calls, [['del', 'inv-1']], 'only the enabled button click should invoke onAction')

  unbind()
  assert.equal(listeners.has('click'), false, 'unbind() must remove the delegated listener')
})
