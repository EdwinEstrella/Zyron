const { app, BrowserWindow, ipcMain, nativeImage, dialog } = require('electron/main')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

// Configure logging for auto-updater
log.transports.file.level = 'info'
autoUpdater.logger = log
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

/** Logs detallados de IPC/DB en main (menos overhead). Activar: ZYRON_MAIN_VERBOSE=1 */
const mainVerboseIpc = () => process.env.ZYRON_MAIN_VERBOSE === '1'
const fs = require('node:fs')
const path = require('node:path')

/** Carga `.env` desde dev root y desde ubicaciones runtime del ejecutable empaquetado. */
const loadEnvFromDotEnvFiles = () => {
  try {
    const dotenv = require('dotenv')
    const roots = new Set([process.cwd(), __dirname])
    try {
      roots.add(path.dirname(process.execPath))
    } catch (_) {
      /* process.execPath puede no estar disponible en algunos contextos de test */
    }
    try {
      if (process.resourcesPath) roots.add(process.resourcesPath)
    } catch (_) {
      /* resourcesPath solo existe en Electron empaquetado */
    }
    let d = __dirname
    for (let i = 0; i < 28; i++) {
      roots.add(d)
      const parent = path.dirname(d)
      if (parent === d) break
      d = parent
    }
    for (const root of roots) {
      const envPath = path.join(root, '.env')
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath })
        break
      }
    }
  } catch (_) {
    /* dotenv no instalado o sin .env */
  }
}
loadEnvFromDotEnvFiles()

// Transitive deps still touch Node's deprecated built-in `punycode` (DEP0040); avoid noisy stderr in dev.
const origEmitWarning = process.emitWarning.bind(process)
process.emitWarning = (...args) => {
  for (const a of args) {
    if (a === 'DEP0040') return
    if (typeof a === 'string' && /punycode/i.test(a)) return
    if (a && typeof a === 'object') {
      if (a.code === 'DEP0040') return
      const msg = String(a.message || '')
      if (/punycode/i.test(msg)) return
    }
  }
  return origEmitWarning(...args)
}

let mainWindow = null
let insforgeClientPromise = null
let authRecoveryPromise = null
let realtimeForwardersInstalled = false
let currentRefreshToken = null

const realtimeRegistry = new Map()
const REALTIME_RETRY_BASE_MS = 750
const REALTIME_RETRY_MAX_MS = 45000
const REALTIME_PENDING_EVENT_LIMIT = 50

const AUTH_RELOGIN_REQUIRED = 'AUTH_RELOGIN_REQUIRED'
const AUTH_RECOVERED = 'AUTH_RECOVERED'

/** Depuración Insforge: proceso principal (terminal). El renderer usa DevTools en index.html. */
const zyronLog = (scope, detail) => {
  try {
    const line = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 0)
    const clipped = line.length > 4000 ? `${line.slice(0, 4000)}…` : line
    console.log(`[Zyron:main:${scope}]`, clipped)
  } catch (_) {
    console.log(`[Zyron:main:${scope}]`, detail)
  }
}

const redactPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload
  const out = { ...payload }
  if (out.password) out.password = '***'
  if (out.newPassword) out.newPassword = '***'
  if (out.body && typeof out.body === 'object' && !Array.isArray(out.body)) {
    out.body = { ...out.body }
    if (out.body.password) out.body.password = '***'
    const bk = Object.keys(out.body)
    if (bk.length > 24) out.body = { _keys: bk.length, _note: 'body_truncated_for_log' }
  }
  return out
}

/** Insforge a veces devuelve snake_case; el SDK solo persiste sesion si hay accessToken + user en camelCase. */
const applyAuthSessionFromPayload = (client, raw) => {
  if (!client || !raw || typeof raw !== 'object') return
  const accessToken = raw.accessToken ?? raw.access_token
  const user = raw.user ?? raw.User
  const refreshToken = raw.refreshToken ?? raw.refresh_token
  const csrfToken = raw.csrfToken ?? raw.csrf_token
  if (accessToken && user && typeof client.auth?.saveSessionFromResponse === 'function') {
    client.auth.saveSessionFromResponse({
      accessToken,
      user,
      refreshToken,
      csrfToken
    })
  }
  if (accessToken && user && typeof client.tokenManager?.saveSession === 'function') {
    client.tokenManager.saveSession({ accessToken, user })
  } else {
    if (accessToken && typeof client.tokenManager?.setAccessToken === 'function') client.tokenManager.setAccessToken(accessToken)
    if (user && typeof client.tokenManager?.setUser === 'function') client.tokenManager.setUser(user)
  }
  if (refreshToken) currentRefreshToken = refreshToken
  if (refreshToken && typeof client.getHttpClient === 'function') {
    client.getHttpClient().setRefreshToken(refreshToken)
  }
}

/** @type {{ baseUrl: string, anonKey: string, configPath: string, configSource?: string } | null | undefined} */
let insforgeResolvedConfig = undefined

/** Sube desde `startDir` hasta encontrar `package.json` (raiz del repo con Electron Forge / .vite/build). */
const findProjectRootByPackageJson = (startDir) => {
  let dir = path.resolve(startDir)
  for (let i = 0; i < 28; i++) {
    const pkg = path.join(dir, 'package.json')
    if (fs.existsSync(pkg)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

const isInsforgePlaceholder = (baseUrl, anonKey) => {
  if (!baseUrl || !anonKey) return true
  if (/tu-instancia\.insforge\.app/i.test(baseUrl)) return true
  if (/Pega_aqui|reemplaza_con_tu_jwt/i.test(anonKey)) return true
  return false
}

const readInsforgeFromEnv = () => {
  const baseUrl = String(
    process.env.INSFORGE_BASE_URL || process.env.VITE_INSFORGE_BASE_URL || ''
  ).trim()
  const anonKey = String(process.env.INSFORGE_ANON_KEY || process.env.VITE_INSFORGE_ANON_KEY || '').trim()
  if (isInsforgePlaceholder(baseUrl, anonKey)) return null
  if (!baseUrl || !anonKey) return null
  return {
    baseUrl,
    anonKey,
    configPath: '(environment)',
    configSource: 'environment'
  }
}

const readInsforgeJsonFile = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf8')
    const j = JSON.parse(raw)
    const baseUrl = typeof j.baseUrl === 'string' ? j.baseUrl.trim() : ''
    const anonKey =
      typeof j.anonKey === 'string'
        ? j.anonKey.trim()
        : typeof j.anon_key === 'string'
          ? j.anon_key.trim()
          : ''
    if (isInsforgePlaceholder(baseUrl, anonKey)) {
      zyronLog('insforge:config:placeholder', {
        filePath,
        hint: 'Edita baseUrl y anonKey con los valores reales de tu proyecto Insforge.'
      })
      return null
    }
    if (!baseUrl || !anonKey) return null
    return { baseUrl, anonKey, configPath: filePath, configSource: 'file' }
  } catch (e) {
    zyronLog('insforge:config:readError', { filePath, message: e?.message || String(e) })
    return null
  }
}

const resolveInsforgeConfig = () => {
  if (insforgeResolvedConfig !== undefined) return insforgeResolvedConfig

  const seen = new Set()
  const candidates = []
  const push = (p) => {
    if (!p || typeof p !== 'string') return
    const norm = path.normalize(p)
    if (seen.has(norm)) return
    seen.add(norm)
    candidates.push(norm)
  }

  // Raiz del repo: subiendo desde __dirname (p. ej. .vite/build) hasta package.json — mas fiable que cwd.
  const pkgRootFromMain = findProjectRootByPackageJson(__dirname)
  if (pkgRootFromMain) push(path.join(pkgRootFromMain, 'insforge.local.json'))

  push(path.join(process.cwd(), 'insforge.local.json'))
  push(path.join(__dirname, 'insforge.local.json'))
  try {
    push(path.join(app.getAppPath(), 'insforge.local.json'))
    const pkgFromApp = findProjectRootByPackageJson(app.getAppPath())
    if (pkgFromApp && pkgFromApp !== pkgRootFromMain) {
      push(path.join(pkgFromApp, 'insforge.local.json'))
    }
  } catch (_) {
    /* getAppPath antes de ready */
  }

  try {
    push(path.join(app.getPath('userData'), 'insforge.json'))
  } catch (_) {
    /* app.getPath puede fallar antes de ready */
  }
  try {
    push(path.join(path.dirname(process.execPath), 'insforge.json'))
  } catch (_) {
    /* ignore */
  }
  try {
    if (app.isPackaged && process.resourcesPath) {
      push(path.join(process.resourcesPath, 'insforge.json'))
    }
  } catch (_) {
    /* ignore */
  }

  for (const p of candidates) {
    const hit = readInsforgeJsonFile(p)
    if (hit) {
      insforgeResolvedConfig = hit
      zyronLog('insforge:config:loaded', { configPath: hit.configPath, source: hit.configSource || 'file' })
      return hit
    }
  }

  const fromEnv = readInsforgeFromEnv()
  if (fromEnv) {
    insforgeResolvedConfig = fromEnv
    zyronLog('insforge:config:loaded', { source: 'environment' })
    return fromEnv
  }

  insforgeResolvedConfig = null
  zyronLog('insforge:config:missing', {
    hint: 'Archivos JSON (insforge.local.json / insforge.json) o variables INSFORGE_BASE_URL e INSFORGE_ANON_KEY (.env opcional). Ver .env.example.',
    tried: candidates
  })
  return null
}

const serializeError = (error, fallbackCode = 'UNKNOWN_ERROR', extra = {}) => {
  if (!error) return null
  if (typeof error === 'string') return { code: fallbackCode, message: error, ...extra }
  const status = error.statusCode ?? error.status ?? error.codeStatus ?? null
  const rawCode = error.code ?? error.error ?? error.name ?? fallbackCode
  const code = String(rawCode || fallbackCode)
  const message = String(error.message || error.error_description || error.details || error.hint || 'Unexpected error')
  const details = error.details ?? error.nextActions ?? error.hint ?? null
  return {
    code,
    message,
    status,
    details,
    reauthRequired: Boolean(extra.reauthRequired),
    recoverable: extra.recoverable !== false,
    ...extra
  }
}

const normalizeResult = (result, error = null) => {
  if (error) return { data: null, error: serializeError(error) }
  if (result && typeof result === 'object' && 'data' in result && 'error' in result) {
    return { data: result.data ?? null, error: result.error ? serializeError(result.error) : null }
  }
  return { data: result ?? null, error: null }
}

const validationError = (message, details = null) => ({
  data: null,
  error: serializeError({ message, code: 'IPC_INVALID_PAYLOAD', details }, 'IPC_INVALID_PAYLOAD', {
    recoverable: false
  })
})

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0
const isOptionalPlainObject = (value) => value == null || isPlainObject(value)

const VALID_FILTER_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'like', 'ilike', 'is'])
const VALID_FUNCTION_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const SAFE_CHANNEL_RE = /^(tenant:[A-Za-z0-9_-]+:(alerts|domain-events)|super-admin:alerts)$/
const SAFE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const validateEmailPassword = (payload) => {
  if (!isPlainObject(payload)) return validationError('Payload de autenticacion invalido.')
  if (!isNonEmptyString(payload.email) || !isNonEmptyString(payload.password)) {
    return validationError('Correo y contraseña son requeridos.')
  }
  return null
}

const validateAuthProfile = (profile) => {
  if (!isPlainObject(profile)) return validationError('Perfil invalido.')
  return null
}

const validateUserId = (userId) => {
  if (!isNonEmptyString(userId)) return validationError('userId requerido.')
  return null
}

const validateFilters = (filters) => {
  if (filters == null) return null
  if (!Array.isArray(filters)) return 'filters debe ser un arreglo.'
  for (const filter of filters) {
    if (!isPlainObject(filter)) return 'Cada filter debe ser un objeto.'
    if (!isNonEmptyString(filter.column)) return 'Cada filter requiere column.'
    if (!VALID_FILTER_OPS.has(filter.op)) return `Operador de filtro no permitido: ${filter.op}`
  }
  return null
}

const validateDbReadPayload = (payload) => {
  if (!isPlainObject(payload)) return validationError('Payload de lectura invalido.')
  if (!isNonEmptyString(payload.table)) return validationError('table requerido.')
  if (payload.columns != null && typeof payload.columns !== 'string') return validationError('columns debe ser string.')
  const filterError = validateFilters(payload.filters)
  if (filterError) return validationError(filterError)
  if (payload.order != null && (!isPlainObject(payload.order) || !isNonEmptyString(payload.order.column))) {
    return validationError('order.column requerido cuando order existe.')
  }
  if (payload.range != null && (!Array.isArray(payload.range) || payload.range.length !== 2 || payload.range.some((v) => !Number.isInteger(v)))) {
    return validationError('range debe ser [from, to] con enteros.')
  }
  if (payload.limit != null && (!Number.isInteger(payload.limit) || payload.limit < 0 || payload.limit > 10000)) {
    return validationError('limit debe ser un entero entre 0 y 10000.')
  }
  return null
}

const validateDbInsertPayload = (payload) => {
  if (!isPlainObject(payload)) return validationError('Payload de insercion invalido.')
  if (!isNonEmptyString(payload.table)) return validationError('table requerido.')
  if (!Array.isArray(payload.values)) return validationError('values debe ser un arreglo para insert.')
  if (!payload.values.every(isPlainObject)) return validationError('Cada values[] debe ser un objeto.')
  if (payload.selectColumns != null && typeof payload.selectColumns !== 'string') return validationError('selectColumns debe ser string.')
  return null
}

const validateDbMutatePayload = (payload) => {
  if (!isPlainObject(payload)) return validationError('Payload de mutacion invalido.')
  if (!isNonEmptyString(payload.table)) return validationError('table requerido.')
  if (payload.values != null && !isPlainObject(payload.values)) return validationError('values debe ser un objeto.')
  const filterError = validateFilters(payload.filters)
  if (filterError) return validationError(filterError)
  if (payload.selectColumns != null && typeof payload.selectColumns !== 'string') return validationError('selectColumns debe ser string.')
  return null
}

const validateRpcPayload = (payload) => {
  if (!isPlainObject(payload)) return validationError('Payload RPC invalido.')
  if (!isNonEmptyString(payload.functionName)) return validationError('functionName requerido.')
  if (!isOptionalPlainObject(payload.args)) return validationError('args debe ser un objeto.')
  return null
}

const validateFunctionInvokePayload = (payload) => {
  if (!isPlainObject(payload)) return validationError('Payload de funcion invalido.')
  if (!isNonEmptyString(payload.slug)) return validationError('slug requerido.')
  if (payload.slug.includes('/') || payload.slug.includes('..')) return validationError('slug no debe contener subrutas.')
  const method = String(payload.method || 'POST').toUpperCase()
  if (!VALID_FUNCTION_METHODS.has(method)) return validationError('Metodo HTTP no permitido.')
  if (!isOptionalPlainObject(payload.headers)) return validationError('headers debe ser un objeto.')
  return null
}

const validateAccountingListPayload = (payload, options = {}) => {
  if (!isPlainObject(payload)) return validationError('Payload contable invalido.')
  if (!SAFE_UUID_RE.test(String(payload.tenantId || '').trim())) return validationError('tenantId contable invalido.')
  if (options.requiresJournalEntryId && !SAFE_UUID_RE.test(String(payload.journalEntryId || '').trim())) {
    return validationError('journalEntryId contable invalido.')
  }
  if (payload.limit != null && (!Number.isInteger(payload.limit) || payload.limit < 1 || payload.limit > 500)) {
    return validationError('limit contable debe ser un entero entre 1 y 500.')
  }
  return null
}

const selectAccountingRows = async (scope, table, payload, configureQuery) => {
  const { tenantId, limit = 100 } = payload || {}
  return runInsforgeOperation(scope, async (client) => {
    let query = client.database
      .from(table)
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(limit)
    query = configureQuery ? configureQuery(query) : query
    return query
  })
}

const validateChannel = (channel) => {
  if (!isNonEmptyString(channel)) return validationError('channel requerido.')
  if (!SAFE_CHANNEL_RE.test(channel.trim())) return validationError('Canal realtime no permitido.', { channel })
  return null
}

const validatePublishPayload = (payload) => {
  if (!isPlainObject(payload)) return validationError('Payload realtime invalido.')
  const channelError = validateChannel(payload.channel)
  if (channelError) return channelError
  if (!isNonEmptyString(payload.event)) return validationError('event requerido.')
  return null
}

const isAuthError = (error) => {
  if (!error) return false
  const text = `${error.code || ''} ${error.error || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase()
  return error.status === 401 || error.statusCode === 401 || text.includes('auth_unauthorized') || text.includes('invalid token') || text.includes('jwt')
}

const notifyRenderer = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

const requestAuthRecovery = async (client, reason) => {
  if (authRecoveryPromise) return authRecoveryPromise
  authRecoveryPromise = (async () => {
    try {
      zyronLog('auth:recovery:start', { reason })
      if (typeof client.auth?.refreshSession !== 'function') throw new Error('refreshSession no disponible')
      const result = await client.auth.refreshSession(currentRefreshToken ? { refreshToken: currentRefreshToken } : undefined)
      if (result?.error) throw result.error
      if (result?.data) applyAuthSessionFromPayload(client, result.data)
      notifyRenderer('auth-session-recovered', { code: AUTH_RECOVERED })
      zyronLog('auth:recovery:ok', { hasUser: Boolean(result?.data?.user) })
      return { ok: true }
    } catch (error) {
      zyronLog('auth:recovery:failed', serializeError(error, AUTH_RELOGIN_REQUIRED))
      try { client.auth?.signOut?.() } catch (_) {}
      currentRefreshToken = null
      notifyRenderer('auth-session-expired', {
        code: AUTH_RELOGIN_REQUIRED,
        message: 'Tu sesion expiro. Vuelve a iniciar sesion para continuar.'
      })
      return { ok: false, error }
    } finally {
      authRecoveryPromise = null
    }
  })()
  return authRecoveryPromise
}

const runInsforgeOperation = async (scope, operation, options = {}) => {
  try {
    const client = await getInsforgeClient()
    let result = await operation(client)
    if (!options.skipAuthRecovery && isAuthError(result?.error)) {
      const recovered = await requestAuthRecovery(client, scope)
      if (recovered.ok) result = await operation(client)
      else {
        return {
          data: null,
          error: serializeError(recovered.error, AUTH_RELOGIN_REQUIRED, {
            code: AUTH_RELOGIN_REQUIRED,
            reauthRequired: true,
            recoverable: false
          })
        }
      }
    }
    return normalizeResult(result)
  } catch (error) {
    if (!options.skipAuthRecovery && isAuthError(error)) {
      const client = await getInsforgeClient()
      const recovered = await requestAuthRecovery(client, scope)
      if (recovered.ok) {
        try {
          return normalizeResult(await operation(client))
        } catch (retryError) {
          return normalizeResult(null, retryError)
        }
      }
      return {
        data: null,
        error: serializeError(recovered.error, AUTH_RELOGIN_REQUIRED, {
          code: AUTH_RELOGIN_REQUIRED,
          reauthRequired: true,
          recoverable: false
        })
      }
    }
    zyronLog(`${scope}:exception`, { message: error?.message || String(error) })
    return normalizeResult(null, error)
  }
}

const getInsforgeClient = async () => {
  if (process.env.ZYRON_MAIN_TEST_HOOKS === '1' && global.__ZYRON_TEST_INSFORGE_CLIENT) {
    const client = global.__ZYRON_TEST_INSFORGE_CLIENT
    installRealtimeForwarders(client)
    return client
  }
  if (insforgeClientPromise) return insforgeClientPromise
  const attempt = (async () => {
    const cfg = resolveInsforgeConfig()
    if (!cfg?.baseUrl || !cfg?.anonKey) {
      const msg =
        'Insforge no esta configurado: usa insforge.local.json / insforge.json con valores reales, o define INSFORGE_BASE_URL e INSFORGE_ANON_KEY (p. ej. en .env — ver .env.example). Sin plantillas de ejemplo.'
      zyronLog('insforge:client:abort', { msg })
      throw new Error(msg)
    }
    const { createClient } = await import('@insforge/sdk')
    const client = createClient({
      baseUrl: cfg.baseUrl,
      anonKey: cfg.anonKey,
      isServerMode: true,
      autoRefreshToken: true
    })
    installRealtimeForwarders(client)
    return client
  })()
  insforgeClientPromise = attempt.catch((err) => {
    insforgeClientPromise = null
    throw err
  })
  return insforgeClientPromise
}

const getRealtimeEntry = (channel) => {
  const key = String(channel || '').trim()
  if (!realtimeRegistry.has(key)) {
    realtimeRegistry.set(key, {
      channel: key,
      status: 'idle',
      attempts: 0,
      degraded: false,
      lastError: null,
      timer: null,
      nextRetryAt: null,
      retryDelayMs: null,
      pendingEvents: []
    })
  }
  return realtimeRegistry.get(key)
}

const realtimeSnapshot = () => [...realtimeRegistry.values()].map((entry) => ({
  channel: entry.channel,
  status: entry.status,
  attempts: entry.attempts,
  degraded: entry.degraded,
  lastError: entry.lastError,
  nextRetryAt: entry.nextRetryAt,
  retryDelayMs: entry.retryDelayMs,
  queuedEvents: entry.pendingEvents.length
}))

const publishRealtimeStatus = () => notifyRenderer('realtime-status-changed', { channels: realtimeSnapshot() })

const scheduleRealtimeRetry = (client, entry) => {
  if (!entry || entry.timer || entry.status !== 'degraded') return
  const exponential = REALTIME_RETRY_BASE_MS * 2 ** Math.min(entry.attempts, 6)
  const jitter = Math.floor(Math.random() * Math.min(1000, exponential * 0.2))
  const delay = Math.min(REALTIME_RETRY_MAX_MS, exponential + jitter)
  entry.retryDelayMs = delay
  entry.nextRetryAt = new Date(Date.now() + delay).toISOString()
  entry.timer = setTimeout(async () => {
    entry.timer = null
    entry.nextRetryAt = null
    entry.retryDelayMs = null
    await subscribeRealtimeChannel(client, entry.channel, { isRetry: true })
  }, delay)
  if (typeof entry.timer.unref === 'function') entry.timer.unref()
  publishRealtimeStatus()
}

const queueRealtimeEvent = (entry, event, payload) => {
  if (entry.pendingEvents.length >= REALTIME_PENDING_EVENT_LIMIT) entry.pendingEvents.shift()
  entry.pendingEvents.push({ event, payload, queuedAt: new Date().toISOString() })
}

const flushRealtimeQueue = async (client, entry) => {
  if (!entry.pendingEvents.length) return { flushed: 0, remaining: 0 }
  const pending = entry.pendingEvents.splice(0)
  let flushed = 0
  for (const item of pending) {
    try {
      await client.realtime.publish(entry.channel, item.event, item.payload)
      flushed += 1
    } catch (error) {
      queueRealtimeEvent(entry, item.event, item.payload)
      entry.lastError = serializeError(error, 'REALTIME_QUEUE_FLUSH_FAILED', { realtimeDegraded: true })
      break
    }
  }
  return { flushed, remaining: entry.pendingEvents.length }
}

const subscribeRealtimeChannel = async (client, channel, options = {}) => {
  const entry = getRealtimeEntry(channel)
  entry.status = options.isRetry ? 'retrying' : 'subscribing'
  entry.degraded = false
  publishRealtimeStatus()
  try {
    await client.realtime.connect()
    const result = await client.realtime.subscribe(channel)
    const ok = result == null || result.ok !== false
    if (!ok) throw result.error || new Error('Realtime subscription rejected')
    entry.status = 'subscribed'
    entry.degraded = false
    entry.lastError = null
    entry.attempts = 0
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    entry.nextRetryAt = null
    entry.retryDelayMs = null
    const queue = await flushRealtimeQueue(client, entry)
    publishRealtimeStatus()
    return { data: { ok: true, channel, queue, registry: realtimeSnapshot() }, error: null }
  } catch (error) {
    entry.status = 'degraded'
    entry.degraded = true
    entry.attempts += 1
    entry.lastError = serializeError(error, 'REALTIME_DEGRADED', { realtimeDegraded: true })
    publishRealtimeStatus()
    scheduleRealtimeRetry(client, entry)
    return { data: { ok: false, channel, degraded: true, registry: realtimeSnapshot() }, error: entry.lastError }
  }
}

const retryRealtimeChannel = async (client, channel) => {
  const entry = getRealtimeEntry(channel)
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  entry.nextRetryAt = null
  entry.retryDelayMs = null
  return subscribeRealtimeChannel(client, channel, { isRetry: true, isManual: true })
}

const publishRealtimeEvent = async (client, payload) => {
  const { channel, event, body, payload: eventPayload } = payload || {}
  const entry = getRealtimeEntry(channel)
  const eventBody = body ?? eventPayload
  if (entry.degraded || entry.status !== 'subscribed') {
    queueRealtimeEvent(entry, event, eventBody)
    publishRealtimeStatus()
    return { data: { ok: true, queued: true, channel, queuedEvents: entry.pendingEvents.length, registry: realtimeSnapshot() }, error: null }
  }
  try {
    const result = await client.realtime.publish(channel, event, eventBody)
    return { data: result || { ok: true }, error: null }
  } catch (error) {
    queueRealtimeEvent(entry, event, eventBody)
    entry.status = 'degraded'
    entry.degraded = true
    entry.attempts += 1
    entry.lastError = serializeError(error, 'REALTIME_PUBLISH_DEGRADED', { realtimeDegraded: true })
    publishRealtimeStatus()
    scheduleRealtimeRetry(client, entry)
    return { data: { ok: true, queued: true, channel, queuedEvents: entry.pendingEvents.length, registry: realtimeSnapshot() }, error: null }
  }
}

const unsubscribeRealtimeChannel = async (client, channel) => {
  const entry = getRealtimeEntry(channel)
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  try {
    client.realtime.unsubscribe(channel)
  } catch (error) {
    entry.lastError = serializeError(error)
  }
  realtimeRegistry.delete(channel)
  publishRealtimeStatus()
  return { data: { ok: true, channel, registry: realtimeSnapshot() }, error: null }
}

function installRealtimeForwarders (client) {
  if (realtimeForwardersInstalled || !client?.realtime?.on) return
  realtimeForwardersInstalled = true
  const forward = (type) => (payload) => {
    notifyRenderer('domain-event', { type, payload, occurredAt: new Date().toISOString() })
  }
  client.realtime.on('domain_event', forward('domain_event'))
  client.realtime.on('domain-event', forward('domain-event'))
  client.realtime.on('connect_error', (error) => {
    notifyRenderer('realtime-status-changed', { error: serializeError(error), channels: realtimeSnapshot() })
  })
  client.realtime.on('disconnect', (reason) => {
    notifyRenderer('realtime-status-changed', { disconnected: reason, channels: realtimeSnapshot() })
  })
}

const applyFilters = (query, filters = []) => {
  let nextQuery = query
  for (const filter of filters) {
    if (!filter || !filter.op || !filter.column) continue
    switch (filter.op) {
      case 'eq':
        nextQuery = nextQuery.eq(filter.column, filter.value)
        break
      case 'neq':
        nextQuery = nextQuery.neq(filter.column, filter.value)
        break
      case 'gt':
        nextQuery = nextQuery.gt(filter.column, filter.value)
        break
      case 'gte':
        nextQuery = nextQuery.gte(filter.column, filter.value)
        break
      case 'lt':
        nextQuery = nextQuery.lt(filter.column, filter.value)
        break
      case 'lte':
        nextQuery = nextQuery.lte(filter.column, filter.value)
        break
      case 'in':
        nextQuery = nextQuery.in(filter.column, Array.isArray(filter.value) ? filter.value : [])
        break
      case 'like':
        nextQuery = nextQuery.like(filter.column, filter.value)
        break
      case 'ilike':
        nextQuery = nextQuery.ilike(filter.column, filter.value)
        break
      case 'is':
        nextQuery = nextQuery.is(filter.column, filter.value)
        break
      default:
        break
    }
  }
  return nextQuery
}

function resolveWindowIcon () {
  const pngPath = path.join(__dirname, 'logo.png')
  const icoPath = path.join(__dirname, 'logo.ico')

  try {
    if (fs.existsSync(pngPath)) {
      const image = nativeImage.createFromPath(pngPath)
      if (!image.isEmpty()) return image
    }
  } catch (_) {}

  try {
    if (fs.existsSync(icoPath)) {
      const image = nativeImage.createFromPath(icoPath)
      if (!image.isEmpty()) return image
    }
  } catch (_) {}

  return undefined
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize()
      mainWindow.show()
    }
  })

  mainWindow.webContents.once('did-fail-load', (_e, code, desc) => {
    zyronLog('window:did-fail-load', { code, desc })
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
  })

  mainWindow.loadFile('index.html')

  // Notify renderer when window is maximized/unmaximized
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false)
  })
}

// Window controls handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close()
})

const sanitizePreviewTitle = (title) => {
  const value = typeof title === 'string' ? title : 'Vista previa'
  return value.replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Vista previa'
}

ipcMain.handle('desktop:open-html-preview', async (_event, payload = {}) => {
  try {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload invalido')
    const html = typeof payload.html === 'string' ? payload.html : ''
    if (!html.trim()) throw new Error('HTML requerido para vista previa')
    const title = sanitizePreviewTitle(payload.title)
    const autoPrint = typeof payload.autoPrint === 'boolean' ? payload.autoPrint : false

    const previewWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 640,
      minHeight: 480,
      title,
      parent: mainWindow || undefined,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    previewWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    if (autoPrint && !previewWindow.isDestroyed()) {
      previewWindow.webContents.print({ printBackground: true })
    }
    return { data: { ok: true }, error: null }
  } catch (error) {
    zyronLog('desktop:openHtmlPreview:error', { message: error?.message || String(error) })
    return normalizeResult(null, error)
  }
})

ipcMain.handle('desktop:save-pdf-from-html', async (_event, payload = {}) => {
  let pdfWindow = null
  try {
    const html = typeof payload.html === 'string' ? payload.html : ''
    if (!html.trim()) throw new Error('HTML requerido para exportar PDF')
    const safeName = String(payload.filename || 'documento.pdf')
      .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
      .replace(/\.html?$/i, '.pdf')
      .replace(/\.pdf$/i, '') + '.pdf'
    const defaultPath = path.join(app.getPath('desktop'), safeName)
    const target = await dialog.showSaveDialog(mainWindow || undefined, {
      title: 'Guardar PDF',
      defaultPath,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (target.canceled || !target.filePath) return { data: { ok: false, canceled: true }, error: null }
    pdfWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    pdfWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' }
    })
    await fs.promises.writeFile(target.filePath, pdf)
    return { data: { ok: true, path: target.filePath }, error: null }
  } catch (error) {
    zyronLog('desktop:savePdf:error', { message: error?.message || String(error) })
    return normalizeResult(null, error)
  } finally {
    if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.destroy()
  }
})

ipcMain.handle('insforge:config', async () => {
  const cfg = resolveInsforgeConfig()
  return {
    baseUrl: cfg?.baseUrl ?? null,
    hasAnonKey: Boolean(cfg?.anonKey),
    configured: Boolean(cfg?.baseUrl && cfg?.anonKey),
    configPath: cfg?.configPath ?? null,
    fromEnvironment: cfg?.configSource === 'environment'
  }
})

ipcMain.handle('insforge:auth:signUp', async (_event, payload) => {
  const invalid = validateEmailPassword(payload)
  if (invalid) return invalid
  return runInsforgeOperation('auth:signUp', async (client) => {
    if (mainVerboseIpc()) zyronLog('auth:signUp', { email: payload.email, hasPassword: Boolean(payload.password) })
    const result = await client.auth.signUp(payload)
    if (!result?.error && result?.data) applyAuthSessionFromPayload(client, result.data)
    if (result?.error) zyronLog('auth:signUp:error', result.error)
    else if (mainVerboseIpc()) zyronLog('auth:signUp:ok', { userId: result?.data?.user?.id, email: result?.data?.user?.email })
    return result
  }, { skipAuthRecovery: true })
})

ipcMain.handle('insforge:auth:signInWithPassword', async (_event, payload) => {
  const invalid = validateEmailPassword(payload)
  if (invalid) return invalid
  return runInsforgeOperation('auth:signIn', async (client) => {
    if (mainVerboseIpc()) zyronLog('auth:signIn', { email: payload.email })
    const result = await client.auth.signInWithPassword(payload)
    if (!result?.error && result?.data) applyAuthSessionFromPayload(client, result.data)
    if (result?.error) zyronLog('auth:signIn:error', result.error)
    else if (mainVerboseIpc()) zyronLog('auth:signIn:ok', { userId: result?.data?.user?.id })
    return result
  }, { skipAuthRecovery: true })
})

ipcMain.handle('insforge:auth:signOut', async () => {
  return runInsforgeOperation('auth:signOut', async (client) => {
    const result = await client.auth.signOut()
    return result || { ok: true }
  }, { skipAuthRecovery: true })
})

ipcMain.handle('insforge:auth:getCurrentUser', async () => {
  return runInsforgeOperation('auth:getCurrentUser', (client) => client.auth.getCurrentUser())
})

ipcMain.handle('insforge:auth:getProfile', async (_event, userId) => {
  const invalid = validateUserId(userId)
  if (invalid) return invalid
  return runInsforgeOperation('auth:getProfile', (client) => client.auth.getProfile(userId))
})

ipcMain.handle('insforge:auth:setProfile', async (_event, profile) => {
  const invalid = validateAuthProfile(profile)
  if (invalid) return invalid
  return runInsforgeOperation('auth:setProfile', (client) => client.auth.setProfile(profile))
})

ipcMain.handle('insforge:auth:sendResetPasswordEmail', async (_event, payload) => {
  if (!isPlainObject(payload) || !isNonEmptyString(payload.email)) return validationError('email requerido.')
  return runInsforgeOperation('auth:sendResetPasswordEmail', (client) => client.auth.sendResetPasswordEmail(payload), { skipAuthRecovery: true })
})

ipcMain.handle('insforge:auth:exchangeResetPasswordToken', async (_event, payload) => {
  if (!isPlainObject(payload)) return validationError('Payload de token invalido.')
  return runInsforgeOperation('auth:exchangeResetPasswordToken', (client) => client.auth.exchangeResetPasswordToken(payload), { skipAuthRecovery: true })
})

ipcMain.handle('insforge:auth:resetPassword', async (_event, payload) => {
  if (!isPlainObject(payload) || !isNonEmptyString(payload.newPassword) || !isNonEmptyString(payload.otp)) {
    return validationError('newPassword y otp son requeridos.')
  }
  return runInsforgeOperation('auth:resetPassword', (client) => client.auth.resetPassword(payload), { skipAuthRecovery: true })
})

ipcMain.handle('insforge:db:select', async (_event, payload) => {
  const invalid = validateDbReadPayload(payload)
  if (invalid) return invalid
  return runInsforgeOperation('db:select', async (client) => {
    const {
      table,
      columns = '*',
      filters = [],
      order,
      range,
      limit,
      single = false,
      maybeSingle = false,
      count
    } = payload || {}
    if (mainVerboseIpc()) zyronLog('db:select:req', { table, filters: filters.length, limit, single })
    let query = client.database.from(table).select(columns, count ? { count } : undefined)
    query = applyFilters(query, filters)
    if (order && order.column) {
      query = query.order(order.column, { ascending: order.ascending !== false })
    }
    if (Array.isArray(range) && range.length === 2) {
      query = query.range(range[0], range[1])
    }
    if (typeof limit === 'number') {
      query = query.limit(limit)
    }
    if (single) query = query.single()
    else if (maybeSingle) query = query.maybeSingle()
    const result = await query
    if (result?.error) zyronLog('db:select:err', { table, error: result.error })
    else if (mainVerboseIpc()) {
      const n = Array.isArray(result?.data) ? result.data.length : result?.data ? 1 : 0
      zyronLog('db:select:ok', { table, rows: n })
    }
    return result
  })
})

ipcMain.handle('insforge:db:insert', async (_event, payload) => {
  const invalid = validateDbInsertPayload(payload)
  if (invalid) return invalid
  return runInsforgeOperation('db:insert', async (client) => {
    const { table, values, selectColumns = '*' } = payload || {}
    const nIns = Array.isArray(values) ? values.length : 1
    let preview = values
    if (mainVerboseIpc() && Array.isArray(values) && values.length) {
      const cap = Math.min(3, values.length)
      preview = values.slice(0, cap).map((row) => {
        const r = { ...row }
        if (r.password) r.password = '***'
        return r
      })
      if (values.length > cap) preview = { sample: preview, total: values.length }
    }
    if (mainVerboseIpc()) zyronLog('db:insert', { table, rows: nIns, preview })
    const result = await client.database.from(table).insert(values).select(selectColumns)
    if (result?.error) zyronLog('db:insert:error', { table, error: result.error })
    else if (mainVerboseIpc()) {
      zyronLog('db:insert:ok', { table, returned: Array.isArray(result?.data) ? result.data.length : Boolean(result?.data) })
    }
    return result
  })
})

ipcMain.handle('insforge:db:update', async (_event, payload) => {
  const invalid = validateDbMutatePayload(payload)
  if (invalid) return invalid
  return runInsforgeOperation('db:update', async (client) => {
    const { table, values, filters = [], selectColumns = '*' } = payload || {}
    if (mainVerboseIpc()) zyronLog('db:update:req', { table, filters: filters.length, valueKeys: values ? Object.keys(values) : [] })
    let query = client.database.from(table).update(values)
    query = applyFilters(query, filters)
    const result = await query.select(selectColumns)
    if (result?.error) zyronLog('db:update:err', { table, error: result.error })
    else if (mainVerboseIpc()) zyronLog('db:update:ok', { table })
    return result
  })
})

ipcMain.handle('insforge:db:delete', async (_event, payload) => {
  const invalid = validateDbMutatePayload(payload)
  if (invalid) return invalid
  return runInsforgeOperation('db:delete', async (client) => {
    const { table, filters = [] } = payload || {}
    if (mainVerboseIpc()) zyronLog('db:delete:req', { table, filters: filters.length })
    let query = client.database.from(table).delete()
    query = applyFilters(query, filters)
    const result = await query
    if (result?.error) zyronLog('db:delete:err', { table, error: result.error })
    else if (mainVerboseIpc()) zyronLog('db:delete:ok', { table })
    return result
  })
})

ipcMain.handle('insforge:db:rpc', async (_event, payload) => {
  const invalid = validateRpcPayload(payload)
  if (invalid) return invalid
  return runInsforgeOperation('db:rpc', async (client) => {
    const { functionName, args = {} } = payload || {}
    if (mainVerboseIpc()) zyronLog('db:rpc', { functionName, argsKeys: args && typeof args === 'object' ? Object.keys(args) : [] })
    const result = await client.database.rpc(functionName, args)
    if (result?.error) zyronLog('db:rpc:error', { functionName, error: result.error })
    else if (mainVerboseIpc()) zyronLog('db:rpc:ok', { functionName, hasData: result?.data != null })
    return result
  })
})

ipcMain.handle('accounting:accounts:list', async (_event, payload) => {
  const invalid = validateAccountingListPayload(payload)
  if (invalid) return invalid
  return selectAccountingRows('accounting:accounts:list', 'accounting_accounts', payload, (query) => query.order('code', { ascending: true }))
})

ipcMain.handle('accounting:journal-entries:list', async (_event, payload) => {
  const invalid = validateAccountingListPayload(payload)
  if (invalid) return invalid
  return selectAccountingRows('accounting:journal-entries:list', 'accounting_journal_entries', payload, (query) => {
    return query.order('entry_date', { ascending: false }).order('created_at', { ascending: false })
  })
})

ipcMain.handle('accounting:journal-lines:list', async (_event, payload) => {
  const invalid = validateAccountingListPayload(payload, { requiresJournalEntryId: true })
  if (invalid) return invalid
  return selectAccountingRows('accounting:journal-lines:list', 'accounting_journal_lines', payload, (query) => {
    return query.eq('journal_entry_id', payload.journalEntryId).order('line_no', { ascending: true })
  })
})

ipcMain.handle('insforge:functions:invoke', async (_event, payload) => {
  const invalid = validateFunctionInvokePayload(payload)
  if (invalid) return invalid
  return runInsforgeOperation('fn:invoke', async (client) => {
    const { slug, body, headers, method } = payload || {}
    if (mainVerboseIpc()) zyronLog('fn:invoke', { slug, method: method || 'POST', body: redactPayload(body) })
    const result = await client.functions.invoke(slug, { body, headers, method })
    if (result?.error) zyronLog('fn:invoke:error', { slug, error: result.error })
    else if (mainVerboseIpc()) {
      const d = result?.data
      const summary =
        d && typeof d === 'object' && !Array.isArray(d)
          ? { keys: Object.keys(d).slice(0, 12) }
          : { type: typeof d }
      zyronLog('fn:invoke:ok', { slug, ...summary })
    }
    return result
  })
})

ipcMain.handle('insforge:realtime:connect', async () => {
  return runInsforgeOperation('realtime:connect', async (client) => {
    const result = await client.realtime.connect()
    return result || { ok: true }
  })
})

ipcMain.handle('insforge:realtime:subscribe', async (_event, channel) => {
  const invalid = validateChannel(channel)
  if (invalid) return invalid
  return runInsforgeOperation('realtime:subscribe', (client) => subscribeRealtimeChannel(client, channel))
})

ipcMain.handle('insforge:realtime:unsubscribe', async (_event, channel) => {
  const invalid = validateChannel(channel)
  if (invalid) return invalid
  return runInsforgeOperation('realtime:unsubscribe', (client) => unsubscribeRealtimeChannel(client, channel))
})

ipcMain.handle('insforge:realtime:retry', async (_event, channel) => {
  const invalid = validateChannel(channel)
  if (invalid) return invalid
  return runInsforgeOperation('realtime:retry', (client) => retryRealtimeChannel(client, channel))
})

ipcMain.handle('insforge:realtime:publish', async (_event, payload) => {
  const invalid = validatePublishPayload(payload)
  if (invalid) return invalid
  return runInsforgeOperation('realtime:publish', (client) => publishRealtimeEvent(client, payload))
})

ipcMain.handle('insforge:realtime:disconnect', async () => {
  return runInsforgeOperation('realtime:disconnect', async (client) => {
    const result = await client.realtime.disconnect()
    realtimeRegistry.forEach((entry) => {
      if (entry.timer) clearTimeout(entry.timer)
    })
    realtimeRegistry.clear()
    publishRealtimeStatus()
    return result || { ok: true }
  })
})

ipcMain.handle('insforge:realtime:status', async () => normalizeResult({ channels: realtimeSnapshot() }))

if (process.env.ZYRON_MAIN_TEST_HOOKS === '1') {
  module.exports = {
    __testHooks: {
      realtimeSnapshot,
      resetRealtimeRegistry: () => {
        realtimeRegistry.forEach((entry) => {
          if (entry.timer) clearTimeout(entry.timer)
        })
        realtimeRegistry.clear()
      },
      resetInsforgeClient: () => {
        insforgeClientPromise = null
        authRecoveryPromise = null
        realtimeForwardersInstalled = false
        currentRefreshToken = null
      }
    }
  }
} else {
  app.whenReady().then(() => {
    createWindow()

    // Check for updates like Cyberbistro
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
