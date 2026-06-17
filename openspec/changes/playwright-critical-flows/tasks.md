# Tasks: Playwright Critical Flows — First Slice

## Review Workload Forecast

| Field                   | Value       |
| ----------------------- | ----------- |
| Estimated changed lines | 340–450     |
| 400-line budget risk    | Medium      |
| Chained PRs recommended | No          |
| Suggested split         | Single PR   |
| Delivery strategy       | ask-on-risk |
| Chain strategy          | pending     |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

Single PR — all phases in one change. The estimate sits close to the 400-line boundary; keep fixture and spec code tight. No chained PRs needed unless scope creeps during implementation.

## Phase 1: Foundation — Fixture & App Hook

- [x] 1.1 Modify `main.js` — add `app.setPath('userData', process.env.PW_ELECTRON_USER_DATA_ROOT)` guard after `loadEnvFromDotEnvFiles()` so tests control storage isolation before `localdb.inicializar()` consumes the default path
- [x] 1.2 Create `tests/e2e/fixtures/electron-app.fixture.js` — export `launchElectronTestApp()`: validate required env (`INSFORGE_BASE_URL`, `INSFORGE_ANON_KEY`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`); generate isolated temp userData dir per worker; launch Electron with injected config; return `{ electronApp, page, cleanup }`
- [x] 1.3 Create `tests/e2e/fixtures/seed-contract.js` — read seeded credentials; expose `testRun.customerName(prefix)` returning unique namespaced values (worker+timestamp)
- [x] 1.4 Modify `playwright.config.cjs` — add worker isolation, retry policy, project definition, and fixture imports

## Phase 2: Smoke Tests

- [ ] 2.1 Rewrite `tests/e2e/auth-login.spec.js` — use shared fixture; scenario A: seeded tenant-admin login reaches `#view-dashboard` within 15s with correct tenant context; scenario B: invalid credentials show error, dashboard stays hidden
- [ ] 2.2 Create `tests/e2e/customers-create.spec.js` — use fixture + seed contract; scenario A: create namespaced customer via Customers module, verify in list within 10s; scenario B: sequential runs don't leak customer data

## Phase 3: CI Integration

- [ ] 3.1 Modify `.github/workflows/ci.yml` — export `INSFORGE_BASE_URL`, `INSFORGE_ANON_KEY`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`; add Playwright run step; ensure headless Electron can execute in CI runner

## Phase 4: Verification

- [ ] 4.1 Run full e2e suite locally — confirm fixture isolation, login bootstrap, customer creation, and invalid-credential error all pass without flaky sleeps
- [ ] 4.2 Clean up — remove `console.log` / debug statements from fixture and specs; confirm temp artifacts don't persist after run
