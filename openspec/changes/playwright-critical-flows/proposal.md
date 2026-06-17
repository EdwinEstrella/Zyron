# Proposal: Playwright Critical Flows

## Intent

Create a deterministic Electron + Playwright foundation for Zyron so CI can validate one tenant-admin happy path without shared state or manual setup. The first slice proves auth/bootstrap and customer creation, replacing today’s brittle credential-only smoke.

## Scope

### In Scope

- Isolated Electron launch/Playwright fixtures for runtime config, `userData`, and seeded tenant-admin credentials.
- Smoke flow: tenant-admin login reaches a bootstrapped workspace with tenant context and stable realtime-ready state.
- Smoke flow: create a namespaced customer and verify it appears in Customers for the active tenant.
- CI/runtime expectations for required env vars or `insforge.local.json`, plus seed prerequisites.

### Out of Scope

- Invoice draft/issue and stock side effects.
- Offline restart/local cache recovery assertions.
- Multi-user realtime propagation or conflict handling.

## Capabilities

### New Capabilities

- `desktop-critical-flows-testing`: Deterministic Electron Playwright harness, seed contract, and first-slice smoke coverage for login/bootstrap and customer creation.

### Modified Capabilities

- None — `openspec/specs/` is not initialized yet.

## Approach

Add reusable Electron fixtures around `_electron.launch`, inject real InsForge runtime config through test-only env/file setup, and isolate `app.getPath('userData')` per run. Seed one active tenant-admin membership, namespace created customer data per test, and prefer explicit UI/db-ready waits over sleeps or shared-record assertions.

## Affected Areas

| Area                            | Impact   | Description                                                |
| ------------------------------- | -------- | ---------------------------------------------------------- |
| `playwright.config.cjs`         | Modified | Electron-aware retries, projects, and shared fixtures      |
| `tests/e2e/auth-login.spec.js`  | Modified | Convert live login smoke into deterministic bootstrap flow |
| `tests/e2e/customers-*.spec.js` | New      | Customer creation smoke for active tenant                  |
| `tests/e2e/fixtures/`           | New      | Runtime config, `userData`, and seed helpers               |
| `main.js`                       | Modified | Test-safe `userData`/config hooks if needed                |
| `.github/workflows/ci.yml`      | Modified | Align runtime env names and seed prerequisites             |

## Risks

| Risk                                       | Likelihood | Mitigation                                                               |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------ |
| Shared SaaS data causes flakes             | Med        | Namespace records and avoid global counts                                |
| Electron local DB state leaks between runs | Med        | Fresh `userData` per test worker                                         |
| CI runtime config mismatch blocks startup  | High       | Standardize on `INSFORGE_BASE_URL`/`INSFORGE_ANON_KEY` or generated JSON |

## Rollback Plan

Revert Playwright/Electron config, new fixtures, and flow specs; keep the current baseline E2E entrypoint until the replacement is stable.

## Dependencies

- Seeded InsForge auth user, `app_users` row, active tenant, and `tenant_admin` membership
- CI/runtime secrets for `INSFORGE_BASE_URL` and `INSFORGE_ANON_KEY`
- Deterministic selector coverage in login, dashboard, and customers UI

## Success Criteria

- [ ] CI can launch Electron with deterministic runtime config and isolated user data.
- [ ] A seeded tenant-admin can log in and reach a bootstrapped tenant workspace without live shared-state assumptions.
- [ ] Playwright can create a namespaced customer and verify it in the active tenant.
