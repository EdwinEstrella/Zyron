# Desktop Critical Flows Testing Specification

## Purpose

Define observable behavior for a deterministic Electron + Playwright test foundation that validates tenant-admin login/bootstrap and customer creation without shared state or manual setup.

## Requirements

### Requirement: Electron Test Fixture Isolation

The system SHALL provide a reusable Playwright fixture that launches the Electron app with an isolated `userData` directory per test worker and injects runtime configuration (InsForge base URL and anon key) via environment variables or a generated config file. The fixture MUST NOT share `userData`, cache, or session state across test workers or runs.

#### Scenario: Fresh userData per worker

- GIVEN a Playwright test worker starts
- WHEN the Electron fixture launches the app
- THEN `app.getPath('userData')` SHALL resolve to a unique temporary directory that does not persist after the run

#### Scenario: Runtime config injection

- GIVEN `INSFORGE_BASE_URL` and `INSFORGE_ANON_KEY` are set in the test environment
- WHEN the Electron app initializes its InsForge client
- THEN the client SHALL use the injected values without reading `.env` or bundled config

#### Scenario: Missing runtime config fails fast

- GIVEN `INSFORGE_BASE_URL` or `INSFORGE_ANON_KEY` is not set
- WHEN the fixture attempts to launch
- THEN the fixture SHALL throw a descriptive error before launching Electron

### Requirement: Tenant-Admin Login and Bootstrap

The system SHALL allow a seeded tenant-admin to authenticate via the login form and reach a bootstrapped workspace where tenant context is loaded and the UI is ready for module navigation.

#### Scenario: Seeded tenant-admin reaches workspace

- GIVEN a seeded tenant-admin with known email, password, active tenant, and `tenant_admin` membership
- WHEN the test fills the login form and submits
- THEN the dashboard view SHALL become visible within 15 seconds
- AND the tenant context SHALL reflect the seeded tenant

#### Scenario: Login with invalid credentials shows error

- GIVEN the login form is visible
- WHEN the test submits invalid credentials
- THEN an error message SHALL appear in the login view
- AND the dashboard view SHALL NOT become visible

### Requirement: Customer Creation for Active Tenant

The system SHALL allow an authenticated tenant-admin to create a customer with namespaced data and verify it appears in the Customers list for the active tenant.

#### Scenario: Create and verify namespaced customer

- GIVEN the tenant-admin is logged in and on the Customers module
- WHEN the test fills the customer form with a unique name (e.g., timestamped) and submits
- THEN the customer list SHALL display the new customer within 10 seconds
- AND the customer record SHALL be scoped to the active tenant

#### Scenario: Customer namespaced per test

- GIVEN two sequential test runs create customers
- WHEN each run verifies its own customer
- THEN each run SHALL find only its own customer, not the other run's data

### Requirement: Deterministic Wait Strategy

The system SHALL use explicit UI-ready and data-ready waits (locator visibility, network idle, or DB-backed assertions) instead of fixed timeouts or shared-record count checks.

#### Scenario: No flaky sleep-based waits

- GIVEN a smoke test is executing
- WHEN it waits for a view transition or data appearance
- THEN it SHALL use Playwright locator expectations or equivalent deterministic signals

## Out of Scope for This Change

- Invoice draft/issue and stock side effects.
- Offline restart or local cache recovery assertions.
- Multi-user realtime propagation or conflict handling.
