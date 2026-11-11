/**
 * @file inventory-export-xlsx.test.cjs
 * @description Behavior coverage for native .xlsx inventory export.
 *
 * Assertions:
 * 1. lib/xlsx-builder builds styled workbook with title, subtitle, navy headers, frozen pane, and autofilter.
 * 2. lib/xlsx-builder applies correct number formats, alignments, thin borders, and zebra striping.
 * 3. lib/xlsx-builder percent cells store exact values (0.01, 0.005, null) with 0.00% numFmt.
 * 4. lib/xlsx-builder writes valid .xlsx readable by ExcelJS round-trip.
 * 5. main.js registers desktop:save-xlsx handler with dialog and buildWorkbook.
 * 6. preload.js exposes saveXlsx API on electronAPI.
 * 7. renderer.js export_catalog action no longer emits comma CSV and returns structured xlsx payload.
 * 8. renderer.js export_catalog divides percent points by 100 without the > 1 ? heuristic.
 * 9. renderer.js #inv-export-btn renders 'Exportar Excel' and calls saveXlsx.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const ExcelJS = require('exceljs')

const root = path.resolve(__dirname, '../..')
const { buildWorkbook, toFiniteNumber, NUMERIC_FORMATS } = require(path.join(
  root,
  'lib/xlsx-builder.cjs'
))

const read = (file) =>
  fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

test('xlsx-builder: builds workbook with title, subtitle, navy headers, frozen pane, and autofilter', async () => {
  const columns = [
    { header: 'SKU', key: 'sku', width: 16, type: 'text' },
    { header: 'Nombre', key: 'name', width: 32, type: 'text' },
    { header: 'Precio', key: 'price', width: 14, type: 'money' }
  ]
  const rows = [
    { sku: 'P-001', name: 'Articulo 1', price: 100.5 },
    { sku: 'P-002', name: 'Articulo 2', price: 200 }
  ]

  const wb = await buildWorkbook({
    sheetName: 'Catalogo',
    title: 'Catálogo de Productos',
    subtitle: 'Generado: 2026-11-11',
    columns,
    rows
  })

  const ws = wb.getWorksheet('Catalogo')
  assert.ok(ws, 'expected worksheet Catalogo to exist')

  // Frozen pane under row 4
  assert.ok(Array.isArray(ws.views) && ws.views.length > 0, 'expected views array on worksheet')
  assert.equal(ws.views[0].state, 'frozen', 'views[0] state must be frozen')
  assert.equal(ws.views[0].ySplit, 4, 'ySplit must be 4 (rows 1-4 frozen)')

  // AutoFilter on header row
  assert.ok(ws.autoFilter, 'expected autoFilter on worksheet')

  // Row 1: Title
  const titleCell = ws.getCell('A1')
  assert.equal(titleCell.value, 'Catálogo de Productos')
  assert.equal(titleCell.font?.bold, true)
  assert.equal(titleCell.font?.size, 16)

  // Row 2: Subtitle
  const subtitleCell = ws.getCell('A2')
  assert.equal(subtitleCell.value, 'Generado: 2026-11-11')
  assert.equal(subtitleCell.font?.italic, true)

  // Row 4: Header styling
  const h1 = ws.getCell('A4')
  assert.equal(h1.value, 'SKU')
  assert.equal(h1.fill?.type, 'pattern')
  assert.equal(h1.fill?.fgColor?.argb, 'FF0F2744', 'header fill must be dark navy FF0F2744')
  assert.equal(h1.font?.color?.argb, 'FFFFFFFF', 'header font must be white')
  assert.equal(h1.font?.bold, true, 'header font must be bold')
  assert.equal(h1.alignment?.horizontal, 'center', 'header must be centered')
  assert.equal(h1.border?.top?.style, 'thin', 'header must have thin borders')
  assert.equal(h1.border?.bottom?.style, 'thin')
})

test('xlsx-builder: applies number formats, right alignment, zebra striping, and thin borders', async () => {
  const columns = [
    { header: 'Texto', key: 'colText', width: 20, type: 'text' },
    { header: 'Entero', key: 'colInt', width: 14, type: 'integer' },
    { header: 'Moneda', key: 'colMoney', width: 14, type: 'money' },
    { header: 'Porcentaje', key: 'colPct', width: 14, type: 'percent' },
    { header: 'Fecha', key: 'colDate', width: 14, type: 'date' }
  ]
  const rows = [
    { colText: 'Fila 1', colInt: 42, colMoney: 1250.75, colPct: 0.18, colDate: '2026-11-11' },
    { colText: 'Fila 2', colInt: 100, colMoney: 50.0, colPct: 0.05, colDate: new Date('2026-11-11') }
  ]

  const wb = await buildWorkbook({
    sheetName: 'Formatos',
    columns,
    rows
  })
  const ws = wb.getWorksheet('Formatos')

  // Row 5: First data row (no zebra)
  const r5Text = ws.getCell('A5')
  const r5Int = ws.getCell('B5')
  const r5Money = ws.getCell('C5')
  const r5Pct = ws.getCell('D5')
  const r5Date = ws.getCell('E5')

  assert.equal(r5Text.value, 'Fila 1')
  assert.equal(r5Text.alignment?.horizontal, 'left')

  assert.equal(r5Int.value, 42)
  assert.equal(r5Int.numFmt, '#,##0')
  assert.equal(r5Int.alignment?.horizontal, 'right')

  assert.equal(r5Money.value, 1250.75)
  assert.equal(r5Money.numFmt, '#,##0.00')
  assert.equal(r5Money.alignment?.horizontal, 'right')

  assert.equal(r5Pct.value, 0.18)
  assert.equal(r5Pct.numFmt, '0.00%')
  assert.equal(r5Pct.alignment?.horizontal, 'right')

  assert.equal(r5Date.numFmt, 'yyyy-mm-dd')
  assert.equal(r5Date.alignment?.horizontal, 'center')

  // Borders
  assert.equal(r5Money.border?.top?.style, 'thin')
  assert.equal(r5Money.border?.bottom?.style, 'thin')

  // First row has no zebra fill
  assert.ok(!r5Money.fill || r5Money.fill?.fgColor?.argb !== 'FFF1F5F9')

  // Row 6: Second data row (zebra fill FFF1F5F9)
  const r6Text = ws.getCell('A6')
  const r6Money = ws.getCell('C6')
  assert.equal(r6Text.fill?.type, 'pattern')
  assert.equal(
    r6Text.fill?.fgColor?.argb,
    'FFF1F5F9',
    'alternate row must have light gray zebra fill FFF1F5F9'
  )
  assert.equal(r6Money.fill?.fgColor?.argb, 'FFF1F5F9')
})

test('xlsx-builder: percent columns store exact values 0.01, 0.005 and null without heuristic alteration', async () => {
  const columns = [{ header: 'Porcentaje', key: 'pct', width: 14, type: 'percent' }]
  const rows = [{ pct: 0.01 }, { pct: 0.005 }, { pct: null }]

  const wb = await buildWorkbook({
    sheetName: 'PctTest',
    columns,
    rows
  })
  const ws = wb.getWorksheet('PctTest')

  const r5 = ws.getCell('A5')
  assert.equal(r5.value, 0.01, '0.01 must be stored as 0.01')
  assert.equal(r5.numFmt, '0.00%')
  assert.equal(r5.alignment?.horizontal, 'right')

  const r6 = ws.getCell('A6')
  assert.equal(r6.value, 0.005, '0.005 must be stored as 0.005')
  assert.equal(r6.numFmt, '0.00%')
  assert.equal(r6.alignment?.horizontal, 'right')

  const r7 = ws.getCell('A7')
  assert.equal(r7.value, null, 'null must be stored as null')
  assert.equal(r7.numFmt, '0.00%')

  // Helper assertions
  assert.equal(toFiniteNumber(0.01), 0.01)
  assert.equal(toFiniteNumber(0.005), 0.005)
  assert.equal(toFiniteNumber(null), null)
  assert.equal(toFiniteNumber(''), null)
  assert.equal(NUMERIC_FORMATS.percent, '0.00%')
})

test('xlsx-builder: write and readback round-trip preserves content and styling', async () => {
  const tmpFile = path.join(os.tmpdir(), `zyron_test_${Date.now()}.xlsx`)
  try {
    const wb = await buildWorkbook({
      sheetName: 'Inventario',
      title: 'Inventario General',
      subtitle: 'Generado: 2026-11-11',
      columns: [
        { header: 'SKU', key: 'sku', width: 15, type: 'text' },
        { header: 'Precio', key: 'price', width: 14, type: 'money' }
      ],
      rows: [
        { sku: 'SKU-001', price: 99.5 },
        { sku: 'SKU-002', price: 199.0 }
      ]
    })
    await wb.xlsx.writeFile(tmpFile)

    const reloaded = new ExcelJS.Workbook()
    await reloaded.xlsx.readFile(tmpFile)
    const ws = reloaded.getWorksheet('Inventario')
    assert.ok(ws, 'expected worksheet Inventario after reload')
    assert.equal(ws.getCell('A1').value, 'Inventario General')
    assert.equal(ws.getCell('A4').value, 'SKU')
    assert.equal(ws.getCell('B4').value, 'Precio')
    assert.equal(ws.getCell('A5').value, 'SKU-001')
    assert.equal(ws.getCell('B5').value, 99.5)
    assert.equal(ws.getCell('B5').numFmt, '#,##0.00')
    assert.equal(ws.getCell('A6').value, 'SKU-002')
    assert.equal(ws.getCell('A6').fill?.fgColor?.argb, 'FFF1F5F9')
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile)
    }
  }
})

test('main.js: registers desktop:save-xlsx handler with dialog and xlsx-builder', () => {
  const source = read('main.js')

  // Import
  assert.match(
    source,
    /require\(['"]\.\/lib\/xlsx-builder\.cjs['"]\)/,
    'main.js must require lib/xlsx-builder.cjs'
  )

  // IPC handler
  assert.match(
    source,
    /ipcMain\.handle\(\s*['"]desktop:save-xlsx['"]\s*,\s*async/,
    'main.js must handle desktop:save-xlsx IPC channel'
  )

  // Dialog and filename sanitization
  assert.match(source, /showSaveDialog\s*\(/)
  assert.match(source, /extensions:\s*\[['"]xlsx['"]\]/)

  // Invokes buildWorkbook and writes file
  assert.match(source, /buildWorkbook\s*\(/)
  assert.match(source, /writeFile\s*\(/)
})

test('preload.js: exposes saveXlsx on electronAPI', () => {
  const source = read('preload.js')
  assert.match(
    source,
    /saveXlsx:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\(['"]desktop:save-xlsx['"],\s*payload\)/,
    'preload.js must expose saveXlsx invoking desktop:save-xlsx'
  )
})

test('renderer.js: export_catalog no longer emits comma CSV and returns structured xlsx payload', () => {
  const source = read('renderer.js')

  // Find export_catalog block
  const idx = source.indexOf("action === 'export_catalog'")
  assert.ok(idx !== -1, "expected action === 'export_catalog' in renderer.js")
  const endIdx = source.indexOf("return { data: { error: 'Unknown action' }", idx)
  const body = source.slice(idx, endIdx !== -1 ? endIdx : idx + 5000)

  // Assert NO comma CSV lines
  assert.doesNotMatch(body, /format:\s*['"]csv['"]/, 'must not return format: csv')
  assert.doesNotMatch(body, /catalogo_productos\.csv/, 'must not reference catalogo_productos.csv')
  assert.doesNotMatch(body, /'\ufeff'\s*\+\s*lines\.join/, 'must not build CSV string with BOM')

  // Assert returns format: xlsx with columns and rows
  assert.match(body, /format:\s*['"]xlsx['"]/, 'must return format: xlsx')
  assert.match(
    body,
    /filename:\s*['"]catalogo_productos\.xlsx['"]/,
    'must specify filename catalogo_productos.xlsx'
  )
  assert.match(body, /columns\s*,/, 'must return columns')
  assert.match(body, /rows\s*,?/, 'must return rows')

  // Assert all 12 required Spanish headers
  const requiredHeaders = [
    'SKU',
    'Nombre',
    'Tipo',
    'Precio',
    'Costo',
    'Existencia',
    'Controla stock (Sí/No)',
    'ITBIS %',
    'Descuento %',
    'Categoría',
    'Unidad',
    'Activo (Sí/No)'
  ]
  for (const h of requiredHeaders) {
    assert.ok(body.includes(h), `expected export_catalog columns to include header '${h}'`)
  }

  // Assert percent conversion divides by 100 and no longer contains > 1 ? heuristic
  assert.match(
    body,
    /pctOrNull\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\/ 100/,
    'pctOrNull must divide by 100'
  )
  assert.doesNotMatch(body, />\s*1\s*\?/, 'pctOrNull must not contain > 1 ? heuristic')
  assert.match(body, /percent points/i, 'export_catalog must document that DB stores percent points')

  // Assert unused productsCsvEsc has been removed from renderer.js
  assert.doesNotMatch(source, /const productsCsvEsc\b/, 'productsCsvEsc must be removed from renderer.js')
})

test('renderer.js: #inv-export-btn renders "Exportar Excel" and invokes electronAPI.saveXlsx', () => {
  const source = read('renderer.js')

  // Button label
  assert.match(
    source,
    /<button[^>]*id=["']inv-export-btn["'][^>]*>[\s\S]{0,100}Exportar Excel<\/button>/,
    'inv-export-btn label must be "Exportar Excel"'
  )
  assert.doesNotMatch(
    source,
    /<button[^>]*id=["']inv-export-btn["'][^>]*>[\s\S]{0,100}Exportar CSV<\/button>/,
    'inv-export-btn label must no longer be "Exportar CSV"'
  )

  // Click handler
  const btnIdx = source.indexOf("document.getElementById('inv-export-btn')")
  assert.ok(btnIdx !== -1, "expected inv-export-btn listener in renderer.js")
  const handlerBody = source.slice(btnIdx, btnIdx + 1500)

  assert.match(
    handlerBody,
    /window\.electronAPI\.saveXlsx\s*\(/,
    'must invoke window.electronAPI.saveXlsx'
  )
  assert.match(handlerBody, /window\.ZyronDialog\.alert\s*\(/, 'must show ZyronDialog.alert on error')
  assert.doesNotMatch(handlerBody, /createObjectURL/, 'must not create blob URL for download')
})
