const fs = require('fs')
let content = fs.readFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', 'utf8')

// Replace paid_at with payment_date in the columns select for payments
content = content.replace(
  /columns: 'id,amount,currency,payment_method,payment_method_code,paid_at,customer_id,status,reference,notes',/g,
  "columns: 'id,amount,currency,payment_method,payment_method_code,payment_date,customer_id,status,reference,notes',"
)

// Replace ordering column
content = content.replace(
  /order: \{ column: 'paid_at', ascending: false \}/g,
  "order: { column: 'payment_date', ascending: false }"
)

// Replace filter operations
content = content.replace(
  /\{ op: 'gte', column: 'paid_at', value: fromISO \}/g,
  "{ op: 'gte', column: 'payment_date', value: fromISO }"
)
content = content.replace(
  /\{ op: 'lte', column: 'paid_at', value: toISO \}/g,
  "{ op: 'lte', column: 'payment_date', value: toISO }"
)

// Update payload construction for insertions
content = content.replace(
  /paid_at: body\.paidAt \|\| new Date\(\)\.toISOString\(\),/g,
  'payment_date: body.paidAt || new Date().toISOString(),'
)
content = content.replace(
  /paid_at: insertPayment\.paid_at,/g,
  'payment_date: insertPayment.payment_date,'
)

// Update UI display logic
content = content.replace(
  /const d = pay\.paid_at \? new Date\(pay\.paid_at\) : pay\.created_at \? new Date\(pay\.created_at\) : null;/g,
  'const d = pay.payment_date ? new Date(pay.payment_date) : pay.created_at ? new Date(pay.created_at) : null;'
)
content = content.replace(/fecha: p\.paid_at,/g, 'fecha: p.payment_date,')
content = content.replace(
  /<td class=\"py-2 text-xs\">\$\{escapeHtml\(toDateString\(r\.paid_at\)\)\}<\/td>/g,
  '<td class="py-2 text-xs">${escapeHtml(toDateString(r.payment_date))}</td>'
)

fs.writeFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', content, 'utf8')
console.log('Fixed paid_at -> payment_date references in renderer.js')
