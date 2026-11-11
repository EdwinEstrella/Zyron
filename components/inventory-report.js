/**
 * @file inventory-report.js
 * @description Pure HTML builder for Zyron's printable A4 landscape inventory report.
 *
 * Self-contained HTML/CSS generator with:
 * - High-contrast navy (#0f2744) header band and thead
 * - 4 KPI summary cards (Artículos, Unidades en existencia, Valor a costo, Valor a precio)
 * - Repeating thead across pages with table-header-group
 * - Tabular-nums numeric formatting in es-DO locale
 * - "Bajo mínimo" low-stock indicator badge
 * - Totals row in tfoot with 2px navy top border
 * - A4 landscape print CSS with exact color adjustments
 *
 * UMD export compatible with browser scripts and Node.js require().
 */

;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
  if (root) {
    root.ZyronInventoryReport = api
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict'

  /**
   * Escape special HTML characters to prevent XSS / markup injection.
   * @param {unknown} value
   * @returns {string}
   */
  const escapeHtml = (value) => {
    if (value == null) return ''
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  /**
   * Format numbers in es-DO locale with specified decimal places.
   * @param {unknown} val
   * @param {number} decimals
   * @returns {string}
   */
  const formatNumber = (val, decimals = 0) => {
    if (val == null || val === '') return '—'
    const n = Number(val)
    if (!Number.isFinite(n)) return '—'
    return n.toLocaleString('es-DO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  /**
   * Format money in es-DO locale with 2 decimal places and currency prefix.
   * @param {unknown} val
   * @param {string} prefix
   * @returns {string}
   */
  const formatMoney = (val, prefix = 'RD$') => {
    if (val == null || val === '') return '—'
    const n = Number(val)
    if (!Number.isFinite(n)) return '—'
    const formatted = n.toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    return prefix ? `${prefix} ${formatted}` : formatted
  }

  /**
   * Determine whether a row represents a service.
   * @param {object} row
   * @returns {boolean}
   */
  const isServiceRow = (row) => {
    const kind = String(row?.item_kind || '').toLowerCase()
    return kind === 'service' || kind === 'servicio'
  }

  /**
   * Build complete self-contained HTML for an A4 landscape inventory report.
   *
   * @param {object} options
   * @param {string} [options.businessName] - Active tenant display name
   * @param {string|Date} [options.generatedAt] - Date/time string or Date instance
   * @param {Array<object>} [options.rows] - Inventory catalog product rows
   * @param {string} [options.currency='RD$'] - Currency label prefix
   * @returns {string} Fully rendered HTML document
   */
  const buildInventoryReportHtml = ({
    businessName = 'Zyron',
    generatedAt,
    rows = [],
    currency = 'RD$'
  } = {}) => {
    const safeBusinessName = escapeHtml(String(businessName || 'Zyron').trim() || 'Zyron')
    const generatedDateStr =
      typeof generatedAt === 'string' && generatedAt.trim()
        ? generatedAt.trim()
        : generatedAt instanceof Date && !isNaN(generatedAt)
          ? `${generatedAt.toLocaleDateString('es-DO')} ${generatedAt.toLocaleTimeString('es-DO')}`
          : `${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO')}`

    const catalogRows = Array.isArray(rows) ? rows : []

    let totalUnits = 0
    let totalCostValuation = 0
    let totalPriceValuation = 0

    for (const r of catalogRows) {
      if (!isServiceRow(r)) {
        const stock = Number(r.stock) || 0
        totalUnits += stock
        const cost = Number(r.cost_price) || 0
        totalCostValuation += stock * cost
        const price = Number(r.price) || 0
        totalPriceValuation += stock * price
      }
    }

    const tableRowsHtml = catalogRows
      .map((r) => {
        const isSvc = isServiceRow(r)
        const sku = escapeHtml(r.sku || '—')
        const name = escapeHtml(r.name || 'Sin nombre')
        const categoryLabel =
          typeof r.category === 'object' && r.category !== null
            ? r.category.label || r.category.code || '—'
            : r.category || '—'
        const category = escapeHtml(categoryLabel)
        const tipo = isSvc ? 'Servicio' : 'Producto'

        const costVal = Number(r.cost_price)
        const priceVal = Number(r.price)
        const stockVal = Number(r.stock)
        const minStockVal = Number(r.min_stock)

        let stockCellContent = '—'
        let costValuationCell = '—'

        if (!isSvc) {
          const formattedStock = Number.isFinite(stockVal) ? formatNumber(stockVal, Number.isInteger(stockVal) ? 0 : 2) : '0'
          const hasLowStockData = Number.isFinite(minStockVal) && minStockVal > 0
          const isLowStock = hasLowStockData && Number.isFinite(stockVal) && stockVal <= minStockVal

          if (isLowStock) {
            stockCellContent = `${formattedStock} <span class="badge-low-stock">Bajo mínimo</span>`
          } else {
            stockCellContent = formattedStock
          }

          if (Number.isFinite(costVal) && Number.isFinite(stockVal)) {
            costValuationCell = formatMoney(costVal * stockVal, currency)
          } else {
            costValuationCell = formatMoney(0, currency)
          }
        }

        const costCell = Number.isFinite(costVal) ? formatMoney(costVal, currency) : '—'
        const priceCell = Number.isFinite(priceVal) ? formatMoney(priceVal, currency) : '—'

        const isActive = r.is_active !== false && r.is_active !== 'No'
        const statusHtml = isActive
          ? '<span class="status-pill status-active">Activo</span>'
          : '<span class="status-pill status-inactive">Inactivo</span>'

        return `<tr>
          <td>${sku}</td>
          <td>${name}</td>
          <td>${category}</td>
          <td class="center">${tipo}</td>
          <td class="num">${stockCellContent}</td>
          <td class="num">${costCell}</td>
          <td class="num">${priceCell}</td>
          <td class="num">${costValuationCell}</td>
          <td class="center">${statusHtml}</td>
        </tr>`
      })
      .join('\n')

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Reporte de Inventario - ${safeBusinessName}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 0;
      font-size: 11px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    .report-header {
      background-color: #0f2744;
      color: #ffffff;
      padding: 14px 18px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .business-name {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.01em;
      color: #ffffff;
    }
    .report-title {
      font-size: 13px;
      font-weight: 600;
      color: #94a3b8;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .header-right {
      text-align: right;
    }
    .generated-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.05em;
    }
    .generated-date {
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      font-variant-numeric: tabular-nums;
    }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 12px;
      margin-bottom: 14px;
    }
    .kpi-card {
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 14px;
    }
    .kpi-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
      margin-bottom: 4px;
    }
    .kpi-value {
      font-size: 18px;
      font-weight: 800;
      color: #0f2744;
      font-variant-numeric: tabular-nums;
    }
    .table-container {
      width: 100%;
      overflow: hidden;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
    }
    table.inventory-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    table.inventory-table thead {
      display: table-header-group;
    }
    table.inventory-table thead th {
      background-color: #0f2744;
      color: #ffffff;
      font-weight: 700;
      padding: 8px 10px;
      text-align: left;
      border: none;
      letter-spacing: 0.02em;
      font-size: 11px;
    }
    table.inventory-table thead th.num {
      text-align: right;
    }
    table.inventory-table thead th.center {
      text-align: center;
    }
    table.inventory-table tr {
      page-break-inside: avoid;
    }
    table.inventory-table tbody tr:nth-child(even) {
      background-color: #f1f5f9;
    }
    table.inventory-table tbody tr:nth-child(odd) {
      background-color: #ffffff;
    }
    table.inventory-table tbody td {
      padding: 6px 10px;
      border-bottom: 1px solid #cbd5e1;
      vertical-align: middle;
    }
    table.inventory-table tbody td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    table.inventory-table tbody td.center {
      text-align: center;
    }
    table.inventory-table tfoot {
      display: table-row-group;
    }
    table.inventory-table tfoot tr {
      border-top: 2px solid #0f2744;
      background-color: #f1f5f9;
      font-weight: 700;
    }
    table.inventory-table tfoot td {
      padding: 8px 10px;
      color: #0f2744;
      font-size: 11px;
    }
    table.inventory-table tfoot td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
      white-space: nowrap;
    }
    .badge-low-stock {
      display: inline-block;
      background-color: #fee2e2;
      color: #991b1b;
      border: 1px solid #f87171;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-left: 5px;
      vertical-align: middle;
    }
    .status-pill {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 600;
    }
    .status-active {
      background-color: #dcfce7;
      color: #166534;
    }
    .status-inactive {
      background-color: #e2e8f0;
      color: #64748b;
    }
    .report-footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #cbd5e1;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <header class="report-header">
    <div class="header-left">
      <h1 class="business-name">${safeBusinessName}</h1>
      <div class="report-title">Reporte de Inventario</div>
    </div>
    <div class="header-right">
      <div class="generated-label">Fecha y hora de emisión</div>
      <div class="generated-date">${escapeHtml(generatedDateStr)}</div>
    </div>
  </header>

  <section class="summary-strip">
    <div class="kpi-card">
      <div class="kpi-label">Artículos</div>
      <div class="kpi-value">${formatNumber(catalogRows.length)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Unidades en existencia</div>
      <div class="kpi-value">${formatNumber(totalUnits, Number.isInteger(totalUnits) ? 0 : 2)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Valor a costo</div>
      <div class="kpi-value">${formatMoney(totalCostValuation, currency)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Valor a precio de venta</div>
      <div class="kpi-value">${formatMoney(totalPriceValuation, currency)}</div>
    </div>
  </section>

  <div class="table-container">
    <table class="inventory-table">
      <thead>
        <tr>
          <th style="width: 12%;">SKU</th>
          <th style="width: 20%;">Nombre</th>
          <th style="width: 14%;">Categoría</th>
          <th style="width: 8%;" class="center">Tipo</th>
          <th style="width: 14%;" class="num">Existencia</th>
          <th style="width: 10%;" class="num">Costo</th>
          <th style="width: 10%;" class="num">Precio</th>
          <th style="width: 12%;" class="num">Valor a costo</th>
          <th style="width: 8%;" class="center">Estado</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align: right; font-weight: bold;">Totales</td>
          <td class="num">${formatNumber(totalUnits, Number.isInteger(totalUnits) ? 0 : 2)}</td>
          <td></td>
          <td></td>
          <td class="num">${formatMoney(totalCostValuation, currency)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <footer class="report-footer">
    <span>Generado por Zyron &bull; ${escapeHtml(generatedDateStr)}</span>
  </footer>
</body>
</html>`
  }

  return {
    buildInventoryReportHtml,
    escapeHtml,
    formatMoney,
    formatNumber,
    isServiceRow
  }
})
