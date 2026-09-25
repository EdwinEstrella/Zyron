const { test, expect } = require('./fixtures/electron-app.fixture')

const DASHBOARD_TIMEOUT_MS = 15000

const login = async (page, seed) => {
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('#view-login')).toBeVisible()
  await page.locator('#email').fill(seed.email)
  await page.locator('#password').fill(seed.password)
  await page.locator('#login-form button[type="submit"]').click()
  await expect(page.locator('#view-dashboard')).toBeVisible({ timeout: DASHBOARD_TIMEOUT_MS })
}

const openModule = async (page, moduleKey) => {
  await page.locator(`.nav-module[data-module="${moduleKey}"]`).click()
}

test.describe('Standard action bar pilots', () => {
  test('seeded tenant_admin sees the shared action bar create control on Facturas', async ({ electronAppContext }) => {
    const { page, testRun } = electronAppContext

    await login(page, testRun.seed)
    await openModule(page, 'facturas')

    await expect(page.locator('#facturas-table-wrap')).toBeVisible({ timeout: DASHBOARD_TIMEOUT_MS })
    await expect(page.locator('#factura-new-btn-top')).toBeVisible()
    await expect(page.locator('#factura-new-btn-top')).toBeEnabled()
  })

  test('seeded tenant_admin sees the shared action bar create control on Presupuestos', async ({ electronAppContext }) => {
    const { page, testRun } = electronAppContext

    await login(page, testRun.seed)
    await openModule(page, 'presupuestos')

    await expect(page.locator('#presupuestos-table-wrap')).toBeVisible({ timeout: DASHBOARD_TIMEOUT_MS })
    await expect(page.locator('#estimate-new-btn-top')).toBeVisible()
    await expect(page.locator('#estimate-new-btn-top')).toBeEnabled()
  })

  test('seeded tenant_admin sees the shared action bar create control on Clientes', async ({ electronAppContext }) => {
    const { page, testRun } = electronAppContext

    await login(page, testRun.seed)
    await openModule(page, 'clientes')

    await expect(page.locator('#cli-new-btn-top')).toBeVisible({ timeout: DASHBOARD_TIMEOUT_MS })
    await expect(page.locator('#cli-new-btn-top')).toBeEnabled()
  })
})
