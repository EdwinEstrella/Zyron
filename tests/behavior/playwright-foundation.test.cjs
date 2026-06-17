const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  assertRequiredElectronEnv,
  createWorkerUserDataDir,
  listMissingRequiredEnv
} = require('../e2e/fixtures/electron-app.fixture.js')
const { createTestRun } = require('../e2e/fixtures/seed-contract.js')

const root = path.resolve(__dirname, '../..')

test('electron fixture fails fast when required env is missing', () => {
  const env = {}

  assert.deepEqual(listMissingRequiredEnv(env), [
    'INSFORGE_BASE_URL',
    'INSFORGE_ANON_KEY',
    'TEST_USER_EMAIL',
    'TEST_USER_PASSWORD'
  ])
  assert.throws(
    () => assertRequiredElectronEnv(env),
    /INSFORGE_BASE_URL, INSFORGE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD/
  )
})

test('seed contract namespaces customer names per worker and timestamp', () => {
  const testRun = createTestRun({
    env: {
      TEST_USER_EMAIL: 'qa@example.com',
      TEST_USER_PASSWORD: 'secret123',
      TEST_TENANT_NAME: 'QA Tenant'
    },
    workerIndex: 2,
    timestamp: Date.parse('2026-06-17T12:34:56.000Z')
  })

  assert.equal(testRun.seed.email, 'qa@example.com')
  assert.equal(testRun.seed.tenantName, 'QA Tenant')
  assert.equal(testRun.namespace, 'pw-w2-20260617123456')
  assert.equal(testRun.customerName('Customer Smoke'), 'customer-smoke-pw-w2-20260617123456')
})

test('fixture temp directories are unique and removable', async () => {
  const baseTempDir = path.join(root, '.tmp', 'playwright-foundation')
  const firstDir = await createWorkerUserDataDir({
    baseTempDir,
    workerIndex: 0,
    runLabel: 'first run',
    timestamp: 1
  })
  const secondDir = await createWorkerUserDataDir({
    baseTempDir,
    workerIndex: 0,
    runLabel: 'second run',
    timestamp: 2
  })

  assert.notEqual(firstDir, secondDir)
  assert.equal(fs.existsSync(firstDir), true)
  assert.equal(fs.existsSync(secondDir), true)

  await fs.promises.rm(firstDir, { recursive: true, force: true })
  await fs.promises.rm(secondDir, { recursive: true, force: true })
})

test('main wires playwright userData override before localdb initialization', () => {
  const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
  const overrideIndex = mainJs.indexOf('PW_ELECTRON_USER_DATA_ROOT')
  const initIndex = mainJs.indexOf("localdb.inicializar(app.getPath('userData'))")

  assert.notEqual(overrideIndex, -1)
  assert.notEqual(initIndex, -1)
  assert.ok(overrideIndex < initIndex)
  assert.match(mainJs, /app\.setPath\('userData', resolvedUserDataRoot\)/)
})
