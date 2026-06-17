# Apply Progress: Playwright Critical Flows

## Summary

- Mode: Standard
- Delivery strategy: force-chained
- Chain strategy: stacked-to-main
- Current work unit: foundation PR
- Scope: deterministic Playwright/Electron foundation only

## Completed Tasks

- [x] 1.1 Modify `main.js` — add test-only `userData` override before `localdb.inicializar()`
- [x] 1.2 Create `tests/e2e/fixtures/electron-app.fixture.js` — validate required env, create worker-scoped temp `userData`, launch Electron, expose cleanup
- [x] 1.3 Create `tests/e2e/fixtures/seed-contract.js` — expose seeded credential contract and namespaced customer helper
- [x] 1.4 Modify `playwright.config.cjs` — add deterministic retries, project definition, and shared runtime defaults

## Files Changed

| File                                                  | Action   | Notes                                                                                         |
| ----------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `main.js`                                             | Modified | Added pre-ready Playwright `userData` override for isolated local storage                     |
| `playwright.config.cjs`                               | Modified | Added deterministic Playwright project/runtime defaults for Electron smoke coverage           |
| `tests/e2e/fixtures/electron-app.fixture.js`          | Created  | Added shared Electron launch helper with env validation and temp `userData` lifecycle         |
| `tests/e2e/fixtures/seed-contract.js`                 | Created  | Added seeded tenant-admin contract helpers and namespaced customer generator                  |
| `tests/behavior/playwright-foundation.test.cjs`       | Created  | Added focused verification for env validation, namespacing, temp dirs, and main hook ordering |
| `openspec/changes/playwright-critical-flows/tasks.md` | Modified | Marked foundation tasks complete                                                              |

## Verification

- ✅ `node --test tests/behavior/playwright-foundation.test.cjs`
- ✅ `npx playwright test tests/e2e/production-readiness.spec.js`

## Deviations from Design

None — implementation matches the foundation slice design. Runtime config stays env-driven, so no generated `insforge.json` fallback was needed in this slice.

## Issues Found

- `openspec/config.yaml` is still absent, so implementation followed repo patterns plus change artifacts instead of project-level OpenSpec apply rules.

## Remaining Tasks

- [ ] 2.1 Rewrite `tests/e2e/auth-login.spec.js` — use shared fixture; scenario A: seeded tenant-admin login reaches `#view-dashboard` within 15s with correct tenant context; scenario B: invalid credentials show error, dashboard stays hidden
- [ ] 2.2 Create `tests/e2e/customers-create.spec.js` — use fixture + seed contract; scenario A: create namespaced customer via Customers module, verify in list within 10s; scenario B: sequential runs don't leak customer data
- [ ] 3.1 Modify `.github/workflows/ci.yml` — export `INSFORGE_BASE_URL`, `INSFORGE_ANON_KEY`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`; add Playwright run step; ensure headless Electron can execute in CI runner
- [ ] 4.1 Run full e2e suite locally — confirm fixture isolation, login bootstrap, customer creation, and invalid-credential error all pass without flaky sleeps
- [ ] 4.2 Clean up — remove `console.log` / debug statements from fixture and specs; confirm temp artifacts don't persist after run

## Workload / PR Boundary

- Mode: stacked PR slice
- Current work unit: foundation PR
- Boundary: starts with deterministic Electron launch/runtime isolation and ends before login/customer smoke specs
- Estimated review budget impact: kept focused on app hook, shared fixtures, and minimal verification only
