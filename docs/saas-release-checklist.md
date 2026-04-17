# Zyron SaaS Release Checklist

## Security and Auth
- [ ] Login, signup, and password reset run only through `insforgeAPI.auth`.
- [ ] `admin@zyron.com` is present in `app_users` with `global_role=super_admin`.
- [ ] RLS policies are active in tenant-bound tables.

## Super Admin Operations
- [ ] Super admin can block/unblock tenants.
- [ ] Super admin can set tenant user limits (`max_users` and `allow_more_users`).
- [ ] Super admin can review and approve/reject access requests.
- [ ] Super admin can trigger password reset and delete users.

## Tenant Operations
- [ ] Tenant admin can add, suspend, and activate users inside the tenant.
- [ ] Tenant roles under `tenant_admin` can be created in `role_catalog`.
- [ ] Invoices can be created through `create-invoice-with-stock`.

## Core Data Domains
- [ ] Customers, products, warehouses, invoices, payments, and report exports tables exist.
- [ ] `inventory_kardex` records movements generated from invoicing.
- [ ] `audit_logs` captures critical actions.

## Realtime
- [ ] Realtime connection starts after login.
- [ ] Super admin subscribes to `super-admin:alerts`.
- [ ] Tenant users subscribe to `tenant:{tenantId}:alerts`.

## Smoke Validation
- [ ] Run `npm run qa:saas`.
- [ ] Start app with `npm run start`.
- [ ] Validate login for super admin and a tenant admin.
