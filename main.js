const { app, BrowserWindow, ipcMain, nativeImage, dialog } = require('electron/main')

/** Logs detallados de IPC/DB en main (menos overhead). Activar: ZYRON_MAIN_VERBOSE=1 */
const mainVerboseIpc = () => process.env.ZYRON_MAIN_VERBOSE === '1'
const fs = require('node:fs')
const path = require('node:path')

/** Carga `.env` desde cwd o subiendo desde __dirname (raiz del repo con Forge). */
const loadEnvFromDotEnvFiles = () => {
  try {
    const dotenv = require('dotenv')
    const roots = new Set([process.cwd(), __dirname])
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

const normalizeResult = (result, error = null) => {
  if (error) return { data: null, error: { message: error.message || String(error) } }
  if (result && typeof result === 'object' && 'data' in result && 'error' in result) return result
  return { data: result ?? null, error: null }
}

const getInsforgeClient = async () => {
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
    return createClient({
      baseUrl: cfg.baseUrl,
      anonKey: cfg.anonKey
    })
  })()
  insforgeClientPromise = attempt.catch((err) => {
    insforgeClientPromise = null
    throw err
  })
  return insforgeClientPromise
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
  try {
    if (mainVerboseIpc()) zyronLog('auth:signUp', { email: payload?.email, hasPassword: Boolean(payload?.password) })
    const client = await getInsforgeClient()
    const result = await client.auth.signUp(payload)
    if (!result?.error && result?.data) applyAuthSessionFromPayload(client, result.data)
    if (result?.error) zyronLog('auth:signUp:error', result.error)
    else if (mainVerboseIpc()) zyronLog('auth:signUp:ok', { userId: result?.data?.user?.id, email: result?.data?.user?.email })
    return normalizeResult(result)
  } catch (error) {
    zyronLog('auth:signUp:exception', error?.message || String(error))
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:signInWithPassword', async (_event, payload) => {
  try {
    if (mainVerboseIpc()) zyronLog('auth:signIn', { email: payload?.email })
    const client = await getInsforgeClient()
    const result = await client.auth.signInWithPassword(payload)
    if (!result?.error && result?.data) applyAuthSessionFromPayload(client, result.data)
    if (result?.error) zyronLog('auth:signIn:error', result.error)
    else if (mainVerboseIpc()) zyronLog('auth:signIn:ok', { userId: result?.data?.user?.id })
    return normalizeResult(result)
  } catch (error) {
    zyronLog('auth:signIn:exception', error?.message || String(error))
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:signOut', async () => {
  try {
    const client = await getInsforgeClient()
    const result = await client.auth.signOut()
    return normalizeResult(result || { ok: true })
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:getCurrentUser', async () => {
  try {
    const client = await getInsforgeClient()
    const result = await client.auth.getCurrentUser()
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:getProfile', async (_event, userId) => {
  try {
    const client = await getInsforgeClient()
    const result = await client.auth.getProfile(userId)
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:setProfile', async (_event, profile) => {
  try {
    const client = await getInsforgeClient()
    const result = await client.auth.setProfile(profile)
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:sendResetPasswordEmail', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const result = await client.auth.sendResetPasswordEmail(payload)
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:exchangeResetPasswordToken', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const result = await client.auth.exchangeResetPasswordToken(payload)
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:resetPassword', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const result = await client.auth.resetPassword(payload)
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:db:select', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
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
    return normalizeResult(result)
  } catch (error) {
    zyronLog('db:select:exception', { message: error?.message || String(error) })
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:db:insert', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
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
    return normalizeResult(result)
  } catch (error) {
    zyronLog('db:insert:exception', { table: payload?.table, message: error?.message || String(error) })
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:db:update', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const { table, values, filters = [], selectColumns = '*' } = payload || {}
    if (mainVerboseIpc()) zyronLog('db:update:req', { table, filters: filters.length, valueKeys: values ? Object.keys(values) : [] })
    let query = client.database.from(table).update(values)
    query = applyFilters(query, filters)
    const result = await query.select(selectColumns)
    if (result?.error) zyronLog('db:update:err', { table, error: result.error })
    else if (mainVerboseIpc()) zyronLog('db:update:ok', { table })
    return normalizeResult(result)
  } catch (error) {
    zyronLog('db:update:exception', { message: error?.message || String(error) })
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:db:delete', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const { table, filters = [] } = payload || {}
    if (mainVerboseIpc()) zyronLog('db:delete:req', { table, filters: filters.length })
    let query = client.database.from(table).delete()
    query = applyFilters(query, filters)
    const result = await query
    if (result?.error) zyronLog('db:delete:err', { table, error: result.error })
    else if (mainVerboseIpc()) zyronLog('db:delete:ok', { table })
    return normalizeResult(result)
  } catch (error) {
    zyronLog('db:delete:exception', { message: error?.message || String(error) })
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:db:rpc', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const { functionName, args = {} } = payload || {}
    if (mainVerboseIpc()) zyronLog('db:rpc', { functionName, argsKeys: args && typeof args === 'object' ? Object.keys(args) : [] })
    const result = await client.database.rpc(functionName, args)
    if (result?.error) zyronLog('db:rpc:error', { functionName, error: result.error })
    else if (mainVerboseIpc()) zyronLog('db:rpc:ok', { functionName, hasData: result?.data != null })
    return normalizeResult(result)
  } catch (error) {
    zyronLog('db:rpc:exception', { functionName: payload?.functionName, message: error?.message || String(error) })
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:functions:invoke', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
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
    return normalizeResult(result)
  } catch (error) {
    zyronLog('fn:invoke:exception', { slug: payload?.slug, message: error?.message || String(error) })
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:realtime:connect', async () => {
  try {
    const client = await getInsforgeClient()
    const result = await client.realtime.connect()
    return normalizeResult(result || { ok: true })
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:realtime:subscribe', async (_event, channel) => {
  try {
    const client = await getInsforgeClient()
    const result = await client.realtime.subscribe(channel)
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:realtime:unsubscribe', async (_event, channel) => {
  try {
    const client = await getInsforgeClient()
    const result = await client.realtime.unsubscribe(channel)
    return normalizeResult(result || { ok: true })
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:realtime:publish', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const { channel, event, body, payload: eventPayload } = payload || {}
    const result = await client.realtime.publish(channel, event, body ?? eventPayload)
    return normalizeResult(result || { ok: true })
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:realtime:disconnect', async () => {
  try {
    const client = await getInsforgeClient()
    const result = await client.realtime.disconnect()
    return normalizeResult(result || { ok: true })
  } catch (error) {
    return normalizeResult(null, error)
  }
})

app.whenReady().then(() => {
  createWindow()

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
