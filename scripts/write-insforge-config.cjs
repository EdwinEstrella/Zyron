const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const outputDir = path.join(root, '.generated')
const outputFile = path.join(outputDir, 'insforge.json')
const requireConfig = process.argv.includes('--require')

try {
  require('dotenv').config({ path: path.join(root, '.env') })
} catch (_) {
  // dotenv is optional for environments that provide real process env vars.
}

const baseUrl = String(process.env.INSFORGE_BASE_URL || process.env.VITE_INSFORGE_BASE_URL || '').trim()
const anonKey = String(process.env.INSFORGE_ANON_KEY || process.env.VITE_INSFORGE_ANON_KEY || '').trim()

const isPlaceholder = /tu-proyecto\.insforge\.app|tu-instancia\.insforge\.app/i.test(baseUrl)
  || /Pega_aqui|reemplaza_con_tu_jwt|tu_jwt_anon_de_insforge/i.test(anonKey)

if (!baseUrl || !anonKey || isPlaceholder) {
  if (requireConfig) {
    console.error('Missing real InsForge runtime config. Define INSFORGE_BASE_URL and INSFORGE_ANON_KEY in .env or the process environment before packaging.')
    process.exit(1)
  }

  console.warn('Skipping InsForge runtime config generation: INSFORGE_BASE_URL/INSFORGE_ANON_KEY are not set.')
  process.exit(0)
}

fs.mkdirSync(outputDir, { recursive: true })
fs.writeFileSync(
  outputFile,
  `${JSON.stringify({ baseUrl, anonKey }, null, 2)}\n`,
  { mode: 0o600 }
)

console.log(`Generated packaged InsForge runtime config: ${path.relative(root, outputFile)}`)
