const fs = require('node:fs')
const path = require('node:path')
const { test, expect } = require('@playwright/test')

const root = path.resolve(__dirname, '../..')

test('production readiness files are safe for packaging', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const files = packageJson.build.files

  expect(files).not.toContain('.env')
  expect(files).toEqual(expect.arrayContaining(['!.env', '!.env.*', '!**/.env', '!**/.env.*']))
  expect(files).toContain('.generated/insforge.json')
  expect(packageJson.build.extraResources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ from: '.generated/insforge.json', to: 'insforge.json' })
    ])
  )
  expect(packageJson.devDependencies.tailwindcss).toBe('3.4.17')
})

test('renderer uses bundled Tailwind output instead of CDN runtime', () => {
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

  expect(indexHtml).toContain('public/tailwind.css')
  expect(indexHtml).not.toContain('cdn.tailwindcss.com')
  expect(indexHtml).not.toContain('tailwind.config =')
  expect(fs.existsSync(path.join(root, 'public/tailwind.css'))).toBe(true)
})

test('auth IPC and realtime foundation are present', () => {
  const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
  const preloadJs = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
  const realtimeSql = fs.readFileSync(path.join(root, 'insforge-sql/realtime_domain_events_foundation.sql'), 'utf8')

  expect(mainJs).toContain('AUTH_RELOGIN_REQUIRED')
  expect(mainJs).toContain('requestAuthRecovery')
  expect(mainJs).toContain('validateDbInsertPayload')
  expect(mainJs).toContain('realtimeRegistry')
  expect(preloadJs).not.toContain('exposeInMainWorld(\'ipcRenderer\'')
  expect(preloadJs).toContain('onSessionExpired')
  expect(preloadJs).toContain('onStatusChanged')
  expect(realtimeSql).toContain('tenant:*:domain-events')
  expect(realtimeSql).toContain('realtime.domain_events.view')
})

test('invoice and customer forms do not expose duplicate create controls', () => {
  const rendererJs = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8')

  // Create-button ids now live inside ZyronActionBar config objects
  // (`id: 'factura-new-btn-top'`) instead of raw HTML attributes
  // (`id="factura-new-btn-top"`). Either shape still proves there is only
  // one create control declared per module.
  expect(rendererJs.match(/(id="|id: ')factura-new-btn/g) || []).toHaveLength(1)
  expect(rendererJs.match(/(id="|id: ')estimate-new-btn/g) || []).toHaveLength(1)
  expect(rendererJs.match(/(id="|id: ')cli-new-btn/g) || []).toHaveLength(1)
  expect(rendererJs).not.toContain('const lineRowTemplate =')
})

test('pilot modules wire the shared standard action bar', () => {
  const rendererJs = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8')
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

  expect(fs.existsSync(path.join(root, 'components/action-bar.js'))).toBe(true)
  expect(indexHtml).toMatch(/<script src="\.\/components\/action-bar\.js">\s*<\/script>\s*<script src="\.\/renderer\.js">/)

  expect(rendererJs).toContain('FACTURA_BAR')
  expect(rendererJs).toContain('ESTIMATE_BAR')
  expect(rendererJs).toContain('CLIENTE_BAR')
  expect((rendererJs.match(/ZyronActionBar\.render\(/g) || []).length).toBeGreaterThanOrEqual(3)
  expect(rendererJs).toContain('loadTenantPermissions')
  expect(rendererJs).toContain('ZyronActionBar.permissions.reset()')
})

test('tenant settings are loaded from database preferences and applied at runtime', () => {
  const rendererJs = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8')

  expect(rendererJs).toContain("const ZYRON_TENANT_PREFERENCES_KEY = 'zyron_preferences'")
  expect(rendererJs).toContain('tenantPreferences:')
  expect(rendererJs).toContain('await loadTenantPreferences(state.currentTenantId)')
  expect(rendererJs).toContain('await loadTenantPreferences(row.tenant_id)')
  expect(rendererJs).toContain("state.tenantPreferences?.defaultModule || 'panel'")
  expect(rendererJs).toContain('state.tenantPreferences?.invoiceDueDays')
  expect(rendererJs).toContain('state.tenantPreferences?.estimateExpiryDays')
  expect(rendererJs).toContain('state.tenantPreferences?.confirmBeforeIssue !== false')
  expect(rendererJs).toContain('applyTenantPreferencesToDom()')
})
