const fs = require('fs')
const html = fs.readFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', 'utf8')

const parseInputs = (str) => {
  const labels =
    str.match(/<label[\s\S]*?<\/label>|<input[^>]+>|<select[^>]+>|<textarea[^>]+>/gi) || []
  return labels.map((l) => {
    if (l.startsWith('<label')) return 'LABEL: ' + l.replace(/<[^>]+>/g, '').trim()
    if (l.startsWith('<input'))
      return (
        'INPUT: ' +
        (l.match(/id="([^"]+)"/)?.[1] ||
          l.match(/name="([^"]+)"/)?.[1] ||
          l.match(/data-fld="([^"]+)"/)?.[1] ||
          'no-id')
      )
    if (l.startsWith('<select'))
      return (
        'SELECT: ' +
        (l.match(/id="([^"]+)"/)?.[1] ||
          l.match(/name="([^"]+)"/)?.[1] ||
          l.match(/data-fld="([^"]+)"/)?.[1] ||
          'no-id')
      )
    if (l.startsWith('<textarea'))
      return (
        'TEXTAREA: ' +
        (l.match(/id="([^"]+)"/)?.[1] ||
          l.match(/name="([^"]+)"/)?.[1] ||
          l.match(/data-fld="([^"]+)"/)?.[1] ||
          'no-id')
      )
  })
}

const extractDiv = (html, idPrefix) => {
  const regex = new RegExp(
    '<div id="' + idPrefix + '"[\\s\\S]*?<\\/div>\\s*<\\/div>\\s*<\\/div>',
    'i'
  )
  const m = html.match(regex)
  return m ? m[0] : ''
}

console.log('Factura sheet:')
console.log(parseInputs(extractDiv(html, 'factura-sheet')))

console.log('Clientes sheet:')
const cliMatch = html.match(/<form id="cli-form"[\s\S]*?<\/form>/i)
if (cliMatch) console.log(parseInputs(cliMatch[0]))

console.log('Presupuestos sheet:')
console.log(parseInputs(extractDiv(html, 'estimate-sheet')))
