const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function fail(title, items = []) {
  console.error(title)
  for (const item of items) {
    console.error(`- ${item}`)
  }
  process.exit(1)
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), 'utf8')
}

function exists(file) {
  return fs.existsSync(path.join(root, file))
}

function listFunctions() {
  const dir = path.join(root, 'insforge-functions')
  if (!fs.existsSync(dir)) return []

  return fs
    .readdirSync(dir)
    .filter((file) => /\.(js|ts)$/.test(file))
    .sort()
    .map((file) => `insforge-functions/${file}`)
}

const requiredFiles = [
  'preload.js',
  'main.js',
  'index.html',
  'tailwind.config.cjs',
  'styles/tailwind.css',
  'public/tailwind.css',
  'playwright.config.cjs',
  'scripts/write-insforge-config.cjs',
  'insforge-sql/realtime_domain_events_foundation.sql'
]

const requiredFunctions = [
  'insforge-functions/approve-access-request.ts',
  'insforge-functions/create-invoice-with-stock.js',
  'insforge-functions/delete-invoice.js',
  'insforge-functions/duplicate-invoice.js',
  'insforge-functions/update-invoice.js'
]

const missing = [...requiredFiles, ...requiredFunctions].filter((file) => !exists(file))
if (missing.length > 0) {
  fail('Missing required production-readiness files:', missing)
}

const indexContent = readText('index.html')
const mainContent = readText('main.js')
const preloadContent = readText('preload.js')
const realtimeSql = readText('insforge-sql/realtime_domain_events_foundation.sql')
const packageJson = JSON.parse(readText('package.json'))
const forgeConfig = readText('forge.config.js')

const forbiddenIndexMarkers = [
  'cdn.tailwindcss.com',
  'tailwind.config ='
]
const unsafeIndexMarkers = forbiddenIndexMarkers.filter((marker) => indexContent.includes(marker))
if (unsafeIndexMarkers.length > 0) {
  fail('Renderer still contains runtime Tailwind CDN markers:', unsafeIndexMarkers)
}

const requiredIndexMarkers = [
  'public/tailwind.css',
  "script-src 'self'",
  "connect-src 'self'"
]
const missingIndexMarkers = requiredIndexMarkers.filter((marker) => !indexContent.includes(marker))
if (missingIndexMarkers.length > 0) {
  fail('Renderer production readiness markers are missing:', missingIndexMarkers)
}

const requiredAuthRealtimeMarkers = [
  'AUTH_RELOGIN_REQUIRED',
  'validateDbInsertPayload',
  'requestAuthRecovery',
  'realtimeRegistry',
  'tenant:*:domain-events'
]
const missingAuthRealtimeMarkers = requiredAuthRealtimeMarkers.filter((marker) => {
  return !mainContent.includes(marker) && !preloadContent.includes(marker) && !realtimeSql.includes(marker)
})
if (missingAuthRealtimeMarkers.length > 0) {
  fail('Auth/realtime foundation markers are missing:', missingAuthRealtimeMarkers)
}

if (packageJson.devDependencies?.tailwindcss !== '3.4.17') {
  fail('Tailwind must be locked to 3.4.17 in devDependencies.')
}

const buildFiles = packageJson.build?.files ?? []
const forbiddenPackagedFiles = ['.env', '.env.*', '**/.env', '**/.env.*']
const includedSecrets = forbiddenPackagedFiles.filter((entry) => buildFiles.includes(entry))
if (includedSecrets.length > 0) {
  fail('Electron Builder files include secret patterns directly:', includedSecrets)
}

const requiredPackageExclusions = ['!.env', '!.env.*', '!**/.env', '!**/.env.*']
const missingPackageExclusions = requiredPackageExclusions.filter((entry) => !buildFiles.includes(entry))
if (missingPackageExclusions.length > 0) {
  fail('Electron Builder secret exclusions are missing:', missingPackageExclusions)
}

if (!buildFiles.includes('.generated/insforge.json')) {
  fail('Electron Builder must package generated InsForge runtime config, not raw .env.')
}

const extraResources = packageJson.build?.extraResources ?? []
const hasInsforgeRuntimeResource = extraResources.some((resource) => {
  return resource && resource.from === '.generated/insforge.json' && resource.to === 'insforge.json'
})
if (!hasInsforgeRuntimeResource) {
  fail('Electron Builder extraResources must copy .generated/insforge.json to insforge.json.')
}

const requiredForgeMarkers = ['ignore:', '.env', 'credentials', 'secret', 'extraResource', '.generated', 'insforge.json']
const missingForgeMarkers = requiredForgeMarkers.filter((marker) => !forgeConfig.includes(marker))
if (missingForgeMarkers.length > 0) {
  fail('Electron Forge package secret exclusions are missing:', missingForgeMarkers)
}

const functions = listFunctions()
console.log('Production readiness smoke checks passed.')
console.log(`Function inventory: ${functions.join(', ')}`)
