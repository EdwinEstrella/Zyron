/**
 * @file design-tokens.test.cjs
 * @description Behavior coverage for design tokens, contrast palette, and dark sidebar (T3).
 *
 * Assertions:
 * 1. tailwind.config.cjs defines surface, outline-variant, surface-container-highest, accent, accent-soft, etc.
 * 2. Every Material-family token used in renderer.js, index.html, and components/*.js is defined in tailwind.config.cjs.
 * 3. tailwind.config.cjs extends boxShadow overrides for sm, md, lg.
 * 4. index.html styles .app-sidebar with dark navy gradient (#0f2744 and #0b1d33) and removes rgba(255, 255, 255, 0.92).
 * 5. index.html styles .titlebar with #0a1a2e to separate from sidebar.
 * 6. index.html styles .nav-module with #cbd5e1, hover state, and .is-active accent indicator (#38bdf8).
 * 7. index.html sidebar footer separator uses border-white/10 instead of border-outline-variant/40.
 * 8. styles/tailwind.css wraps table thead th, thead buttons, tbody tr:hover, and input:focus rules in :where(.
 * 9. components/paint-first.css background-color matches config surface (#e6ecf4).
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const tailwindConfig = require(path.join(root, 'tailwind.config.cjs'))

const read = (file) =>
  fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

test('tailwind.config.cjs: defines required contrast tokens and boxShadow overrides', () => {
  const colors = tailwindConfig.theme?.extend?.colors
  assert.ok(colors, 'theme.extend.colors must be defined')

  assert.equal(colors.surface, '#e6ecf4', 'surface should be #e6ecf4 for card separation')
  assert.equal(colors['surface-container-low'], '#eef2f8')
  assert.equal(colors['surface-container'], '#dfe7f1')
  assert.equal(colors['surface-container-high'], '#d3deec')
  assert.equal(colors['surface-container-highest'], '#c4d3e6', 'surface-container-highest must be defined as #c4d3e6')
  assert.equal(colors['surface-container-lowest'], '#ffffff')
  assert.equal(colors['surface-dim'], '#d5dde8')

  assert.equal(colors.outline, '#475569')
  assert.equal(colors['outline-variant'], '#64748b', 'outline-variant must be #64748b for border contrast')

  assert.equal(colors.accent, '#0284c7', 'accent token must be defined')
  assert.equal(colors['accent-soft'], '#38bdf8', 'accent-soft token must be defined')

  const shadows = tailwindConfig.theme?.extend?.boxShadow
  assert.ok(shadows, 'theme.extend.boxShadow must be defined')
  assert.ok(shadows.sm && shadows.sm.includes('rgba(15,39,68,.14)'), 'boxShadow.sm override must be defined')
  assert.ok(shadows.md && shadows.md.includes('rgba(15,39,68,.12)'), 'boxShadow.md override must be defined')
  assert.ok(shadows.lg && shadows.lg.includes('rgba(15,39,68,.12)'), 'boxShadow.lg override must be defined')
})

test('source audit: every Material-family token used in source files is defined in tailwind.config.cjs', () => {
  const defined = new Set(Object.keys(tailwindConfig.theme.extend.colors))

  const compFiles = fs
    .readdirSync(path.join(root, 'components'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join('components', f))

  const files = ['renderer.js', 'index.html', ...compFiles]
  const tokenRegex =
    /(?:bg|text|border|ring|divide|from|via|to|fill|stroke|placeholder|outline|shadow)-([a-z0-9-]+)/g

  const families = [
    'surface',
    'on-',
    'primary',
    'secondary',
    'tertiary',
    'outline',
    'error',
    'inverse',
    'accent'
  ]

  const missing = []
  for (const relFile of files) {
    const fullPath = path.join(root, relFile)
    if (!fs.existsSync(fullPath)) continue
    const content = fs.readFileSync(fullPath, 'utf8')
    let match
    while ((match = tokenRegex.exec(content)) !== null) {
      const rawToken = match[1]
      const token = rawToken.split('/')[0]
      if (families.some((fam) => token === fam || token.startsWith(fam))) {
        if (!defined.has(token)) {
          missing.push({ file: relFile, token, match: match[0] })
        }
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `Found undefined Material tokens used in source files: ${JSON.stringify(missing)}`
  )
})

test('index.html: shell styles .app-sidebar, .titlebar, and .nav-module for dark navy theme', () => {
  const html = read('index.html')

  // Sidebar styling
  assert.ok(
    !html.includes('rgba(255, 255, 255, 0.92)'),
    '.app-sidebar must no longer use light rgba(255, 255, 255, 0.92)'
  )
  assert.ok(
    html.includes('#0f2744') && html.includes('#0b1d33'),
    '.app-sidebar must use dark navy gradient with #0f2744 and #0b1d33'
  )
  assert.ok(
    html.includes('rgba(255, 255, 255, 0.06)') || html.includes('rgba(255,255,255,.06)'),
    '.app-sidebar border-right must be rgba(255,255,255,.06)'
  )

  // Titlebar styling
  const titlebarMatch = html.match(/\.titlebar\s*\{[^}]+\}/)
  assert.ok(titlebarMatch, '.titlebar rule must exist in index.html')
  assert.ok(
    titlebarMatch[0].includes('#0a1a2e'),
    '.titlebar background must be #0a1a2e to separate from sidebar'
  )

  // Nav module styling
  assert.ok(
    html.includes('#cbd5e1'),
    '.nav-module text color must be #cbd5e1'
  )
  assert.ok(
    html.includes('#38bdf8'),
    '.nav-module.is-active indicator must use #38bdf8'
  )

  // Footer separator
  assert.ok(
    html.includes('border-white/10'),
    'Sidebar footer separator must use border-white/10'
  )
})

test('styles/tailwind.css: wraps table and input focus rules in zero-specificity :where(', () => {
  const css = read('styles/tailwind.css')

  assert.ok(
    css.includes(':where(table thead th)'),
    'Table thead th rule must be wrapped in :where(table thead th)'
  )
  assert.ok(
    css.includes(':where(table thead th button, table thead th a, table thead th span)'),
    'Table header button/link rule must be wrapped in :where('
  )
  assert.ok(
    css.includes(':where(table tbody tr:hover)'),
    'Table tbody tr hover rule must be wrapped in :where('
  )
  assert.ok(
    css.includes(':where(input:not([type=') || css.includes(":where(input:not([type='"),
    'Input focus rule must be wrapped in :where('
  )

  // Verify the exact colors and values
  assert.ok(css.includes('#0f2744'), 'table thead th background must be #0f2744')
  assert.ok(css.includes('#0a1a2e'), 'table thead th border-bottom must be #0a1a2e')
  assert.ok(css.includes('#e3edf9'), 'table tbody tr hover must be #e3edf9')
  assert.ok(css.includes('#1e4976'), 'input focus border-color must be #1e4976')
  assert.ok(css.includes('rgba(2, 132, 199, 0.3)') || css.includes('rgba(2,132,199,.30)'), 'input focus box-shadow must use accent alpha')
})

test('components/paint-first.css: matches the new surface color #e6ecf4', () => {
  const css = read('components/paint-first.css')
  assert.ok(
    css.includes('#e6ecf4'),
    'components/paint-first.css background-color must equal #e6ecf4'
  )
  assert.equal(
    tailwindConfig.theme.extend.colors.surface,
    '#e6ecf4',
    'surface in tailwind.config.cjs must match paint-first.css'
  )
})
