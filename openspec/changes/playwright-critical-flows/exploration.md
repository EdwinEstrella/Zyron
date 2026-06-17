## Exploration: Playwright critical flows

### Current State

Zyron already has Playwright wired to Electron through `@playwright/test`, but coverage is minimal: one packaging baseline and one login test that depends on live credentials. The app crosses Electron renderer/preload/main boundaries, uses InsForge auth/database/functions/realtime, and routes tenant-scoped database reads and writes through `localdb.js` plus `sync.js`. Login bootstrap loads the app user, active tenant, preferences, and realtime subscription; invoice creation adds edge functions, RPC numbering, audit writes, and stock side effects.

### Affected Areas

- `playwright.config.cjs` — current config is only a minimal baseline with no Electron-specific fixtures, retries, or isolation controls.
- `tests/e2e/auth-login.spec.js` — existing login coverage launches Electron directly but relies on shared live credentials and shared app state.
- `main.js` — resolves InsForge runtime config, initializes `localdb` in `app.getPath('userData')`, manages auth recovery, realtime, and tenant-scoped local-first DB interception.
- `preload.js` — exposes the IPC bridge contract that E2E flows validate indirectly.
- `renderer.js` — contains login/bootstrap, tenant workspace selection, customer creation, and invoice creation flows.
- `localdb.js` / `sync.js` — customer CRUD exercises the local-first queue and sync bootstrap.
- `.github/workflows/ci.yml` — current CI exports `INSFORGE_PUBLIC_URL`, while runtime config resolution expects `INSFORGE_BASE_URL` or an `insforge.local.json` file.
- `insforge-sql/create_business_owner_example.sql` — shows the minimum seed pattern for an active tenant-admin account with membership.

### Approaches

1. **Foundation slice: login + tenant customer creation** — seed one active tenant admin, launch Electron with isolated runtime config and user data, verify login/bootstrap, then create a customer from the Customers module.
   - Pros: Covers Electron, auth, tenant bootstrap, renderer/preload/main IPC, and the local-first insert path with the smallest unstable surface.
   - Cons: Does not yet validate invoice edge functions or stock side effects.
   - Effort: Medium

2. **Revenue slice: login + invoice draft/issue** — seed tenant admin, customer, products, series, and function prerequisites, then create and optionally issue an invoice.
   - Pros: Exercises the highest business-value path earlier.
   - Cons: Depends on edge functions, invoice numbering RPC, audit logs, confirmation UI, and optional stock updates; much higher seed and flake cost for the first slice.
   - Effort: High

### Recommendation

Start with Approach 1. The smallest valuable first implementation is two flows: (1) tenant-admin login/bootstrap to a working dashboard with tenant context, and (2) customer creation from the Customers module. Required fixtures should be limited to deterministic runtime config injection (`insforge.local.json` or `INSFORGE_BASE_URL`/`INSFORGE_ANON_KEY`), seeded tenant-admin credentials, an isolated `userData` directory, and namespaced customer data per run. Flakiness controls should favor fresh user data, explicit selector waits instead of sleeps, no shared-record assertions, and realtime checks limited to successful bootstrap rather than cross-user event propagation.

### Risks

- `main.js` always initializes `localdb` from `app.getPath('userData')`, so Playwright needs a deterministic test-only user data strategy before tests are parallel-safe.
- Current login E2E depends on live credentials, and CI currently exports the wrong base URL variable for the app runtime.
- Shared SaaS seed data can make customer or invoice assertions flaky unless records are namespaced per run and filtered or cleaned.
- `openspec/config.yaml` and `openspec/specs/` are currently missing, so downstream OpenSpec phases can continue only if the workflow accepts a partially initialized OpenSpec tree.

### Ready for Proposal

Yes — propose a change limited to an Electron Playwright foundation, deterministic runtime/user-data fixtures, a seeded tenant-admin auth fixture, and two smoke flows: login/bootstrap and customer creation. Leave invoice draft/issue, offline restart assertions, and multi-user realtime to follow-up changes.
