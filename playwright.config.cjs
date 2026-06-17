const path = require('node:path')

module.exports = {
  testDir: './tests/e2e',
  reporter: 'list',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  expect: {
    timeout: 15000
  },
  outputDir: path.join(__dirname, 'test-results', 'playwright'),
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000
  },
  projects: [
    {
      name: 'electron-critical-flows',
      testMatch: /.*\.spec\.js/
    }
  ]
}
