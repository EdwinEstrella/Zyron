const fs = require('fs')
let html = fs.readFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', 'utf8')

// 1. Remove lineRowTemplate from anywhere in renderer.js
html = html.replace(
  /const lineRowTemplate\s*=\s*\(line\s*=\s*\{\}\)\s*=>\s*\{[\s\S]*?return `<tr data-inv-line[\s\S]*?<\/tr>`;\r?\n\s*\};\r?\n/g,
  ''
)

// 2. Remove factura-template-save listener
html = html.replace(
  /document\.getElementById\('factura-template-save'\)\?\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\);/gi,
  ''
)

// 3. Clean up the payload extraction for templateId in factura
html = html.replace(
  /templateId:\s*document\.getElementById\('factura-template'\)\?\.value\s*\|\|\s*docSettings\.templateId,/gi,
  'templateId: docSettings.templateId,'
)

// 4. Remove est-template-save listener
html = html.replace(
  /document\.getElementById\('est-template-save'\)\?\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\);/gi,
  ''
)

// 5. Clean up the payload extraction for templateId in presupuestos
html = html.replace(
  /templateId:\s*document\.getElementById\('est-template'\)\?\.value\s*\|\|\s*docSettings\.templateId,/gi,
  'templateId: docSettings.templateId,'
)

// 6. Ensure `Ciudad` and `Pais` are fully gone from cli-form
// (Wait, they might be in payload parsing as well)
html = html.replace(/city:\s*fd\.get\('city'\)\s*\|\|\s*null,\r?\n/gi, 'city: null,\n')
html = html.replace(/country:\s*fd\.get\('country'\)\s*\|\|\s*null,\r?\n/gi, 'country: null,\n')

fs.writeFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', html, 'utf8')
console.log('Cleaned up completely!')
