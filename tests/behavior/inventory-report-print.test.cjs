/**
 * @file inventory-report-print.test.cjs
 * @description Behavior coverage for printable inventory report and PDF export.
 *
 * Assertions:
 * 1. components/inventory-report.js escapes business name and user-entered fields (<script>).
 * 2. components/inventory-report.js includes @page A4 landscape, repeating thead, and tfoot table-row-group (no table-footer-group).
 * 3. components/inventory-report.js computes summary and tfoot totals correctly for a fixture
 *    (including active product, inactive product, service row excluded from valuation, and low stock).
 * 4. components/inventory-report.js renders "Bajo mínimo" badge on low-stock items and "—" for services.
 * 5. main.js desktop:save-pdf-from-html handler honors payload.landscape.
 * 6. index.html loads components/inventory-report.js before renderer.js.
 * 7. renderer.js export_catalog includes min_stock in rows without adding Excel columns.
 * 8. renderer.js renders #inv-print-btn and #inv-pdf-btn with matching icons and classes.
 * 9. renderer.js inv-print-btn invokes openHtmlPreview with autoPrint: true and guards on empty catalog via helper.
 * 10. renderer.js inv-pdf-btn invokes savePdfFromHtml with landscape: true and guards on empty catalog via helper.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const { buildInventoryReportHtml } = require(
  path.join(root, 'components/inventory-report.js')
)

const read = (file) =>
  fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

test('builder: escapes business name and dynamic string fields (<script> injection)', () => {
  const dangerousBusiness = 'Acme <script>alert("xss")</script> & Co'
  const dangerousProduct = 'Martillo <script>evil()</script>'
  const rows = [
    {
      sku: 'SKU-001',
      name: dangerousProduct,
      category: 'Ferretería <>&"',
      item_kind: 'Producto',
      price: 150,
      cost_price: 100,
      stock: 10,
      min_stock: 5,
      is_active: 'Sí'
    }
  ]

  const html = buildInventoryReportHtml({
    businessName: dangerousBusiness,
    generatedAt: '11/11/2026 10:00:00',
    rows,
    currency: 'RD$'
  })

  // Must escape business name
  assert.ok(html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'))
  assert.ok(!html.includes('<script>alert("xss")</script>'))

  // Must escape product name
  assert.ok(html.includes('&lt;script&gt;evil()&lt;/script&gt;'))
  assert.ok(!html.includes('<script>evil()</script>'))

  // Must escape category special chars
  assert.ok(html.includes('Ferretería &lt;&gt;&amp;&quot;'))

  // Must NOT include automatic window.print() script
  assert.ok(!html.includes('window.print()'))
})

test('builder: contains @page landscape and repeating thead rules for A4 landscape print', () => {
  const html = buildInventoryReportHtml({
    businessName: 'Ferretería Central',
    generatedAt: '11/11/2026 12:00:00',
    rows: []
  })

  // @page rule with landscape and 12mm margins
  assert.match(html, /@page\s*\{[^}]*size:\s*A4\s+landscape/i, 'expected @page with A4 landscape')
  assert.match(html, /@page\s*\{[^}]*margin:\s*12mm/i, 'expected @page with 12mm margins')

  // thead display: table-header-group rule for repeat on page break
  assert.match(
    html,
    /thead\s*\{[^}]*display:\s*table-header-group/i,
    'expected thead { display: table-header-group }'
  )

  // tfoot display: table-row-group avoids repeating totals on every page in Chromium
  assert.match(
    html,
    /tfoot\s*\{[^}]*display:\s*table-row-group/i,
    'expected tfoot { display: table-row-group }'
  )

  // Assert CSS does not contain table-footer-group
  assert.ok(
    !html.includes('table-footer-group'),
    'CSS must not contain table-footer-group (repeats totals on every page in Chromium)'
  )

  const compSource = read('components/inventory-report.js')
  assert.ok(
    !compSource.includes('table-footer-group'),
    'components/inventory-report.js must not contain table-footer-group'
  )
  assert.doesNotMatch(
    compSource,
    /root\.buildInventoryReportHtml\s*=/,
    'components/inventory-report.js must not expose extra root.buildInventoryReportHtml global'
  )

  // page-break-inside avoid on rows
  assert.match(
    html,
    /tr\s*\{[^}]*page-break-inside:\s*avoid/i,
    'expected tr { page-break-inside: avoid }'
  )

  // print-color-adjust exact
  assert.match(
    html,
    /print-color-adjust:\s*exact/i,
    'expected print-color-adjust: exact'
  )
})

test('builder: prevents numeric cell wrapping with white-space: nowrap on td.num', () => {
  const html = buildInventoryReportHtml({
    businessName: 'Ferretería Central',
    generatedAt: '11/11/2026 12:00:00',
    rows: []
  })

  assert.match(
    html,
    /td\.num\s*\{[^}]*white-space:\s*nowrap/i,
    'expected td.num { white-space: nowrap }'
  )
})

test('builder: computes summary strip and totals row correctly for a fixture with service and inactive rows', () => {
  const rows = [
    // 1. Active product: stock 10, cost 100, price 150 -> cost val 1000, price val 1500
    {
      sku: 'PROD-1',
      name: 'Taladro Percutor',
      category: 'Herramientas',
      item_kind: 'Producto',
      price: 150,
      cost_price: 100,
      stock: 10,
      min_stock: 5,
      is_active: 'Sí'
    },
    // 2. Inactive product: stock 4, cost 200, price 300 -> cost val 800, price val 1200
    {
      sku: 'PROD-2',
      name: 'Sierra Circular (Descontinuada)',
      category: 'Herramientas',
      item_kind: 'Producto',
      price: 300,
      cost_price: 200,
      stock: 4,
      min_stock: 2,
      is_active: 'No'
    },
    // 3. Service row: excluded from stock units and valuation
    {
      sku: 'SVC-1',
      name: 'Instalación y Calibración',
      category: 'Servicios',
      item_kind: 'Servicio',
      price: 500,
      cost_price: 0,
      stock: null,
      min_stock: null,
      is_active: 'Sí'
    },
    // 4. Low stock product: stock 2 <= min_stock 5
    {
      sku: 'PROD-3',
      name: 'Broca 1/2 pulgada',
      category: 'Accesorios',
      item_kind: 'Producto',
      price: 50,
      cost_price: 25,
      stock: 2,
      min_stock: 5,
      is_active: 'Sí'
    }
  ]

  // Expected totals:
  // Total items: 4 rows
  // Units (products only): 10 + 4 + 2 = 16 units
  // Cost valuation: (10 * 100) + (4 * 200) + (2 * 25) = 1000 + 800 + 50 = 1,850.00
  // Price valuation: (10 * 150) + (4 * 300) + (2 * 50) = 1500 + 1200 + 100 = 2,800.00

  const html = buildInventoryReportHtml({
    businessName: 'Distribuidora del Caribe',
    generatedAt: '11/11/2026 14:00:00',
    rows,
    currency: 'RD$'
  })

  // Summary KPIs
  assert.ok(html.includes('>Artículos</div>'), 'must have Artículos KPI card')
  assert.ok(html.includes('>4</div>'), 'expected 4 total items count')

  assert.ok(html.includes('>Unidades en existencia</div>'), 'must have Unidades KPI card')
  assert.ok(html.includes('>16</div>'), 'expected 16 total product units')

  assert.ok(html.includes('>Valor a costo</div>'), 'must have Valor a costo KPI card')
  assert.ok(html.includes('RD$ 1,850.00'), 'expected RD$ 1,850.00 cost valuation')

  assert.ok(html.includes('>Valor a precio de venta</div>'), 'must have Valor a precio KPI card')
  assert.ok(html.includes('RD$ 2,800.00'), 'expected RD$ 2,800.00 price valuation')

  // Table row checks:
  // Low-stock item PROD-3 has "Bajo mínimo" badge
  assert.ok(
    html.includes('Bajo mínimo'),
    'expected "Bajo mínimo" badge for low stock product'
  )

  // Service item shows "—" for stock and cost valuation
  assert.ok(html.includes('<td>Instalación y Calibración</td>'))

  // Inactive item has Inactivo pill
  assert.ok(html.includes('Inactivo</span>'))
  assert.ok(html.includes('Activo</span>'))

  // Totals row in tfoot
  assert.match(
    html,
    /<tfoot[\s\S]*?Totales[\s\S]*?16[\s\S]*?RD\$\s*1,850\.00[\s\S]*?<\/tfoot>/,
    'tfoot must contain Totales, 16 units, and RD$ 1,850.00 valuation'
  )
})

test('main.js: desktop:save-pdf-from-html handler supports optional payload.landscape', () => {
  const source = read('main.js')

  const handlerIdx = source.indexOf("'desktop:save-pdf-from-html'")
  assert.ok(handlerIdx !== -1, 'main.js must register desktop:save-pdf-from-html')
  const handlerBody = source.slice(handlerIdx, handlerIdx + 2000)

  // Must reference printToPDF and check payload.landscape
  assert.match(
    handlerBody,
    /printToPDF/,
    'must call printToPDF'
  )
  assert.match(
    handlerBody,
    /landscape:\s*true/,
    'must support landscape: true'
  )
  assert.match(
    handlerBody,
    /payload\.landscape\s*===\s*true/,
    'must check payload.landscape === true'
  )
})

test('index.html: loads components/inventory-report.js before renderer.js', () => {
  const html = read('index.html')

  const reportScriptIdx = html.indexOf('src="./components/inventory-report.js"')
  const rendererScriptIdx = html.indexOf('src="./renderer.js"')

  assert.ok(reportScriptIdx !== -1, 'index.html must include components/inventory-report.js')
  assert.ok(rendererScriptIdx !== -1, 'index.html must include renderer.js')
  assert.ok(
    reportScriptIdx < rendererScriptIdx,
    'components/inventory-report.js must be loaded before renderer.js'
  )
})

test('renderer.js: export_catalog includes min_stock in rows without adding Excel columns', () => {
  const source = read('renderer.js')

  const idx = source.indexOf("action === 'export_catalog'")
  assert.ok(idx !== -1, "expected action === 'export_catalog' in renderer.js")
  const endIdx = source.indexOf("sheetName: 'Inventario'", idx)
  const body = source.slice(idx, endIdx !== -1 ? endIdx + 200 : idx + 4000)

  // Must push min_stock to rows
  assert.match(body, /min_stock:\s*isSvc\s*\?\s*null\s*:\s*numOrNull\(r\.min_stock\)/)

  // Must NOT add min_stock to columns array
  assert.doesNotMatch(body, /key:\s*['"]min_stock['"]/, 'min_stock must not be in Excel columns')
})

test('renderer.js: #inv-print-btn and #inv-pdf-btn render in listActions with proper icons', () => {
  const source = read('renderer.js')

  // Print button
  assert.match(
    source,
    /<button[^>]*id=["']inv-print-btn["'][^>]*>[\s\S]{0,120}Imprimir<\/button>/,
    '#inv-print-btn must render Imprimir'
  )
  assert.match(
    source,
    /<button[^>]*id=["']inv-print-btn["'][^>]*>[\s\S]{0,120}print/,
    '#inv-print-btn must use print icon'
  )

  // PDF button
  assert.match(
    source,
    /<button[^>]*id=["']inv-pdf-btn["'][^>]*>[\s\S]{0,120}PDF<\/button>/,
    '#inv-pdf-btn must render PDF'
  )
  assert.match(
    source,
    /<button[^>]*id=["']inv-pdf-btn["'][^>]*>[\s\S]{0,120}picture_as_pdf/,
    '#inv-pdf-btn must use picture_as_pdf icon'
  )
})

test('renderer.js: #inv-print-btn listener calls openHtmlPreview with autoPrint: true and guards on empty catalog via helper', () => {
  const source = read('renderer.js')

  const helperIdx = source.indexOf('const buildInventoryReportFromCatalog =')
  assert.ok(helperIdx !== -1, 'expected buildInventoryReportFromCatalog helper in renderer.js')
  const helperBody = source.slice(helperIdx, helperIdx + 1600)

  // Empty catalog alert exists in the helper
  assert.match(
    helperBody,
    /No hay artículos para imprimir\./,
    'helper must show empty catalog message'
  )

  // Empty-catalog message exists exactly once across renderer.js
  const occurrences = (source.match(/No hay artículos para imprimir\./g) || []).length
  assert.equal(occurrences, 1, 'empty-catalog message must exist exactly once in helper')

  // Builder missing alert
  assert.match(
    helperBody,
    /El generador del reporte no está disponible\./,
    'helper must alert when report builder is missing'
  )

  // Resolves builder only via window.ZyronInventoryReport?.buildInventoryReportHtml
  assert.match(
    helperBody,
    /window\.ZyronInventoryReport\?\.buildInventoryReportHtml/,
    'helper must resolve builder via window.ZyronInventoryReport?.buildInventoryReportHtml'
  )
  assert.doesNotMatch(
    source,
    /window\.buildInventoryReportHtml/,
    'renderer.js must not reference window.buildInventoryReportHtml'
  )

  const idx = source.indexOf("getElementById('inv-print-btn')")
  assert.ok(idx !== -1, 'expected #inv-print-btn listener in renderer.js')
  const body = source.slice(idx, idx + 1200)

  // Calls buildInventoryReportFromCatalog
  assert.match(
    body,
    /buildInventoryReportFromCatalog\(tid\)/,
    'print handler must call buildInventoryReportFromCatalog'
  )

  // Calls openHtmlPreview with autoPrint: true
  assert.match(
    body,
    /openHtmlPreview\(\{[\s\S]*?autoPrint:\s*true[\s\S]*?\}\)/,
    'must call openHtmlPreview with autoPrint: true'
  )

  // Checks electronAPI availability
  assert.match(
    body,
    /window\.electronAPI\?\.openHtmlPreview/,
    'must check window.electronAPI?.openHtmlPreview'
  )
})

test('renderer.js: #inv-pdf-btn listener calls savePdfFromHtml with landscape: true and guards on empty catalog via helper', () => {
  const source = read('renderer.js')

  const idx = source.indexOf("getElementById('inv-pdf-btn')")
  assert.ok(idx !== -1, 'expected #inv-pdf-btn listener in renderer.js')
  const body = source.slice(idx, idx + 1200)

  // Calls buildInventoryReportFromCatalog
  assert.match(
    body,
    /buildInventoryReportFromCatalog\(tid\)/,
    'pdf handler must call buildInventoryReportFromCatalog'
  )

  // Calls savePdfFromHtml with landscape: true
  assert.match(
    body,
    /savePdfFromHtml\(\{[\s\S]*?landscape:\s*true[\s\S]*?\}\)/,
    'must call savePdfFromHtml with landscape: true'
  )

  // Checks electronAPI availability
  assert.match(
    body,
    /window\.electronAPI\?\.savePdfFromHtml/,
    'must check window.electronAPI?.savePdfFromHtml'
  )
})

test('smoke: writes a sample report to the OS temp dir for inspection', () => {
  const sampleRows = [
    {
      sku: 'HERR-001',
      name: 'Taladro Inalámbrico 20V Max',
      category: 'Herramientas Eléctricas',
      item_kind: 'Producto',
      price: 6500.0,
      cost_price: 4200.0,
      stock: 15,
      min_stock: 5,
      is_active: 'Sí'
    },
    {
      sku: 'HERR-002',
      name: 'Juego de Destornilladores 6 Piezas',
      category: 'Herramientas Manuales',
      item_kind: 'Producto',
      price: 850.0,
      cost_price: 450.0,
      stock: 3,
      min_stock: 10, // low stock!
      is_active: 'Sí'
    },
    {
      sku: 'MAT-001',
      name: 'Cinta Métrica 8m / 26ft',
      category: 'Medición',
      item_kind: 'Producto',
      price: 420.0,
      cost_price: 250.0,
      stock: 0,
      min_stock: 5, // low stock!
      is_active: 'Sí'
    },
    {
      sku: 'SERV-001',
      name: 'Mantenimiento Preventivo de Herramientas',
      category: 'Servicios Técnicos',
      item_kind: 'Servicio',
      price: 1500.0,
      cost_price: 0,
      stock: null,
      min_stock: null,
      is_active: 'Sí'
    },
    {
      sku: 'DESC-001',
      name: 'Disco de Corte Metal 4-1/2 (Lote Anterior)',
      category: 'Consumibles',
      item_kind: 'Producto',
      price: 95.0,
      cost_price: 60.0,
      stock: 8,
      min_stock: 0,
      is_active: 'No'
    }
  ]

  const html = buildInventoryReportHtml({
    businessName: 'Ferretería Industrial Dominicana, SRL',
    generatedAt: new Date().toLocaleString('es-DO'),
    rows: sampleRows,
    currency: 'RD$'
  })

  const samplePath = path.join(os.tmpdir(), 'inventory-report-sample.html')
  fs.writeFileSync(samplePath, html, 'utf8')
  assert.ok(fs.existsSync(samplePath), 'sample report file must exist')
  console.log(`[sample-report] Written to: ${samplePath}`)
})
