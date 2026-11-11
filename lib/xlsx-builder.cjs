const ExcelJS = require('exceljs')

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF0F2744' }
}

const HEADER_FONT = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' }
}

const ZEBRA_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' }
}

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
}

const HEADER_BORDER = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
}

const NUMERIC_FORMATS = {
  money: '#,##0.00',
  integer: '#,##0',
  percent: '0.00%'
}

function toFiniteNumber(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Builds an Excel workbook with styled title, subtitle, headers, auto-filters, frozen pane,
 * and typed data formatting (text, integer, money, percent, date) with zebra striping.
 *
 * @param {Object} options
 * @param {string} [options.sheetName]
 * @param {string} [options.title]
 * @param {string} [options.subtitle]
 * @param {Array<{header: string, key: string, width?: number, type?: string}>} [options.columns]
 * @param {Array<Object|Array>} [options.rows]
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function buildWorkbook({
  sheetName = 'Inventario',
  title = '',
  subtitle = '',
  columns = [],
  rows = []
} = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Zyron'
  workbook.created = new Date()

  const safeSheetName =
    String(sheetName || 'Inventario')
      .replace(/[\\/?*:[\]]/g, '')
      .slice(0, 31) || 'Inventario'
  const sheet = workbook.addWorksheet(safeSheetName, {
    views: [{ state: 'frozen', ySplit: 4 }]
  })

  // Column widths
  columns.forEach((col, idx) => {
    const colNumber = idx + 1
    sheet.getColumn(colNumber).width =
      typeof col.width === 'number' && col.width > 0 ? col.width : 15
  })

  // Row 1: Title
  const titleRow = sheet.getRow(1)
  titleRow.height = 26
  const titleCell = titleRow.getCell(1)
  titleCell.value = title || ''
  titleCell.font = {
    name: 'Calibri',
    size: 16,
    bold: true,
    color: { argb: 'FF0F2744' }
  }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }

  // Row 2: Subtitle
  const subtitleRow = sheet.getRow(2)
  subtitleRow.height = 18
  const subtitleCell = subtitleRow.getCell(1)
  subtitleCell.value = subtitle || ''
  subtitleCell.font = {
    name: 'Calibri',
    size: 10,
    italic: true,
    color: { argb: 'FF64748B' }
  }
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' }

  // Row 3: Blank row
  sheet.getRow(3).height = 10

  // Row 4: Header row
  const headerRow = sheet.getRow(4)
  headerRow.height = 26

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = col.header || col.key || ''
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true
    }
    cell.border = HEADER_BORDER
  })

  // Autofilter on header row
  if (columns.length > 0) {
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: columns.length }
    }
  }

  // Row 5+: Data rows
  const rowCount = Array.isArray(rows) ? rows.length : 0
  for (let i = 0; i < rowCount; i++) {
    const rowData = rows[i]
    const rowNumber = 5 + i
    const sheetRow = sheet.getRow(rowNumber)
    sheetRow.height = 20

    const isZebra = i % 2 === 1

    columns.forEach((col, colIdx) => {
      const cell = sheetRow.getCell(colIdx + 1)
      const raw =
        rowData && typeof rowData === 'object'
          ? Array.isArray(rowData)
            ? rowData[colIdx]
            : rowData[col.key]
          : null

      const type = String(col.type || 'text').toLowerCase()

      if (NUMERIC_FORMATS[type]) {
        cell.numFmt = NUMERIC_FORMATS[type]
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
        cell.value = toFiniteNumber(raw)
      } else if (type === 'date') {
        cell.numFmt = 'yyyy-mm-dd'
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        if (raw instanceof Date) {
          cell.value = raw
        } else if (raw != null && raw !== '') {
          cell.value = String(raw)
        } else {
          cell.value = null
        }
      } else {
        // text (default)
        cell.alignment = { vertical: 'middle', horizontal: 'left' }
        cell.value = raw == null ? '' : String(raw)
      }

      if (isZebra) {
        cell.fill = ZEBRA_FILL
      }
      cell.border = THIN_BORDER
    })
  }

  return workbook
}

module.exports = {
  buildWorkbook,
  toFiniteNumber,
  NUMERIC_FORMATS,
  HEADER_FILL,
  HEADER_FONT,
  ZEBRA_FILL,
  THIN_BORDER,
  HEADER_BORDER
}
