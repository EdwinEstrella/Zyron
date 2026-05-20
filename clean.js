const fs = require('fs')
let html = fs.readFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', 'utf8')

// 1. Remove Plantilla from facturas
html = html.replace(
  /<label class="text-xs font-semibold text-on-surface-variant">Plantilla[\s\S]*?<\/label>/i,
  ''
)

// Remove the event listener for factura-template-save
html = html.replace(
  /const btnSave\s*=\s*document\.getElementById\('factura-template-save'\);[\s\S]*?\}\s*\);?\s*\}/i,
  ''
)

// 2. Remove Plantilla from presupuestos
html = html.replace(
  /<label class="text-xs font-semibold text-on-surface-variant sm:col-span-2">Plantilla[\s\S]*?<\/label>/i,
  ''
)

// Remove the event listener for est-template-save
html = html.replace(
  /const btnSaveEst\s*=\s*document\.getElementById\('est-template-save'\);[\s\S]*?\}\s*\);?\s*\}/i,
  ''
)

// 3. Remove Ciudad and Pais from cli-form
html = html.replace(/<label class="block text-sm">Ciudad[\s\S]*?<\/label>/gi, '')
html = html.replace(/<label class="block text-sm">Pais[\s\S]*?<\/label>/gi, '')

// 4. Remove unused lineRowTemplate (defined in renderFacturasModule)
html = html.replace(
  /const lineRowTemplate\s*=\s*\(line\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*?return `<tr data-inv-line[\s\S]*?<\/tr>`;\r?\n\s*\};\r?\n/g,
  ''
)

fs.writeFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', html, 'utf8')
console.log('Removed redundant inputs and dead code!')
