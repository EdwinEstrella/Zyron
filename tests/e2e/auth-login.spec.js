const { test, expect } = require('./fixtures/electron-app.fixture')

const DASHBOARD_TIMEOUT_MS = 15000

const waitForLoginView = async (page) => {
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('#view-login')).toBeVisible()
}

const submitLogin = async (page, { email, password }) => {
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#login-form button[type="submit"]').click()
}

test.describe('Authentication Flow', () => {
  test('seeded tenant admin reaches the dashboard with the shared Electron fixture', async ({ electronAppContext }) => {
    const { page, testRun } = electronAppContext

    await waitForLoginView(page)
    await submitLogin(page, {
      email: testRun.seed.email,
      password: testRun.seed.password
    })

    await expect(page.locator('#view-dashboard')).toBeVisible({ timeout: DASHBOARD_TIMEOUT_MS })

    if (testRun.seed.tenantName) {
      await expect(page.locator('body')).toContainText(testRun.seed.tenantName, {
        timeout: DASHBOARD_TIMEOUT_MS
      })
    }
  })

  test('invalid credentials stay on the login view and show an error', async ({ electronAppContext }) => {
    const { page, testRun } = electronAppContext

    await waitForLoginView(page)
    await submitLogin(page, {
      email: testRun.seed.email,
      password: `${testRun.seed.password}-invalid`
    })

    const loginStatus = page.locator('#login-status')

    await expect(loginStatus).toBeVisible({ timeout: DASHBOARD_TIMEOUT_MS })
    await expect(loginStatus).toHaveClass(/form-status--error/)
    await expect(loginStatus).toContainText(/.+/)
    await expect(page.locator('#view-dashboard')).toBeHidden()
  })
})
