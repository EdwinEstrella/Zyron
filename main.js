const { app, BrowserWindow, ipcMain, nativeImage } = require('electron/main')
const fs = require('node:fs')
const path = require('node:path')

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

/** Depuración Insforge: terminal del proceso principal (DevTools no lo muestra). */
const zyronLog = (scope, detail) => {
  try {
    const line = typeof detail === 'string' ? detail : JSON.stringify(detail, null, 0)
    console.log(`[Zyron:${scope}]`, line.length > 4000 ? `${line.slice(0, 4000)}…` : line)
  } catch (_) {
    console.log(`[Zyron:${scope}]`, detail)
  }
}

const redactPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload
  const clone = JSON.parse(JSON.stringify(payload))
  if (clone.password) clone.password = '***'
  if (clone.newPassword) clone.newPassword = '***'
  if (clone.body && typeof clone.body === 'object') {
    clone.body = { ...clone.body }
    if (clone.body.password) clone.body.password = '***'
  }
  return clone
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

const INSFORGE_BASE_URL = 'https://zyron.azokia.com'
const INSFORGE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0Mzk5NjB9.ZP6__Mf_PM_4UbIgtZ4eICrcsaLpoWOVOyLkv-yLuPg'

const normalizeResult = (result, error = null) => {
  if (error) return { data: null, error: { message: error.message || String(error) } }
  if (result && typeof result === 'object' && 'data' in result && 'error' in result) return result
  return { data: result ?? null, error: null }
}

const getInsforgeClient = async () => {
  if (insforgeClientPromise) return insforgeClientPromise
  insforgeClientPromise = (async () => {
    const { createClient } = await import('@insforge/sdk')
    return createClient({
      baseUrl: INSFORGE_BASE_URL,
      anonKey: INSFORGE_ANON_KEY
    })
  })()
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
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
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

ipcMain.handle('insforge:config', async () => ({ baseUrl: INSFORGE_BASE_URL }))

ipcMain.handle('insforge:auth:signUp', async (_event, payload) => {
  try {
    zyronLog('auth:signUp', { email: payload?.email, hasPassword: Boolean(payload?.password) })
    const client = await getInsforgeClient()
    const result = await client.auth.signUp(payload)
    if (!result?.error && result?.data) applyAuthSessionFromPayload(client, result.data)
    if (result?.error) zyronLog('auth:signUp:error', result.error)
    else zyronLog('auth:signUp:ok', { userId: result?.data?.user?.id, email: result?.data?.user?.email })
    return normalizeResult(result)
  } catch (error) {
    zyronLog('auth:signUp:exception', error?.message || String(error))
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:auth:signInWithPassword', async (_event, payload) => {
  try {
    zyronLog('auth:signIn', { email: payload?.email })
    const client = await getInsforgeClient()
    const result = await client.auth.signInWithPassword(payload)
    if (!result?.error && result?.data) applyAuthSessionFromPayload(client, result.data)
    if (result?.error) zyronLog('auth:signIn:error', result.error)
    else zyronLog('auth:signIn:ok', { userId: result?.data?.user?.id })
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
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:db:insert', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const { table, values, selectColumns = '*' } = payload || {}
    const preview = Array.isArray(values)
      ? values.map((row) => {
          const r = { ...row }
          if (r.password) r.password = '***'
          return r
        })
      : values
    zyronLog('db:insert', { table, rows: Array.isArray(values) ? values.length : 1, preview })
    const result = await client.database.from(table).insert(values).select(selectColumns)
    if (result?.error) zyronLog('db:insert:error', { table, error: result.error })
    else zyronLog('db:insert:ok', { table, returned: Array.isArray(result?.data) ? result.data.length : Boolean(result?.data) })
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
    let query = client.database.from(table).update(values)
    query = applyFilters(query, filters)
    const result = await query.select(selectColumns)
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:db:delete', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const { table, filters = [] } = payload || {}
    let query = client.database.from(table).delete()
    query = applyFilters(query, filters)
    const result = await query
    return normalizeResult(result)
  } catch (error) {
    return normalizeResult(null, error)
  }
})

ipcMain.handle('insforge:db:rpc', async (_event, payload) => {
  try {
    const client = await getInsforgeClient()
    const { functionName, args = {} } = payload || {}
    zyronLog('db:rpc', { functionName, args })
    const result = await client.database.rpc(functionName, args)
    if (result?.error) zyronLog('db:rpc:error', { functionName, error: result.error })
    else zyronLog('db:rpc:ok', { functionName, data: result?.data })
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
    zyronLog('fn:invoke', { slug, method: method || 'POST', body: redactPayload(body) })
    const result = await client.functions.invoke(slug, { body, headers, method })
    if (result?.error) zyronLog('fn:invoke:error', { slug, error: result.error })
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