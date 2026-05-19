const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

function extractBrowserWindowOptions (source) {
  const options = []
  let index = 0

  while ((index = source.indexOf('new BrowserWindow', index)) !== -1) {
    const openParen = source.indexOf('(', index)
    const openBrace = source.indexOf('{', openParen)
    assert.notEqual(openBrace, -1, 'BrowserWindow should be created with an options object')

    let depth = 0
    let end = openBrace
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1
      if (source[end] === '}') depth -= 1
      if (depth === 0) break
    }

    options.push(source.slice(openBrace, end + 1))
    index = end + 1
  }

  return options
}

function extractBrowserWindowBlocks (source) {
  const blocks = []
  let index = 0

  while ((index = source.indexOf('new BrowserWindow', index)) !== -1) {
    let functionStart = source.lastIndexOf('function ', index)
    const arrowStart = source.lastIndexOf('=>', index)
    if (arrowStart > functionStart) {
      functionStart = source.lastIndexOf('{', arrowStart)
    }
    if (functionStart === -1) functionStart = 0

    let nextWindow = source.indexOf('new BrowserWindow', index + 1)
    if (nextWindow === -1) nextWindow = source.length


    let functionEnd = source.indexOf('\n}', index)
    if (functionEnd === -1) functionEnd = source.length


    blocks.push(source.slice(index, Math.min(nextWindow, functionEnd)))
    index += 'new BrowserWindow'.length
  }

  return blocks
}

function extractCspDirectives (html) {
  const match = html.match(/<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"[^>]*>/i) ||
    html.match(/<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content='([^']+)'[^>]*>/i)
  assert.ok(match, 'active HTML should define a Content-Security-Policy meta tag')

  return Object.fromEntries(match[1].split(';').map((directive) => {
    const [name, ...values] = directive.trim().split(/\s+/)
    return [name, values]
  }).filter(([name]) => Boolean(name)))
}

function builderIncludesLegacyHtml (packageJson) {
  const files = packageJson.build?.files || []
  if (files.includes('!public/zyron-legacy.html')) return false
  return files.some((entry) => entry === 'public/**/*' || entry === 'public/**')
}

test('BrowserWindow instances use secure webPreferences baseline', () => {
  const mainJs = read('main.js')
  const windows = extractBrowserWindowOptions(mainJs)

  assert.ok(windows.length > 0, 'at least one BrowserWindow should be configured')
  assert.doesNotMatch(mainJs, /webSecurity\s*:\s*false/)
  assert.doesNotMatch(mainJs, /enableRemoteModule\s*:/)

  for (const options of windows) {
    assert.match(options, /webPreferences\s*:\s*{[\s\S]*contextIsolation\s*:\s*true/)
    assert.match(options, /webPreferences\s*:\s*{[\s\S]*sandbox\s*:\s*true/)
    assert.match(options, /webPreferences\s*:\s*{[\s\S]*nodeIntegration\s*:\s*false/)
  }
})

test('preload exposes narrow bridges instead of raw ipcRenderer', () => {
  const preloadJs = read('preload.js')

  assert.doesNotMatch(preloadJs, /exposeInMainWorld\([^)]*ipcRenderer/)
  assert.doesNotMatch(preloadJs, /ipcRenderer\s*[,}]\s*\)/)
})

test('renderer uses the narrow HTML preview bridge instead of raw window.open', () => {
  const rendererJs = read('renderer.js')
  const preloadJs = read('preload.js')
  const mainJs = read('main.js')

  assert.doesNotMatch(rendererJs, /\bwindow\.open\s*\(/)
  assert.match(rendererJs, /electronAPI\?\.openHtmlPreview|electronAPI\.openHtmlPreview/)
  assert.match(preloadJs, /openHtmlPreview\s*:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\(['"]desktop:open-html-preview['"]\s*,\s*payload\)/)
  assert.match(mainJs, /ipcMain\.handle\(['"]desktop:open-html-preview['"]/, 'main should handle the HTML preview IPC channel')
})

test('every BrowserWindow denies unexpected window.open targets before another window can be created', () => {
  const mainJs = read('main.js')
  const windows = extractBrowserWindowBlocks(mainJs)

  assert.ok(windows.length > 0, 'at least one BrowserWindow should be configured')
  for (const block of windows) {
    assert.match(block, /\.webContents\.setWindowOpenHandler\s*\([\s\S]*action\s*:\s*['"]deny['"]/, block)
  }
})

test('active packaged HTML uses a strict script CSP', () => {
  const packageJson = JSON.parse(read('package.json'))
  const activeHtmlFiles = (packageJson.build?.files || [])
    .filter((entry) => !entry.startsWith('!'))
    .filter((entry) => entry.endsWith('.html'))

  assert.ok(activeHtmlFiles.includes('index.html'), 'index.html should be part of packaged app files')

  for (const htmlFile of activeHtmlFiles) {
    const html = read(htmlFile)
    const directives = extractCspDirectives(html)
    assert.deepEqual(directives['script-src'], ["'self'"], `${htmlFile} script-src should only allow self`)
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i, `${htmlFile} should not contain inline scripts`)
  }
})

test('packaging excludes legacy Tailwind CDN runtime when legacy HTML still contains it', () => {
  const packageJson = JSON.parse(read('package.json'))
  const legacyHtml = read('public/zyron-legacy.html')
  const legacyHasTailwindRuntime = /cdn\.tailwindcss\.com|tailwind\.config\s*=|@tailwindcss\/browser/.test(legacyHtml)
  const forgeConfig = read('forge.config.js')

  if (!legacyHasTailwindRuntime) return

  assert.equal(builderIncludesLegacyHtml(packageJson), false)
  assert.match(forgeConfig, /zyron-legacy\\?\.html/)
})
