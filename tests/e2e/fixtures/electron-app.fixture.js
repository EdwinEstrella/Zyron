const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { test: base, expect, _electron: electron } = require('@playwright/test')

const { REQUIRED_SEED_ENV_KEYS, createTestRun } = require('./seed-contract')

const REPO_ROOT = path.resolve(__dirname, '../../..')
const MAIN_ENTRY_PATH = path.join(REPO_ROOT, 'main.js')
const REQUIRED_RUNTIME_ENV_KEYS = ['INSFORGE_BASE_URL', 'INSFORGE_ANON_KEY']
const REQUIRED_PLAYWRIGHT_ENV_KEYS = [...REQUIRED_RUNTIME_ENV_KEYS, ...REQUIRED_SEED_ENV_KEYS]

const sanitizeFileSegment = (value, fallback = 'playwright') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return normalized || fallback
}

const listMissingRequiredEnv = (env = process.env) => {
  return REQUIRED_PLAYWRIGHT_ENV_KEYS.filter((key) => !String(env?.[key] || '').trim())
}

const assertRequiredElectronEnv = (env = process.env) => {
  const missingKeys = listMissingRequiredEnv(env)
  if (missingKeys.length === 0) return

  throw new Error(
    `Missing required Playwright Electron environment variables: ${missingKeys.join(', ')}. Set InsForge runtime config and seeded tenant-admin credentials before launching.`
  )
}

const createWorkerUserDataDir = async ({
  baseTempDir = process.env.PW_ELECTRON_TEMP_ROOT,
  workerIndex = 0,
  runLabel = 'critical-flow',
  timestamp = Date.now()
} = {}) => {
  const resolvedBaseDir = path.resolve(baseTempDir || path.join(os.tmpdir(), 'zyron-playwright'))
  const dirName = `worker-${workerIndex}-${timestamp}-${sanitizeFileSegment(runLabel)}`
  const userDataDir = path.join(resolvedBaseDir, dirName)

  await fs.mkdir(userDataDir, { recursive: true })
  return userDataDir
}

const buildElectronLaunchEnv = ({ env = process.env, namespace, userDataDir } = {}) => {
  assertRequiredElectronEnv(env)

  return {
    ...env,
    NODE_ENV: String(env.NODE_ENV || 'test').trim() || 'test',
    PW_ELECTRON_USER_DATA_ROOT: userDataDir,
    PW_TEST_NAMESPACE: namespace
  }
}

const launchElectronTestApp = async ({
  env = process.env,
  namespace,
  page,
  runLabel = 'critical-flow',
  timestamp = Date.now(),
  userDataDir,
  workerIndex = 0
} = {}) => {
  assertRequiredElectronEnv(env)

  const testRun = createTestRun({ env, workerIndex, timestamp, namespace })
  const resolvedUserDataDir = userDataDir
    ? path.resolve(userDataDir)
    : await createWorkerUserDataDir({ runLabel, timestamp, workerIndex })
  const launchEnv = buildElectronLaunchEnv({
    env,
    namespace: testRun.namespace,
    userDataDir: resolvedUserDataDir
  })

  let electronApp = null
  try {
    electronApp = await electron.launch({
      args: [MAIN_ENTRY_PATH],
      env: launchEnv
    })

    const appPage = page || await electronApp.firstWindow()
    let cleanedUp = false

    const cleanup = async () => {
      if (cleanedUp) return
      cleanedUp = true

      try {
        if (electronApp) await electronApp.close()
      } finally {
        await fs.rm(resolvedUserDataDir, { recursive: true, force: true })
      }
    }

    return {
      cleanup,
      electronApp,
      launchEnv,
      page: appPage,
      testRun,
      userDataDir: resolvedUserDataDir
    }
  } catch (error) {
    await fs.rm(resolvedUserDataDir, { recursive: true, force: true })
    throw error
  }
}

const test = base.extend({
  electronAppContext: async (_args, use, testInfo) => {
    const testTimestamp = testInfo.startTime instanceof Date ? testInfo.startTime.getTime() : Date.now()

    const launched = await launchElectronTestApp({
      runLabel: testInfo.title,
      timestamp: testTimestamp,
      workerIndex: testInfo.workerIndex
    })

    try {
      await use(launched)
    } finally {
      await launched.cleanup()
    }
  }
})

module.exports = {
  MAIN_ENTRY_PATH,
  REQUIRED_PLAYWRIGHT_ENV_KEYS,
  assertRequiredElectronEnv,
  buildElectronLaunchEnv,
  createWorkerUserDataDir,
  expect,
  launchElectronTestApp,
  listMissingRequiredEnv,
  test
}
