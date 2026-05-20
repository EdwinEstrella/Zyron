const fs = require('fs')
let html = fs.readFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', 'utf8')

// 1. Line 6890 / 10599
html = html.replace(
  /placeholder="RNC, terminos de pago, etc.">\$\{escapeHtml\(/g,
  'placeholder="${escapeHtml(state.tenantContext?.fiscalIdLabel || \'ID fiscal\')}, terminos de pago, etc.">${escapeHtml('
)

// 2. Line 8878
html = html.replace(
  'placeholder="Buscar nombre, correo, telefono, RNC…"',
  'placeholder="Buscar nombre, correo, telefono, ${escapeHtml(state.tenantContext?.fiscalIdLabel || \'ID fiscal\')}…"'
)

// 3. Line 8947
html = html.replace(
  '<label class="block text-sm">RNC / ID fiscal<input name="tax_id"',
  '<label class="block text-sm">${escapeHtml(state.tenantContext?.fiscalIdLabel || \'ID fiscal\')} / ID fiscal<input name="tax_id"'
)

// 4. Line 10533
html = html.replace(
  '<label class="text-xs font-medium text-on-surface-variant">RNC / identificacion fiscal',
  '<label class="text-xs font-medium text-on-surface-variant">${escapeHtml(state.tenantContext?.fiscalIdLabel || \'ID fiscal\')} / identificacion fiscal'
)

// 5. Line 10711-10714
html = html.replace(
  /\{\s*key:\s*'pagos',\s*icon:\s*'payments',\s*label:\s*'Pagos'\s*\},[\r\n\s]*/g,
  ''
)

// 6. Line 10772
html = html.replace(
  /pagos:\s*shortcutCard\('Pagos',\s*'Metodos de pago, cuentas por cobrar, vencimientos y conciliacion viven en Pagos y cobros.',\s*'Abrir pagos',\s*'pagos'\),[\r\n\s]*/g,
  ''
)

// 7. Line 10510 (preview tax id)
html = html.replace(
  "tax_id: 'RNC 000-00000-0',",
  "tax_id: `${state.tenantContext?.fiscalIdLabel || 'ID fiscal'} 000-00000-0`,"
)

fs.writeFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', html, 'utf8')
console.log('Replaced successfully!')
