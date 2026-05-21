const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const mainPath = path.join(root, 'main.js')

function createElectronMock () {
  const handlers = new Map()
  const sent = []

  return {
    handlers,
    sent,
    electronMain: {
      app: {
        isPackaged: false,
        getAppPath: () => root,
        getPath: () => root,
        whenReady: () => ({ then: () => {} }),
        on: () => {},
        quit: () => {}
      },
      BrowserWindow: class BrowserWindow {
        static getAllWindows () { return [] }
        constructor () {
          this.webContents = { send: (channel, payload) => sent.push({ channel, payload }) }
        }
        loadFile () { return Promise.resolve() }
        loadURL () { return Promise.resolve() }
        isDestroyed () { return false }
        destroy () {}
      },
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: () => {}
      },
      nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
      dialog: { showSaveDialog: async () => ({ canceled: true }) }
    }
  }
}

function loadMainForBehaviorTest () {
  process.env.ZYRON_MAIN_TEST_HOOKS = '1'
  delete require.cache[mainPath]

  const electronMock = createElectronMock()
  const originalLoad = Module._load
  Module._load = function mockedLoad (request, parent, isMain) {
    if (request === 'electron/main') return electronMock.electronMain
    if (request === 'electron-updater') return { autoUpdater: { checkForUpdatesAndNotify: () => {} } }
    if (request === 'electron-log') return { transports: { file: { level: 'info' } } }
    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const main = require(mainPath)
    return { ...electronMock, main }
  } finally {
    Module._load = originalLoad
  }
}

function makeSelectQuery (results) {
  return {
    then: (resolve, reject) => Promise.resolve(results.shift()).then(resolve, reject),
    eq: function () { return this },
    neq: function () { return this },
    gt: function () { return this },
    gte: function () { return this },
    lt: function () { return this },
    lte: function () { return this },
    in: function () { return this },
    like: function () { return this },
    ilike: function () { return this },
    order: function () { return this },
    range: function () { return this },
    limit: function () { return this },
    single: function () { return this },
    maybeSingle: function () { return this }
  }
}

test('invalid IPC payloads return serialized data/null error response', async () => {
  const { handlers } = loadMainForBehaviorTest()
  const result = await handlers.get('insforge:db:insert')(null, { table: 'invoices', values: { id: 1 } })

  assert.equal(result.data, null)
  assert.equal(result.error.code, 'IPC_INVALID_PAYLOAD')
  assert.equal(result.error.recoverable, false)
  assert.match(result.error.message, /values debe ser un arreglo/i)
})

test('401/AUTH_UNAUTHORIZED refreshes once and retries without surfacing re-login', async () => {
  const { handlers } = loadMainForBehaviorTest()
  const selectResults = [
    { data: null, error: { status: 401, code: 'AUTH_UNAUTHORIZED', message: 'expired token' } },
    { data: [{ id: 'invoice-1' }], error: null }
  ]
  let refreshCount = 0
  let selectCount = 0
  let refreshOptions = null

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {
      refreshSession: async (options) => {
        refreshCount += 1
        refreshOptions = options
        return { data: { accessToken: 'new-token', user: { id: 'user-1' } }, error: null }
      },
      saveSessionFromResponse: () => {}
    },
    tokenManager: {
      saveSession: () => {},
      getAccessToken: () => 'old-token'
    },
    getHttpClient: () => ({ setRefreshToken: () => {} }),
    database: {
      from: () => ({
        select: () => {
          selectCount += 1
          return makeSelectQuery(selectResults)
        }
      })
    },
    realtime: { on: () => {} }
  }

  const result = await handlers.get('insforge:db:select')(null, { table: 'invoices' })

  assert.deepEqual(result, { data: [{ id: 'invoice-1' }], error: null })
  assert.equal(refreshCount, 1)
  assert.equal(refreshOptions, undefined)
  assert.equal(selectCount, 2)
})

test('auth recovery failure returns reauth-required error after a single refresh attempt', async () => {
  const { handlers } = loadMainForBehaviorTest()
  let refreshCount = 0
  let selectCount = 0
  let signedOut = false

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {
      refreshSession: async () => {
        refreshCount += 1
        return { data: null, error: { status: 401, code: 'AUTH_UNAUTHORIZED', message: 'refresh expired' } }
      },
      signOut: () => {
        signedOut = true
      }
    },
    database: {
      from: () => ({
        select: () => {
          selectCount += 1
          return makeSelectQuery([{ data: null, error: { status: 401, code: 'AUTH_UNAUTHORIZED', message: 'expired token' } }])
        }
      })
    },
    realtime: { on: () => {} }
  }

  const result = await handlers.get('insforge:db:select')(null, { table: 'invoices' })

  assert.equal(result.data, null)
  assert.equal(result.error.code, 'AUTH_RELOGIN_REQUIRED')
  assert.equal(result.error.reauthRequired, true)
  assert.equal(result.error.recoverable, false)
  assert.equal(refreshCount, 1)
  assert.equal(selectCount, 1)
  assert.equal(signedOut, true)
})

test('auth retry that still returns 401 forces controlled relogin instead of surfacing raw auth error', async () => {
  const { handlers } = loadMainForBehaviorTest()
  const selectResults = [
    { data: null, error: { status: 401, code: 'AUTH_UNAUTHORIZED', message: 'expired token' } },
    { data: null, error: { status: 401, code: 'AUTH_UNAUTHORIZED', message: 'retry still invalid' } }
  ]
  let refreshCount = 0
  let selectCount = 0

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {
      refreshSession: async () => {
        refreshCount += 1
        return { data: { accessToken: 'new-token', user: { id: 'user-1' } }, error: null }
      },
      signOut: () => {},
      saveSessionFromResponse: () => {}
    },
    tokenManager: {
      saveSession: () => {}
    },
    database: {
      from: () => ({
        select: () => {
          selectCount += 1
          return makeSelectQuery(selectResults)
        }
      })
    },
    realtime: { on: () => {} }
  }

  const result = await handlers.get('insforge:db:select')(null, { table: 'invoices' })

  assert.equal(result.data, null)
  assert.equal(result.error.code, 'AUTH_RELOGIN_REQUIRED')
  assert.equal(result.error.reauthRequired, true)
  assert.equal(result.error.recoverable, false)
  assert.equal(refreshCount, 1)
  assert.equal(selectCount, 2)
})

test('sign in persists SDK token manager session so bootstrap getCurrentUser returns user', async () => {
  const { handlers } = loadMainForBehaviorTest()
  let savedSession = null

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          user: { id: 'user-1', email: 'test@test.com' }
        },
        error: null
      }),
      getCurrentUser: async () => ({ data: { user: savedSession?.user ?? null }, error: null }),
      saveSessionFromResponse: () => {}
    },
    tokenManager: {
      saveSession: (session) => { savedSession = session },
      getAccessToken: () => savedSession?.accessToken ?? null
    },
    getHttpClient: () => ({ setRefreshToken: () => {} }),
    realtime: { on: () => {} }
  }

  const signIn = await handlers.get('insforge:auth:signInWithPassword')(null, {
    email: 'test@test.com',
    password: 'secret123'
  })
  const current = await handlers.get('insforge:auth:getCurrentUser')()

  assert.equal(signIn.error, null)
  assert.equal(savedSession.accessToken, 'access-token')
  assert.equal(current.data.user.id, 'user-1')
})

test('failed realtime subscription enters degraded state and schedules backoff', async () => {
  const { handlers, main } = loadMainForBehaviorTest()

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    realtime: {
      on: () => {},
      connect: async () => ({}),
      subscribe: async () => { throw Object.assign(new Error('channel permission denied'), { status: 403 }) },
      unsubscribe: () => {},
      disconnect: async () => ({ ok: true })
    }
  }

  const result = await handlers.get('insforge:realtime:subscribe')(null, 'tenant:tenant_1:domain-events')
  const snapshot = main.__testHooks.realtimeSnapshot()

  assert.equal(result.data.ok, false)
  assert.equal(result.data.degraded, true)
  assert.equal(result.error.status, 403)
  assert.equal(snapshot.length, 1)
  assert.equal(snapshot[0].status, 'degraded')
  assert.equal(snapshot[0].degraded, true)
  assert.equal(snapshot[0].attempts, 1)
  assert.equal(typeof snapshot[0].retryDelayMs, 'number')
  assert.equal(typeof snapshot[0].nextRetryAt, 'string')

  main.__testHooks.resetRealtimeRegistry()
})

test('manual realtime retry clears degraded state when subscription recovers', async () => {
  const { handlers, main } = loadMainForBehaviorTest()
  let attempts = 0

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    realtime: {
      on: () => {},
      connect: async () => ({}),
      subscribe: async () => {
        attempts += 1
        if (attempts === 1) throw Object.assign(new Error('temporary outage'), { status: 503 })
        return { ok: true }
      },
      unsubscribe: () => {},
      disconnect: async () => ({ ok: true })
    }
  }

  await handlers.get('insforge:realtime:subscribe')(null, 'tenant:tenant_1:domain-events')
  const retry = await handlers.get('insforge:realtime:retry')(null, 'tenant:tenant_1:domain-events')
  const snapshot = main.__testHooks.realtimeSnapshot()

  assert.equal(retry.error, null)
  assert.equal(retry.data.ok, true)
  assert.equal(snapshot[0].status, 'subscribed')
  assert.equal(snapshot[0].degraded, false)
  assert.equal(snapshot[0].attempts, 0)

  main.__testHooks.resetRealtimeRegistry()
})

test('realtime publish queues domain events while channel is degraded and flushes after retry', async () => {
  const { handlers, main } = loadMainForBehaviorTest()
  let subscribeAttempts = 0
  const published = []

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    realtime: {
      on: () => {},
      connect: async () => ({}),
      subscribe: async () => {
        subscribeAttempts += 1
        if (subscribeAttempts === 1) throw Object.assign(new Error('offline'), { status: 503 })
        return { ok: true }
      },
      publish: async (channel, event, payload) => {
        published.push({ channel, event, payload })
        return { ok: true }
      },
      unsubscribe: () => {},
      disconnect: async () => ({ ok: true })
    }
  }

  await handlers.get('insforge:realtime:subscribe')(null, 'tenant:tenant_1:domain-events')
  const queued = await handlers.get('insforge:realtime:publish')(null, {
    channel: 'tenant:tenant_1:domain-events',
    event: 'invoice_created',
    payload: { id: 'inv-1' }
  })

  assert.equal(queued.error, null)
  assert.equal(queued.data.queued, true)
  assert.equal(main.__testHooks.realtimeSnapshot()[0].queuedEvents, 1)

  await handlers.get('insforge:realtime:retry')(null, 'tenant:tenant_1:domain-events')

  assert.equal(published.length, 1)
  assert.deepEqual(published[0], {
    channel: 'tenant:tenant_1:domain-events',
    event: 'invoice_created',
    payload: { id: 'inv-1' }
  })
  assert.equal(main.__testHooks.realtimeSnapshot()[0].queuedEvents, 0)

  main.__testHooks.resetRealtimeRegistry()
})

test('realtime SQL foundation declares enabled tenant domain-event channel contract', () => {
  const sql = fs.readFileSync(path.join(root, 'insforge-sql/realtime_domain_events_foundation.sql'), 'utf8')

  assert.match(sql, /realtime\.domain_events\.view/)
  assert.match(sql, /realtime\.domain_events\.publish/)
  assert.match(sql, /tenant:\*:domain-events/)
  assert.match(sql, /enabled\)\s*VALUES[\s\S]*tenant:\*:domain-events[\s\S]*true/i)
  assert.match(sql, /can_use_tenant_realtime_channel/)
  assert.doesNotMatch(sql, /tenant_fiscal_profiles|journal_entries|journal_lines/i)
})

test('packaged runtime can still discover .env beside executable or resources', () => {
  const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8')

  assert.match(mainJs, /path\.dirname\(process\.execPath\)/)
  assert.match(mainJs, /process\.resourcesPath/)
})

test('accounting foundation SQL declares ledger tables, RLS, and deferred balance guards', () => {
  const migrationsDir = path.join(root, 'migrations')
  const migrationFile = fs.readdirSync(migrationsDir).find((file) => /accounting-ledger-foundation\.sql$/.test(file))
  assert.ok(migrationFile, 'accounting ledger migration file should exist')

  const sql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf8')

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.accounting_accounts/i)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.accounting_journal_entries/i)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.accounting_journal_lines/i)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.accounting_posting_rules/i)
  assert.match(sql, /accounting\.ledger\.view/)
  assert.match(sql, /accounting\.ledger\.manage/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(sql, /CREATE CONSTRAINT TRIGGER tr_accounting_lines_assert_balance[\s\S]*DEFERRABLE INITIALLY DEFERRED/i)
  assert.match(sql, /zyron_assert_journal_entry_balanced/)
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im)
})

test('accounting list IPC validates tenant id before touching InsForge', async () => {
  const { handlers } = loadMainForBehaviorTest()
  const result = await handlers.get('accounting:accounts:list')(null, { tenantId: 'not-a-uuid' })

  assert.equal(result.data, null)
  assert.equal(result.error.code, 'IPC_INVALID_PAYLOAD')
  assert.match(result.error.message, /tenantId contable invalido/i)
})

test('accounting list IPC exposes tenant-scoped ledger reads', async () => {
  const localdb = require('../../localdb')
  const rutaTemporal = path.join(__dirname, '../temp_local_db_pr2')
  
  localdb.reiniciarCache()
  if (fs.existsSync(rutaTemporal)) {
    fs.rmSync(rutaTemporal, { recursive: true, force: true })
  }
  fs.mkdirSync(rutaTemporal, { recursive: true })
  localdb.inicializar(rutaTemporal)

  const tenantIdPrueba = '11111111-1111-4111-8111-111111111111'
  const rows = [{ code: '1100', name: 'Accounts receivable', tenant_id: tenantIdPrueba }]
  
  await localdb.insertLocal(tenantIdPrueba, 'accounting_accounts', rows)

  const { handlers } = loadMainForBehaviorTest()

  const result = await handlers.get('accounting:accounts:list')(null, {
    tenantId: tenantIdPrueba,
    limit: 25
  })

  assert.equal(result.error, null)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].code, '1100')
  assert.equal(result.data[0].name, 'Accounts receivable')

  localdb.reiniciarCache()
  if (fs.existsSync(rutaTemporal)) {
    fs.rmSync(rutaTemporal, { recursive: true, force: true })
  }
})
