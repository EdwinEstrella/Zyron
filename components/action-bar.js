/**
 * ZyronActionBar — shared standard action bar renderer + client-side permission
 * store. Loaded as a plain same-origin <script> before renderer.js (mirrors the
 * ZyronDialog precedent: a self-contained global, no bundler, no CSP change).
 *
 * The database (`check_user_permission` / `permission_satisfies`) remains the
 * only security boundary. This module only hides or disables UI; it is never a
 * substitute for server-side enforcement.
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
  if (root) {
    root.ZyronActionBar = api
  }
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict'

  // The seven standard actions and the permission-key suffix each maps to.
  // Search/Filter maps to the module's existing `.view` permission.
  const STANDARD = {
    create: 'create',
    edit: 'edit',
    void: 'void',
    search: 'view',
    print: 'print',
    authorize: 'authorize',
    process: 'process'
  }

  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }

  const esc = (value) => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])

  /**
   * Creates an isolated permission store. Exposed as a test seam; the module
   * also keeps one singleton instance at `permissions` for production use.
   */
  const createPermissionStore = () => {
    let cache = new Map()
    let generation = 0
    let tenantId = null

    const load = async (nextTenantId, keys, checkFn) => {
      const myGeneration = ++generation
      const entries = await Promise.all(
        (keys || []).map(async (key) => {
          try {
            const value = await checkFn(key)
            return [key, value === true ? true : value === false ? false : null]
          } catch {
            // Fail-open: an RPC error must never hide UI on its own. The
            // database remains the real security boundary.
            return [key, null]
          }
        })
      )

      // A newer load() (or a reset()) already superseded this call while it
      // was in flight — drop these results instead of overwriting fresher state.
      if (myGeneration !== generation) return

      cache = new Map(entries)
      tenantId = nextTenantId
    }

    const has = (key) => {
      const value = cache.get(key)
      // Missing key, explicit error (null), or never loaded -> fail open.
      return value === false ? false : true
    }

    const reset = () => {
      generation += 1
      cache = new Map()
      tenantId = null
    }

    return {
      load,
      has,
      reset,
      get state() {
        return { tenantId, size: cache.size }
      }
    }
  }

  const permissions = createPermissionStore()

  const can = (cfg, action) => permissions.has(`${cfg.module}.${STANDARD[action]}`)

  /**
   * Distinct permission keys required to render the given bar configs.
   * Always includes each config's `.view` key, because Search/Filter is
   * module-owned markup gated by `can(cfg, 'search')` and never appears as a
   * button in `cfg.buttons`.
   */
  const keysFor = (cfgs) => {
    const keys = new Set()
    for (const cfg of cfgs || []) {
      keys.add(`${cfg.module}.${STANDARD.search}`)
      for (const btn of cfg.buttons || []) {
        keys.add(`${cfg.module}.${STANDARD[btn.action]}`)
      }
    }
    return [...keys]
  }

  const resolveMaybeFn = (value, doc) => (typeof value === 'function' ? value(doc) : value)

  const renderButton = (cfg, btn, doc) => {
    const isLockable = btn.action === 'edit' || btn.action === 'void'
    const locked = isLockable && typeof cfg.isLocked === 'function' && Boolean(cfg.isLocked(doc, btn.action))

    const verb = btn.verb || btn.action
    const attrs =
      typeof btn.attrs === 'function'
        ? btn.attrs(doc) || {}
        : {
            [cfg.actionAttr]: verb,
            ...(doc && doc.id !== undefined && doc.id !== null ? { 'data-id': doc.id } : {})
          }
    const attrsHtml = Object.entries(attrs)
      .map(([name, value]) => `${name}="${esc(value)}"`)
      .join(' ')

    const label = resolveMaybeFn(btn.label, doc)
    const titleRaw = locked && cfg.lockedTitle ? cfg.lockedTitle : resolveMaybeFn(btn.title, doc)
    const idAttr = btn.id ? ` id="${esc(btn.id)}"` : ''
    const titleAttr = titleRaw ? ` title="${esc(titleRaw)}"` : ''
    const disabledAttr = locked ? ' disabled aria-disabled="true"' : ''
    const classes = `${btn.className || ''}${locked ? ' disabled:opacity-50 disabled:cursor-not-allowed' : ''}`.trim()

    return `<button type="button"${idAttr} class="${esc(classes)}" ${attrsHtml}${titleAttr}${disabledAttr}>${esc(label)}</button>`
  }

  /**
   * Renders only the configured buttons that belong to `slot`, are permitted
   * by the cached permission set, and pass their own `when(doc)` applicability
   * check. Edit/Void stay visible (never hidden) when locked — they render
   * disabled instead, per the standard-action-bar spec.
   */
  const render = (cfg, { slot, doc } = {}) =>
    (cfg.buttons || [])
      .filter((btn) => btn.slot === slot)
      .filter((btn) => can(cfg, btn.action))
      .filter((btn) => !btn.when || btn.when(doc))
      .map((btn) => renderButton(cfg, btn, doc))
      .join('')

  /**
   * Generic delegated click listener for future modules. Existing pilots keep
   * their own delegated listeners (same data-* verbs) and do not need this.
   */
  const bind = (rootEl, cfg, onAction) => {
    const handler = (event) => {
      const el = event.target.closest(`[${cfg.actionAttr}]`)
      if (!el || el.disabled) return
      const action = el.getAttribute(cfg.actionAttr)
      const id = el.getAttribute('data-id')
      onAction(action, id, event)
    }
    rootEl.addEventListener('click', handler)
    return () => rootEl.removeEventListener('click', handler)
  }

  return {
    STANDARD,
    render,
    can,
    keysFor,
    bind,
    permissions,
    createPermissionStore
  }
})
