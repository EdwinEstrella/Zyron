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

  expect(rendererJs.match(/id="factura-new-btn/g) || []).toHaveLength(1)
  expect(rendererJs.match(/id="estimate-new-btn/g) || []).toHaveLength(1)
  expect(rendererJs.match(/id="cli-new-btn/g) || []).toHaveLength(1)
  expect(rendererJs).not.toContain('const lineRowTemplate =')
})
