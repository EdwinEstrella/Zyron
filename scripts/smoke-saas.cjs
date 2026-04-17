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
  'insforge-functions/get-super-admin-overview.js'
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
  'create-invoice-with-stock'
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
