/**
 * @file online-only-refactor.test.cjs
 * @description Behavior coverage for the removal of the local-first layer.
 * The app is online-only now: main.js must not require or reference the
 * retired ./localdb and ./sync modules, and every tenant-scoped db handler
 * must route through the InsForge online path (runInsforgeOperation).
 */

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
    select: function () { return this },
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

test('the retired local-first modules no longer exist on disk', () => {
  assert.equal(fs.existsSync(path.join(root, 'localdb.js')), false, 'localdb.js should be deleted')
  assert.equal(fs.existsSync(path.join(root, 'sync.js')), false, 'sync.js should be deleted')
})

test('main.js no longer requires or references localdb/sync', () => {
  const mainJs = fs.readFileSync(mainPath, 'utf8')

  assert.doesNotMatch(mainJs, /require\(['"]\.\/localdb['"]\)/, 'main.js must not require ./localdb')
  assert.doesNotMatch(mainJs, /require\(['"]\.\/sync['"]\)/, 'main.js must not require ./sync')
  assert.doesNotMatch(mainJs, /\blocaldb\./, 'main.js must not call any localdb.* function')
  assert.doesNotMatch(mainJs, /\bsync\.\w/, 'main.js must not call any sync.* function')
  assert.doesNotMatch(mainJs, /asegurarSincronizacionActiva/, 'the sync-loop helper must be removed')
})

test('preload.js no longer exposes a local cache-update bridge', () => {
  const preloadJs = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
  assert.doesNotMatch(preloadJs, /local-cache-updated/)
  assert.doesNotMatch(preloadJs, /cache:\s*{/)
})

test('renderer.js no longer listens for local cache-update notifications', () => {
  const rendererJs = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8')
  assert.doesNotMatch(rendererJs, /local-cache-updated/)
  assert.doesNotMatch(rendererJs, /cache\?\.onUpdated/)
})

test('insforge:db:select routes a tenant-scoped payload through the online InsForge client', async () => {
  const { handlers } = loadMainForBehaviorTest()
  let calledTable = null

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    database: {
      from: (table) => {
        calledTable = table
        return makeSelectQuery([{ data: [{ id: '1', tenant_id: 'tenant-1' }], error: null }])
      }
    },
    realtime: { on: () => {} }
  }

  const result = await handlers.get('insforge:db:select')(null, {
    table: 'customers',
    filters: [{ column: 'tenant_id', op: 'eq', value: 'tenant-1' }]
  })

  assert.equal(calledTable, 'customers', 'select must reach the online InsForge client even with a tenant_id filter')
  assert.equal(result.error, null)
  assert.equal(result.data[0].id, '1')
})

test('insforge:db:insert routes a tenant-scoped payload through the online InsForge client', async () => {
  const { handlers } = loadMainForBehaviorTest()
  let insertedValues = null

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    database: {
      from: (_table) => ({
        insert: (values) => {
          insertedValues = values
          return { select: async () => ({ data: values, error: null }) }
        }
      })
    },
    realtime: { on: () => {} }
  }

  const result = await handlers.get('insforge:db:insert')(null, {
    table: 'customers',
    values: [{ name: 'Cliente', tenant_id: 'tenant-1' }]
  })

  assert.ok(insertedValues, 'insert must reach the online InsForge client even with a tenant_id value')
  assert.equal(result.error, null)
})

test('insforge:db:update routes a tenant-scoped payload through the online InsForge client', async () => {
  const { handlers } = loadMainForBehaviorTest()
  let updatedValues = null
  const query = {
    eq: function () { return this },
    select: async () => ({ data: [{ id: 'record-1' }], error: null })
  }

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    database: {
      from: () => ({
        update: (values) => {
          updatedValues = values
          return query
        }
      })
    },
    realtime: { on: () => {} }
  }

  const result = await handlers.get('insforge:db:update')(null, {
    table: 'customers',
    values: { name: 'Actualizado', tenant_id: 'tenant-1' },
    filters: [{ column: 'tenant_id', op: 'eq', value: 'tenant-1' }]
  })

  assert.ok(updatedValues, 'update must reach the online InsForge client even with a tenant_id filter/value')
  assert.equal(result.error, null)
})

test('insforge:db:delete routes a tenant-scoped payload through the online InsForge client', async () => {
  const { handlers } = loadMainForBehaviorTest()
  let deleteCalled = false
  const query = {
    eq: function () { return this },
    then: (resolve, reject) => Promise.resolve({ data: [{ id: 'record-1' }], error: null }).then(resolve, reject)
  }

  global.__ZYRON_TEST_INSFORGE_CLIENT = {
    auth: {},
    database: {
      from: () => ({
        delete: () => {
          deleteCalled = true
          return query
        }
      })
    },
    realtime: { on: () => {} }
  }

  const result = await handlers.get('insforge:db:delete')(null, {
    table: 'customers',
    filters: [{ column: 'tenant_id', op: 'eq', value: 'tenant-1' }]
  })

  assert.equal(deleteCalled, true, 'delete must reach the online InsForge client even with a tenant_id filter')
  assert.equal(result.error, null)
})
