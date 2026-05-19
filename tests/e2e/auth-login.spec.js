const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('node:path');

test.describe('Authentication Flow', () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    // Check if test credentials are provided
    if (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD) {
      console.warn('Skipping test: TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables are required.');
      test.skip();
    }

    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      }
    });

    // Get the main application window
    window = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('should login successfully with valid credentials', async () => {
    // Wait for the UI to load
    await window.waitForLoadState('domcontentloaded');
    
    // Zyron uses a single-page approach. Wait for the login screen.
    const loginSection = window.locator('#view-login');
    await expect(loginSection).toBeVisible();

    // Fill the login form
    await window.fill('#email', process.env.TEST_USER_EMAIL);
    await window.fill('#password', process.env.TEST_USER_PASSWORD);

    // Submit the form
    await window.click('#login-form button[type="submit"]');

    // Wait for navigation or state change that indicates successful login.
    // We wait up to 10 seconds for the dashboard view to become visible
    const appLayout = window.locator('#view-dashboard');
    await expect(appLayout).toBeVisible({ timeout: 10000 });
  });
});
