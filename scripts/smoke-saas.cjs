const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

const requiredFiles = [
  'preload.js',
  'index.html',
  'insforge-functions/approve-access-request.js',
  'insforge-functions/manage-tenant.js',
  'insforge-functions/manage-tenant-user.js',
  'insforge-functions/admin-reset-user-password.js',
  'insforge-functions/create-invoice-with-stock.js',
  'insforge-functions/update-invoice.js',
  'insforge-functions/delete-invoice.js',
  'insforge-functions/duplicate-invoice.js',
  'insforge-functions/manage-invoice-series.js',
  'insforge-functions/manage-invoice-recurrence.js',
  'insforge-functions/get-super-admin-overview.js',
  'insforge-functions/manage-payments.js'
]

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)))
if (missing.length > 0) {
  console.error('Missing required SaaS files:')
  for (const file of missing) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

const indexContent = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const checks = [
  'insforgeAPI.auth.signInWithPassword',
  "key: 'empresas'",
  "key: 'usuarios'",
  'roleSystemPresetsResolved',
  'create-invoice-with-stock',
  'update-invoice',
  'delete-invoice',
  'duplicate-invoice',
  'manage-invoice-series',
  'manage-invoice-recurrence',
  'manage-payments',
  'renderPagosModule'
]

const failedChecks = checks.filter((check) => !indexContent.includes(check))
if (failedChecks.length > 0) {
  console.error('SaaS smoke checks failed:')
  for (const check of failedChecks) {
    console.error(`- Missing marker: ${check}`)
  }
  process.exit(1)
}

console.log('SaaS smoke checks passed.')
