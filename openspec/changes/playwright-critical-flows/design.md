# Design: Playwright Critical Flows

## Technical Approach

Implement a first-slice Playwright harness around Electron launch, not around packaged binaries. The harness will start `main.js` with deterministic runtime inputs, one isolated `userData` root per worker, and a seeded tenant-admin credential contract. Coverage stays limited to two smoke flows from the proposal/spec: login/bootstrap to a ready tenant workspace, and customer creation in the active tenant.

## Architecture Decisions

### Decision: Launch through shared Electron fixture

**Choice**: Add a reusable fixture in `tests/e2e/fixtures/` that wraps `_electron.launch`, creates worker-scoped temp folders, validates required env, and returns `{ electronApp, page, testRun }`.
**Alternatives considered**: Direct launch inside each spec; packaged-app launch.
**Rationale**: The current `auth-login.spec.js` duplicates launch logic and shares ambient state. A fixture centralizes isolation, retries, cleanup, and test metadata while matching the existing CommonJS Playwright setup.

### Decision: Prefer env-driven runtime config with file fallback

**Choice**: Standardize tests on `INSFORGE_BASE_URL` and `INSFORGE_ANON_KEY`; optionally generate `insforge.json` inside the worker `userData` folder only if `main.js` still needs file-first compatibility.
**Alternatives considered**: Rely only on `insforge.local.json`; change app startup to read `.env`.
**Rationale**: `main.js` already supports env resolution and fails when config is missing. CI currently exports `INSFORGE_PUBLIC_URL`, which does not satisfy runtime resolution, so the test harness must enforce the real variable names and fail fast before launch.

### Decision: Test-only userData override stays in main-process boundary

**Choice**: Add a narrow startup hook in `main.js` so tests can override `app.getPath('userData')` before `localdb.inicializar(...)` runs.
**Alternatives considered**: Share default Electron userData; patch localdb paths from renderer.
**Rationale**: `localdb.js` persists under `app.getPath('userData')/local_db`. Isolation must happen before app ready, otherwise auth/session/cache state leaks across runs.

## Data Flow

`playwright.config.cjs` → fixture validates env → creates `temp/worker-{id}` → launches Electron with worker env/userData override → `main.js` resolves InsForge config and initializes `localdb` → renderer submits login → bootstrap loads `app_users`, memberships, tenant context, preferences, realtime subscription → customer spec opens `clientes` and submits a namespaced record.

    Playwright Worker -> Electron Fixture -> main.js
           |                 |               |
           |                 |               -> localdb(userData/local_db)
           |                 -> env/config injection
           -> smoke specs -> renderer/preload IPC -> InsForge

## File Changes

| File                                                   | Action | Description                                                                                    |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------- |
| `openspec/changes/playwright-critical-flows/design.md` | Create | Technical design for the first slice.                                                          |
| `playwright.config.cjs`                                | Modify | Add worker-aware setup, retries, projects, and fixture wiring.                                 |
| `tests/e2e/fixtures/electron-app.fixture.js`           | Create | Central Electron launch, env validation, userData/temp lifecycle, and helpers.                 |
| `tests/e2e/fixtures/seed-contract.js`                  | Create | Read seeded tenant-admin env, build per-test namespace values, and expose assertions metadata. |
| `tests/e2e/auth-login.spec.js`                         | Modify | Convert live-credential smoke into login/bootstrap verification using shared fixture.          |
| `tests/e2e/customers-create.spec.js`                   | Create | Create one namespaced customer and verify it appears for the active tenant.                    |
| `main.js`                                              | Modify | Add test-safe `userData` override and optional config-path override before app ready.          |
| `.github/workflows/ci.yml`                             | Modify | Export `INSFORGE_BASE_URL` and seed credentials, then run Playwright with the shared harness.  |

## Interfaces / Contracts

```js
// test env contract
INSFORGE_BASE_URL=...
INSFORGE_ANON_KEY=...
TEST_USER_EMAIL=...
TEST_USER_PASSWORD=...
TEST_TENANT_NAME=optional
PW_ELECTRON_USER_DATA_ROOT=generated per worker
PW_TEST_NAMESPACE=generated per test
```

Fixture contract:

- `launchElectronTestApp()` throws before launch if required env is missing.
- `testRun.customerName(prefix)` returns a unique name such as `pw-customer-<worker>-<timestamp>`.
- Specs assert by exact namespaced record, never by global counts.

## Testing Strategy

| Layer       | What to Test                                                | Approach                                                                                |
| ----------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Unit        | Fixture env validation and namespace builder                | Node-level helper tests if logic grows beyond trivial branches.                         |
| Integration | Electron startup uses injected config and isolated userData | Playwright fixture plus optional `electronApp.evaluate` checks on resolved paths/state. |
| E2E         | Invalid login, successful bootstrap, customer creation      | Two smoke specs using locator assertions and tenant-scoped verification.                |

## Migration / Rollout

No data migration required. Roll out as a first Playwright slice in CI behind existing E2E entrypoints; replace the brittle live smoke once the shared fixture is green.

## Open Questions

- [ ] Should `main.js` expose the effective `userData` path through a test-only hook for direct assertion, or is launch-time override verification sufficient?
- [ ] Which stable UI signal should represent “workspace ready” in CI: `#view-dashboard`, tenant context bar content, or realtime status event?
- [ ] Deferred by design: invoice issuance, offline restart recovery, and multi-user realtime propagation.
