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
  const { handlers } = loadMainForBehaviorTest()
  const calls = []
  const rows = [{ code: '1100', name: 'Accounts receivable' }]
  const query = makeSelectQuery([{ data: rows, error: null }])
  query.select = function () { return this }
  for (const method of ['select', 'eq', 'limit', 'order']) {
    const original = query[method]
    query[method] = function (...args) {
      calls.push([method, ...args])
      return original.apply(this, args)
    }
  }

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    database: { from: (table) => { calls.push(['from', table]); return query } },
    realtime: { on: () => {} }
  }

  const result = await handlers.get('accounting:accounts:list')(null, {
    tenantId: '11111111-1111-4111-8111-111111111111',
    limit: 25
  })

  assert.deepEqual(result, { data: rows, error: null })
  assert.deepEqual(calls.slice(0, 4), [
    ['from', 'accounting_accounts'],
    ['select', '*'],
    ['eq', 'tenant_id', '11111111-1111-4111-8111-111111111111'],
    ['limit', 25]
  ])
  assert.deepEqual(calls.at(-1), ['order', 'code', { ascending: true }])
})
