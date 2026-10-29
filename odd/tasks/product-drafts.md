# Feature: Product form drafts

## Objective

Let users save an in-progress new product as a draft ("Guardar borrador") stored in the database, and on returning to the new-product form offer: "Tienes un borrador de <name/SKU> en edición — Seguir editando / Descartar borrador".

## Why

Users lose half-filled product forms when interrupted; drafts must follow the user across PCs (decision: store in DB, not localStorage — user choice 2026-10-29).

## Scope

- New table `public.product_form_drafts`: one draft per (tenant_id, user_id); `payload jsonb`, `updated_at`. RLS: own rows only (`user_id = auth.uid()`) within user's tenants.
- Inventory product form (create mode only, `editId` null): "Guardar borrador" button, resume/discard banner, draft deleted after a successful create.
- Out of scope: drafts for editing existing products, other modules.

## Constraints

- Branch `feat/product-drafts` (based on `fix/product-form-duplicate-sku`, same form).
- Code/comments in English, UI strings in Spanish.
- agy writes code; Claude reviews diff and runs checks.

## TDD

Mode: off (no project/session config enables it). Runner: `npm run test:behavior` (node --test, regex assertions over source). Ordinary checks still run.

## Tasks

- [ ] T1 Migration `supabase/migrations/20261029000000_product_form_drafts.sql` + behavior test; apply to zyron.azokia.com after review. Route: delegated (agy).
- [ ] T2 renderer.js: draft save / load banner / resume / discard / clear on create + behavior test. Route: delegated (agy).

## Acceptance criteria

- Draft saved without required fields (SKU/name may be empty).
- Opening "Nuevo artículo" with an existing draft shows banner with item name/SKU and two buttons.
- "Seguir editando" fills the form from the draft; "Descartar borrador" deletes it.
- Successful create deletes the draft.
- Another user in the same tenant cannot read the draft (RLS).

## Checks

`npm run test:behavior` (4 pre-existing SQL test failures on main are known), `npx eslint --no-ignore renderer.js`, DB verification queries after applying migration.

## Progress

- Created 2026-10-29.

## Next step

T1.
