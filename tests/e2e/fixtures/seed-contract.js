const REQUIRED_SEED_ENV_KEYS = ['TEST_USER_EMAIL', 'TEST_USER_PASSWORD']

const readEnvValue = (env, key) => String(env?.[key] || '').trim()

const sanitizeNamespaceSegment = (value, fallback = 'pw') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

const listMissingSeedEnv = (env = process.env) => REQUIRED_SEED_ENV_KEYS.filter((key) => !readEnvValue(env, key))

const readSeedContract = (env = process.env) => ({
  email: readEnvValue(env, 'TEST_USER_EMAIL'),
  password: readEnvValue(env, 'TEST_USER_PASSWORD'),
  tenantName: readEnvValue(env, 'TEST_TENANT_NAME') || null
})

const buildDefaultNamespace = ({ workerIndex = 0, timestamp = Date.now() } = {}) => {
  const stamp = new Date(timestamp).toISOString().replace(/\D/g, '').slice(0, 14)
  return `pw-w${workerIndex}-${stamp}`
}

const createTestRun = ({ env = process.env, workerIndex = 0, timestamp = Date.now(), namespace } = {}) => {
  const seed = readSeedContract(env)
  const resolvedNamespace = String(namespace || readEnvValue(env, 'PW_TEST_NAMESPACE') || buildDefaultNamespace({ workerIndex, timestamp })).trim()

  return {
    workerIndex,
    namespace: resolvedNamespace,
    seed,
    customerName (prefix = 'pw-customer') {
      return `${sanitizeNamespaceSegment(prefix, 'pw-customer')}-${resolvedNamespace}`
    }
  }
}

module.exports = {
  REQUIRED_SEED_ENV_KEYS,
  buildDefaultNamespace,
  createTestRun,
  listMissingSeedEnv,
  readSeedContract,
  sanitizeNamespaceSegment
}
