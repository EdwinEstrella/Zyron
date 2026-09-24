const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const outputDir = path.join(root, '.generated')
const supabaseOutputFile = path.join(outputDir, 'supabase.json')
const legacyOutputFile = path.join(outputDir, 'insforge.json')
const requireConfig = process.argv.includes('--require')

try {
  require('dotenv').config({ path: path.join(root, '.env') })
} catch (_) {
  // dotenv is optional for environments that provide real process env vars.
}

const baseUrl = String(
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_BASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_BASE_URL ||
  process.env.INSFORGE_BASE_URL ||
  process.env.VITE_INSFORGE_BASE_URL ||
  ''
).trim()

const anonKey = String(
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.INSFORGE_ANON_KEY ||
  process.env.VITE_INSFORGE_ANON_KEY ||
  ''
).trim()

const isPlaceholder =
  /tu-proyecto|tu-instancia|your-project/i.test(baseUrl) ||
  /Pega_aqui|reemplaza_con_tu_jwt|tu_jwt_anon|your_anon_key/i.test(anonKey)

if (!baseUrl || !anonKey || isPlaceholder) {
  if (requireConfig) {
    console.error('Missing real Supabase runtime config. Define SUPABASE_URL and SUPABASE_ANON_KEY in .env or the process environment before packaging.')
    process.exit(1)
  }

  console.warn('Skipping Supabase runtime config generation: SUPABASE_URL/SUPABASE_ANON_KEY are not set.')
  process.exit(0)
}

fs.mkdirSync(outputDir, { recursive: true })

const configPayload = {
  baseUrl,
  anonKey,
  supabaseUrl: baseUrl,
  supabaseAnonKey: anonKey
}

const jsonContent = `${JSON.stringify(configPayload, null, 2)}\n`

fs.writeFileSync(supabaseOutputFile, jsonContent, { mode: 0o600 })
fs.writeFileSync(legacyOutputFile, jsonContent, { mode: 0o600 })

console.log(`Generated packaged Supabase runtime config: ${path.relative(root, supabaseOutputFile)}`)
