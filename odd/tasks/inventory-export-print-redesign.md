# Feature: Inventory Export, Print Report & Contrast Redesign

## Objective

Fix inventory Excel export by generating native, styled `.xlsx` workbooks, add a printable inventory report, and redesign UI contrast across the application.

## Why

- Current inventory export generates comma-separated CSV. In Latin American regional settings (Excel), `;` is the default delimiter, collapsing all columns into a single cell.
- Users need an inventory catalog export formatted as a real, styled `.xlsx` spreadsheet with proper numbers, money formatting, and headers.
- Zyron lacks a printable inventory report (PDF/print).
- The current UI palette has low contrast across near-white background and surface layers.

## Scope

- **T1: Real .xlsx export** (main process `exceljs` integration, IPC channel `desktop:save-xlsx`, `lib/xlsx-builder.cjs`, renderer export action and button update).
- **T2: Printable inventory report** (reuse `desktop:save-pdf-from-html` / `open-html-preview` for inventory catalog print/PDF).
- **T3: Design tokens & contrast** (update `tailwind.config.cjs` palette for crisp surface contrast).
- **T4: Sidebar & base components** (modernized sidebar, input fields, tables, action bars).
- **T5: Per-module polish** (facturación, inventario, clientes, reportes, contabilidad).

## Constraints

- Branch `feat/inventory-export-print-redesign`.
- Code and comments in English; UI labels in Spanish (Dominican Republic context: ITBIS, not IVA).
- Renderer is sandboxed (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`); file system and `exceljs` operations belong in the main process.
- No `Co-Authored-By` or AI attribution in commits. No commits in this turn (reviewed by Claude).

## TDD

Mode: off. Runner: `npm run test:behavior` (`node --test tests/behavior/*.test.cjs`).

## Tasks

- [x] T1 Inventory export to real .xlsx (committed: 6ae6a16)
  - Install `exceljs` and keep lockfile in sync.
  - Implement pure workbook builder in `lib/xlsx-builder.cjs`.
  - Expose `desktop:save-xlsx` IPC handler in `main.js`.
  - Expose `saveXlsx` in `preload.js`.
  - Update `export_catalog` action and `#inv-export-btn` in `renderer.js`.
  - Add behavior test in `tests/behavior/inventory-export-xlsx.test.cjs`.
- [x] T2 Printable inventory report (committed: bc17a01)
  - Pure HTML builder `buildInventoryReportHtml` in `components/inventory-report.js`.
  - Support `payload.landscape === true` in `desktop:save-pdf-from-html` in `main.js`.
  - Script inclusion in `index.html`.
  - Add `min_stock` to `export_catalog` rows without Excel column changes.
  - Add `#inv-print-btn` ("Imprimir") and `#inv-pdf-btn` ("PDF") with empty-catalog guard and error handling in `renderer.js`.
  - Add behavior tests in `tests/behavior/inventory-report-print.test.cjs`.
- [x] T3 Design tokens & contrast redesign (ready for review, uncommitted)
  - Updated `tailwind.config.cjs` palette: `surface` #e6ecf4, `surface-container-low` #eef2f8, `surface-container` #dfe7f1, `surface-container-high` #d3deec, `surface-container-highest` #c4d3e6, `surface-container-lowest` #ffffff, `surface-dim` #d5dde8, `outline` #475569, `outline-variant` #64748b, `accent` #0284c7, `accent-soft` #38bdf8, and audit-resolved `primary-variant` #1a3b61.
  - Added `theme.extend.boxShadow` overrides (`sm`, `md`, `lg`) in `tailwind.config.cjs`.
  - Updated `components/paint-first.css` background to `#e6ecf4`.
  - Updated `index.html` titlebar background to `#0a1a2e`, dark navy `.app-sidebar` (`linear-gradient(180deg, #0f2744 0%, #0b1d33 100%)`), `.nav-module` colors and active indicator (`inset 3px 0 0 #38bdf8`), and sidebar footer separator (`border-white/10`).
  - Added `:where(...)` zero-specificity global component rules in `styles/tailwind.css` for table thead headers, row hover, and input focus rings.
  - Rebuilt CSS (`npm run build:css`, minified).
  - Created visual gallery at `C:\Users\Edwin\AppData\Local\Temp\claude\3d7b583bd752d830\d317affa-e04c-490c-ba2f-ddb644c1b265\scratchpad\design-gallery.html`.
  - Added behavior tests in `tests/behavior/design-tokens.test.cjs` (5 tests pass; total suite 195 pass).
- [ ] T4 Sidebar & base components redesign
- [ ] T5 Per-module polish

## Acceptance criteria (T1)

- Clicking "Exportar Excel" in the inventory module prompts a save dialog defaulting to the desktop with `.xlsx` extension.
- Generated `.xlsx` contains:
  - Title row (bold, large) and subtitle row with generation timestamp, then a blank row, then headers.
  - Header row with navy fill (`FF0F2744`), bold white text, centered, thin borders, frozen panes below headers, and autofilter enabled.
  - Data columns: SKU, Nombre, Tipo, Precio, Costo, Existencia, Controla stock (Sí/No), ITBIS %, Descuento %, Categoría, Unidad, Activo (Sí/No).
  - Proper data types: money formatted as `#,##0.00`, integer as `#,##0`, percent as `0.00%`, numerics right-aligned, zebra striping with light gray fill (`FFF1F5F9`) on alternate rows, thin borders.
- Canceling the save dialog does not produce errors or alerts.
- Renderer no longer outputs comma-separated CSV for inventory export.

## Checks

- `npm run test:behavior`
- `npx eslint main.js preload.js renderer.js lib tests`
- Smoke test `node -e "require('./lib/xlsx-builder.cjs')"` writing and reading back a sample `.xlsx`.

## Progress

- 2026-11-11: T1 started. Tasks file created.
- 2026-11-11: T1 completed. `exceljs` installed, `lib/xlsx-builder.cjs` implemented, `desktop:save-xlsx` IPC wired in `main.js` and `preload.js`, `renderer.js` export_catalog action and button updated, behavior tests added in `tests/behavior/inventory-export-xlsx.test.cjs`. Tests: 178 pass. Committed as `6ae6a16`.
- 2026-11-11: T2 completed. `components/inventory-report.js` implemented with A4 landscape HTML/CSS, navy (#0f2744) theme, 4 KPI cards, totals row in `tfoot`, low-stock badge; `main.js` supports `landscape: true`; `renderer.js` adds `min_stock` in export_catalog and wires `#inv-print-btn` and `#inv-pdf-btn`; behavior tests added in `tests/behavior/inventory-report-print.test.cjs`. Sample report generated. Tests: 189 pass. Committed as `bc17a01`.
- 2026-11-11: T3 completed. Design tokens and shadows updated in `tailwind.config.cjs`, missing Material tokens audited and resolved (`surface-container-highest`: `#c4d3e6`, `primary-variant`: `#1a3b61`), shell updated in `index.html` and `components/paint-first.css`, global `:where(...)` table and input focus rules added in `styles/tailwind.css`, minified CSS built, static visual gallery generated, and behavior tests added in `tests/behavior/design-tokens.test.cjs`. Tests: 195 pass. Ready for review (uncommitted).

## Next step

Claude reviews diff of T3 (uncommitted). Next task is T4 (sidebar & base components redesign).
