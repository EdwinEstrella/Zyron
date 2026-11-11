/**
 * @file ui-layout-fixes.test.cjs
 * @description Behavior coverage for layout bug fixes from screenshots (UI-FIX-1).
 *
 * Assertions:
 * 1. index.html: sidebar mount (#sidebar-modules-mount) has overflow-y-auto and min-h-0.
 * 2. index.html: #sidebar-nav has min-h-0 and footer block has shrink-0.
 * 3. index.html: custom scrollbar rules for #sidebar-modules-mount and @media (max-height: 900px) rule for .nav-module.
 * 4. renderer.js: inventory grid thead/th no longer carries light bg-surface-container-(high|highest) utilities.
 * 5. renderer.js: conflicting thead/th at ~3635, ~10945, ~13828 no longer carry light bg-surface utilities.
 * 6. renderer.js: selected table row classes no longer use bg-primary text-white (uses bg-accent/15 and shadow inset).
 * 7. styles/tailwind.css: :where(table thead th) has padding and text-align: left.
 * 8. renderer.js: CRM kanban container has overflow-x-auto and columns have fixed width + shrink-0.
 * 9. renderer.js: Inventory toolbar wraps filter controls in inline-flex items-center pairs.
 * 10. renderer.js: Inventory detail panel (Datos generales) inputs use w-full min-w-0 with stacked labels.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = (file) =>
  fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

test('index.html: sidebar shell and mount are viewport-bound with scrollable modules and pinned footer', () => {
  const html = read('index.html')

  // #sidebar-nav must have min-h-0
  assert.match(
    html,
    /<nav id="sidebar-nav"[^>]*\bmin-h-0\b/,
    '#sidebar-nav must have min-h-0'
  )

  // #sidebar-modules-mount must have overflow-y-auto and min-h-0
  assert.match(
    html,
    /id="sidebar-modules-mount"[^>]*\bmin-h-0\b[^>]*\boverflow-y-auto\b|class="[^"]*\bmin-h-0\b[^"]*\boverflow-y-auto\b[^"]*"[^>]*id="sidebar-modules-mount"/,
    '#sidebar-modules-mount must have min-h-0 and overflow-y-auto'
  )

  // footer block must have shrink-0
  assert.match(
    html,
    /class="mt-auto shrink-0[^"]*border-t border-white\/10/,
    'Sidebar footer block must have shrink-0'
  )

  // custom thin dark scrollbar for #sidebar-modules-mount
  assert.ok(
    html.includes('#sidebar-modules-mount') &&
      html.includes('scrollbar-width: thin') &&
      html.includes('scrollbar-color: rgba(255, 255, 255, 0.25) transparent'),
    '#sidebar-modules-mount must define thin dark scrollbar'
  )
  assert.ok(
    html.includes('#sidebar-modules-mount::-webkit-scrollbar'),
    '#sidebar-modules-mount must define webkit scrollbar'
  )

  // @media (max-height: 900px) compact padding for nav-module
  assert.ok(
    html.includes('@media (max-height: 900px)'),
    '@media (max-height: 900px) rule must exist'
  )
  assert.match(
    html,
    /@media\s*\(\s*max-height:\s*900px\s*\)\s*\{[\s\S]*?\.nav-module\s*\{[\s\S]*?padding-top:\s*0?\.5rem;[\s\S]*?padding-bottom:\s*0?\.5rem;/,
    '@media (max-height: 900px) must reduce .nav-module vertical padding to 0.5rem'
  )
})

test('renderer.js: thead/th elements no longer carry conflicting light bg-surface utilities', () => {
  const code = read('renderer.js')

  // Inventory grid header
  assert.ok(
    !code.includes("th = 'sticky top-0 z-10 border-b border-r border-outline-variant/30 bg-surface-container-high"),
    'Inventory grid th must not carry bg-surface-container-high'
  )

  // Superaccess table at ~3635
  assert.ok(
    !code.includes('<thead class="sticky top-0 z-10 bg-surface-container-highest">'),
    'Superaccess thead must not carry bg-surface-container-highest'
  )

  // Unit table at ~10945
  assert.ok(
    !code.includes('<thead class="bg-surface-container-high"><tr><th class="px-3 py-2">Codigo</th>'),
    'Units table thead must not carry bg-surface-container-high'
  )

  // Warehouses table at ~13828
  assert.ok(
    !code.includes('<thead class="bg-surface-container-high"><tr>\n                        <th class="px-3 py-2">Codigo</th>'),
    'Warehouses table thead must not carry bg-surface-container-high'
  )
})

test('styles/tailwind.css: table padding rules present and not wrapped in :where, :where(table thead th) has text-align: left', () => {
  const css = read('styles/tailwind.css')

  assert.match(
    css,
    /:where\(table thead th\)\s*\{[\s\S]*?text-align:\s*left;/,
    ':where(table thead th) must have text-align: left'
  )
  assert.ok(
    !css.match(/:where\([^)]*table\s+thead\s+th[^)]*\)\s*\{[^}]*padding:/),
    ':where(table thead th) must NOT contain padding'
  )
  assert.match(
    css,
    /table\s+thead\s+th\s*\{[\s\S]*?padding-block:\s*0?\.6rem;/,
    'table thead th must have padding-block: 0.6rem outside :where'
  )
  assert.match(
    css,
    /table\s+:is\(th,\s*td\)\s*\{[\s\S]*?padding-inline:\s*0?\.75rem;/,
    'table :is(th, td) must have padding-inline: 0.75rem outside :where'
  )
  assert.ok(
    !css.includes(':where(table :is(th, td))') && !css.includes(':where(table thead th { padding'),
    'table :is(th, td) must NOT be wrapped in :where'
  )
})

test('styles/tailwind.css and renderer.js: .btn-secondary is defined and has no undefined usages', () => {
  const css = read('styles/tailwind.css')
  const renderer = read('renderer.js')

  // Defined in CSS
  assert.match(
    css,
    /\.btn-secondary\s*\{[\s\S]*?background-color:\s*#ffffff;[\s\S]*?color:\s*#0f2744;[\s\S]*?border:\s*1px solid #94a3b8;/,
    '.btn-secondary must be defined in styles/tailwind.css'
  )

  // No remaining unstyled usage in renderer.js (only zyron-dialog-btn-secondary or none)
  const matches = renderer.match(/(?<![\w-])btn-secondary(?![\w-])/g) || []
  assert.equal(
    matches.length,
    0,
    'renderer.js must have no remaining usage of bare btn-secondary'
  )
})

test('renderer.js: realtime degraded banner has 5000ms debounce, timer cleared on recovery, realtimeDegradedConfirmed flag, and amber warning styling', () => {
  const code = read('renderer.js')

  // Debounce constant
  assert.match(
    code,
    /const REALTIME_DEGRADED_BANNER_DEBOUNCE_MS = 5000;/,
    'renderer.js must define REALTIME_DEGRADED_BANNER_DEBOUNCE_MS = 5000'
  )

  // Tracking timestamp
  assert.ok(
    code.includes('state.realtimeDegradedSince'),
    'renderer.js must track state.realtimeDegradedSince'
  )

  // Banner confirmed flag exists, set in timer, and reset on recovery
  assert.ok(
    code.includes('state.realtimeDegradedConfirmed'),
    'renderer.js must track state.realtimeDegradedConfirmed'
  )
  assert.match(
    code,
    /state\.realtimeDegradedConfirmed\s*=\s*true;/,
    'timer callback must mark state.realtimeDegradedConfirmed = true'
  )
  assert.match(
    code,
    /state\.realtimeDegradedConfirmed\s*=\s*false;/,
    'recovery must reset state.realtimeDegradedConfirmed = false'
  )
  assert.match(
    code,
    /Boolean\(state\.realtimeDegradedConfirmed\)\s*\|\|\s*degradedDuration\s*>=\s*REALTIME_DEGRADED_BANNER_DEBOUNCE_MS/,
    'banner decision must use realtimeDegradedConfirmed flag OR elapsed duration'
  )

  // Timer cleared on recovery
  assert.ok(
    code.includes('clearTimeout(realtimeDegradedBannerTimer)'),
    'renderer.js must clear degraded banner timer on recovery'
  )

  // Amber warning classes
  assert.ok(
    code.includes('border-amber-300') &&
      code.includes('bg-amber-50') &&
      code.includes('text-amber-900'),
    'sessionNoticeBanner must use amber warning styling (border-amber-300 bg-amber-50 text-amber-900)'
  )

  // Title in font-semibold
  assert.ok(
    code.includes('<strong class="block font-semibold">Realtime en modo degradado</strong>'),
    'Realtime banner title must use font-semibold'
  )
})

test('renderer.js: Reportes summary formats Spanish labels, integer Cantidad, and formatted currency instead of raw count:', () => {
  const code = read('renderer.js')

  // No raw count: formatting
  assert.ok(
    !code.includes("${escapeHtml(k)}: ${typeof v === 'number' ? v.toFixed(2) : escapeHtml(String(v))}"),
    'Reportes summary must not print raw key: value.toFixed(2)'
  )

  // formatReportSummaryItem helper
  assert.ok(
    code.includes('formatReportSummaryItem'),
    'formatReportSummaryItem helper must exist in renderer.js'
  )
  assert.ok(
    code.includes("'Cantidad'") &&
      code.includes("'Subtotal'") &&
      code.includes("'Impuestos'") &&
      code.includes("'Total'"),
    'formatReportSummaryItem must map keys to Cantidad, Subtotal, Impuestos, Total'
  )
})

test('renderer.js: selected table rows use light accent highlight without hover background, and data-tone contains only text tone', () => {
  const code = read('renderer.js')

  // Initial render: no longer 'bg-primary text-white'
  assert.ok(
    !code.includes("selected ? 'bg-primary text-white' : tone"),
    'Inventory row initial render must not use bg-primary text-white'
  )
  assert.ok(
    code.includes('bg-accent/15') && code.includes('shadow-[inset_3px_0_0_#0284c7]'),
    'Inventory row selection must use bg-accent/15 and shadow-[inset_3px_0_0_#0284c7]'
  )

  // data-tone holds ONLY the text tone, never hover:
  assert.ok(
    !code.includes('const tone = `${rowTone(p)} hover:'),
    'tone variable for data-tone must not include hover: utility'
  )
  assert.match(
    code,
    /const tone = rowTone\(p\);/,
    'tone must hold only rowTone(p)'
  )
  assert.match(
    code,
    /hover:bg-surface-container-high \$\{tone\}/,
    'non-selected rows must include hover:bg-surface-container-high'
  )

  // Row toggle: restores hover on unselected row and keeps selected row without hover
  assert.ok(
    !code.includes("tr.className = 'cursor-default select-none border-b border-outline-variant/10 bg-primary text-white'"),
    'Row selection toggle must not set bg-primary text-white'
  )
  assert.match(
    code,
    /prev\.className = `cursor-default select-none border-b border-outline-variant\/10 hover:bg-surface-container-high \$\{prevTone\}`;/,
    'Row selection unselect must restore hover:bg-surface-container-high with prevTone'
  )
})

test('renderer.js: Panel KPI grid uses repeat(auto-fit, minmax(220px, 1fr)) and statCard has min-w-0 and shrink-0 icon', () => {
  const code = read('renderer.js')

  assert.match(
    code,
    /grid-cols-\[repeat\(auto-fit,minmax\(220px,1fr\)\)\]/,
    'Panel KPI grid must use grid-cols-[repeat(auto-fit,minmax(220px,1fr))]'
  )
  assert.match(
    code,
    /const statCard = \(icon, label, value, hint, tone = 'primary'\) => `\s*<div class="min-w-0 rounded-lg/,
    'statCard root element must have min-w-0'
  )
  assert.match(
    code,
    /text-xl lg:text-2xl font-bold truncate/,
    'statCard value must allow shrinking with text-xl lg:text-2xl font-bold truncate'
  )
  assert.match(
    code,
    /<span class="material-symbols-outlined shrink-0 rounded-md bg-surface-container-low/,
    'statCard icon must have shrink-0'
  )
})

test('renderer.js: Facturas filter search group has min-w-[200px] flex-1 and input has min-w-0 flex-1', () => {
  const code = read('renderer.js')

  assert.match(
    code,
    /<div class="min-w-\[200px\] flex-1">\s*<label[^>]*>Buscar<\/label>/,
    'Facturas search group wrapper must have min-w-[200px] flex-1'
  )
  assert.match(
    code,
    /<input id="fact-filter-q" type="text" class="min-w-0 flex-1 bg-transparent text-sm outline-none"/,
    'Facturas search input must have min-w-0 flex-1'
  )
  assert.match(
    code,
    /flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end/,
    'Facturas filter toolbar must include lg:flex-wrap to allow wrapping'
  )
})

test('renderer.js: detailField has titleText parameter, escapes once, and does not use tag-stripping regex', () => {
  const code = read('renderer.js')

  assert.match(
    code,
    /const detailField = \(label, value, extra = '', titleText = null\) => \{/,
    'detailField must accept optional 4th parameter titleText'
  )
  assert.ok(
    !code.includes('.replace(/<[^>]*>/g'),
    'detailField must not use tag-stripping regex replace(/<[^>]*>/g'
  )
  assert.match(
    code,
    /titleText != null && titleText !== '' \? ` title="\$\{escapeHtml\(String\(titleText\)\)\}"` : ''/,
    'detailField must escape titleText exactly once when passed'
  )
  assert.match(
    code,
    /\$\{detailField\('Nombre', escapeHtml\(p\.name \|\| ''\), '', p\.name \|\| ''\)\}/,
    'caller for Nombre must pass raw p.name as titleText'
  )
})

test('renderer.js: CRM kanban container has overflow-x-auto and fixed width shrink-0 columns', () => {
  const code = read('renderer.js')

  assert.ok(
    !code.includes('grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4'),
    'CRM kanban should not use rigid grid-cols-5'
  )
  assert.ok(
    code.includes('flex items-start gap-4 overflow-x-auto pb-4'),
    'CRM kanban container must use flex with overflow-x-auto'
  )
  assert.ok(
    code.includes('w-[280px]') && code.includes('shrink-0'),
    'CRM kanban columns must have w-[280px] shrink-0 to prevent overlap'
  )
})

test('renderer.js: Inventory toolbar wraps each label+control pair in inline-flex to prevent orphan labels', () => {
  const code = read('renderer.js')

  assert.match(
    code,
    /<div class="inline-flex items-center gap-2">\s*<label[^>]*for="inv-filter-kind"[^>]*>Tipo<\/label>\s*<select id="inv-filter-kind"/,
    'Tipo label and select must be wrapped in an inline-flex container'
  )
})

test('renderer.js: Inventory detail panel (Datos generales) inputs use w-full min-w-0 with stacked labels', () => {
  const code = read('renderer.js')

  assert.ok(
    code.includes('w-full min-w-0 truncate rounded border border-outline-variant/30 bg-surface-container-low'),
    'detailField must render input with w-full min-w-0'
  )
  assert.ok(
    code.includes('min-[700px]:grid-cols-2') && code.includes('min-[1280px]:grid-cols-3'),
    'Datos generales grid must use responsive columns for >=1280, <1100, <700'
  )
})
