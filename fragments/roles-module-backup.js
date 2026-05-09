        const renderRolesModule = async () => {
            zyronLog('render:roles:start', { rolesContextTenantId: state.rolesContextTenantId, currentTenantId: state.currentTenantId });
            
            const isTenantAdmin = state.membership?.role_key === 'tenant_admin';
            if (!state.isSuperAdmin && !isTenantAdmin) {
                dashboardContent.innerHTML = `${renderModuleHeader('Roles', 'Acceso restringido')}
                    <div class="rounded-xl bg-surface-container-low p-1">
                        <div class="rounded-lg bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
                            Solo un <strong class="text-on-surface">administrador de empresa</strong> o superadministrador puede abrir este modulo.
                        </div>
                    </div>`;
                zyronLog('render:roles:forbidden', { role: state.membership?.role_key });
                return;
            }

            const effectiveTenantId = state.isSuperAdmin ? (state.rolesContextTenantId || state.currentTenantId) : state.currentTenantId;
            if (state.isSuperAdmin && !effectiveTenantId) {
                const { data: tenants } = await dbSelect({
                    table: 'tenants',
                    order: { column: 'display_name', ascending: true },
                    limit: 300
                });
                const opts = (tenants || [])
                    .map(
                        (t) =>
                            `<option value="${t.id}">${escapeHtml(String(t.display_name || t.legal_name || t.slug || t.id))}</option>`
                    )
                    .join('');
                dashboardContent.innerHTML = `
                    ${renderModuleHeader('Roles', 'Elige una empresa: los roles y permisos son por tenant (role_catalog).')}
                    <div class="rounded-xl bg-surface-container-low p-1">
                        <div class="rounded-lg bg-surface-container-lowest p-6 space-y-4">
                            <label class="block text-sm">
                                <span class="font-medium text-on-surface">Empresa</span>
                                <select id="roles-tenant-select" class="mt-2 w-full max-w-lg rounded-md border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm">
                                    <option value="">— Seleccionar —</option>
                                    ${opts}
                                </select>
                            </label>
                            <button type="button" id="roles-tenant-open" class="rounded-md bg-primary px-4 py-2 text-sm text-white">Abrir roles</button>
                        </div>
                    </div>`;
                document.getElementById('roles-tenant-open')?.addEventListener('click', async () => {
                    const v = document.getElementById('roles-tenant-select')?.value?.trim();
                    if (!v) {
                        window.alert('Selecciona una empresa.');
                        return;
                    }
                    state.rolesContextTenantId = v;
                    await renderRolesModule();
                });
                zyronLog('render:roles:picker', { tenantOptions: (tenants || []).length });
                return;
            }

            const { data: tenantRow } = await dbSelect({
                table: 'tenants',
                filters: [{ op: 'eq', column: 'id', value: effectiveTenantId }],
                limit: 1
            });
            const tenantLabel = escapeHtml((tenantRow && tenantRow[0] && (tenantRow[0].display_name || tenantRow[0].legal_name)) || effectiveTenantId);

            await ensureRolePresetsForTenant(effectiveTenantId);

            const [{ data: roles }, { data: permissionRows }, cntRes] = await Promise.all([
                dbSelect({
                    table: 'role_catalog',
                    filters: [{ op: 'eq', column: 'tenant_id', value: effectiveTenantId }],
                    order: { column: 'hierarchy_level', ascending: true }
                }),
                dbSelect({ table: 'permission_catalog' }),
                invokeFn('manage-super-access', { action: 'role_member_counts', tenantId: effectiveTenantId })
            ]);
            
            const permissionMap = new Map((permissionRows || []).map((perm) => [perm.id, perm.permission_key]));
            const cntU = unwrapFnInvoke(cntRes);
            const memberCounts = !cntU.err && cntU.data?.ok ? cntU.data.counts || {} : {};
            
            // Grouping logic for UI to match requested design
            const groupedPermissions = {
                'Customer': [],
                'Item': [],
                'TaxType': [],
                'Estimate': [],
                'Invoice': [],
                'RecurringInvoice': [],
                'Payment': [],
                'Expense': [],
                'CustomField': [],
                'ExchangeRateProvider': [],
                'Note': [],
                'Common': []
            };

            (permissionRows || []).forEach(p => {
                const key = p.permission_key;
                if (key.startsWith('customers.')) groupedPermissions['Customer'].push(p);
                else if (key.startsWith('products.')) groupedPermissions['Item'].push(p);
                else if (key.startsWith('fiscal.')) groupedPermissions['TaxType'].push(p);
                else if (key.startsWith('estimates.')) groupedPermissions['Estimate'].push(p);
                else if (key.startsWith('invoices.')) groupedPermissions['Invoice'].push(p);
                else if (key.startsWith('recurring.')) groupedPermissions['RecurringInvoice'].push(p);
                else if (key.startsWith('payments.')) groupedPermissions['Payment'].push(p);
                else if (key.startsWith('expenses.')) groupedPermissions['Expense'].push(p);
                else if (key.startsWith('custom_fields.')) groupedPermissions['CustomField'].push(p);
                else if (key.includes('exchange_rate')) groupedPermissions['ExchangeRateProvider'].push(p);
                else if (key.includes('notes')) groupedPermissions['Note'].push(p);
                else groupedPermissions['Common'].push(p);
            });

            const renderPermissionGrid = (roleId) => {
                return Object.entries(groupedPermissions).filter(([_, list]) => list.length > 0).map(([group, list]) => `
                    <div class="flex flex-col gap-2 min-w-[140px]">
                        <h5 class="text-[11px] font-bold text-on-surface-variant/70 uppercase tracking-tight border-b border-outline-variant/30 pb-1 mb-1">${group}</h5>
                        ${list.map(p => `
                            <label class="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" class="h-3.5 w-3.5 rounded border-outline/40 text-primary focus:ring-primary/20 cursor-pointer" data-role-perm-role="${roleId}" data-role-perm-key="${p.permission_key}" />
                                <span class="text-[11px] text-on-surface-variant group-hover:text-primary transition-colors leading-tight">${p.label}</span>
                            </label>
                        `).join('')}
                    </div>
                `).join('');
            };

            const countChips = Object.keys(memberCounts).length
                ? Object.entries(memberCounts)
                      .map(
                          ([k, v]) =>
                              `<span class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">${escapeHtml(k)}: ${Number(v)}</span>`
                      )
                      .join(' ')
                : '<span class="text-[10px] text-on-surface-variant">Sin miembros activos.</span>';

            dashboardContent.innerHTML = `
                ${renderModuleHeader('Roles', 'Define perfiles de acceso personalizados para tu equipo con granularidad total.')}
                <div class="mx-auto w-full max-w-7xl px-4 pb-12">
                    <div class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container-low px-6 py-4 shadow-sm">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2 text-sm text-on-surface-variant">
                                <span class="material-symbols-rounded text-base">domain</span>
                                Empresa: <strong class="text-on-surface">${tenantLabel}</strong>
                            </div>
                            <div class="flex wrap gap-1.5">${countChips}</div>
                        </div>
                        <div class="flex items-center gap-3">
                            <button type="button" id="roles-open-acceso" class="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors">
                                <span class="material-symbols-rounded text-base">group</span>
                                Membresías
                            </button>
                            ${state.isSuperAdmin ? `<button type="button" id="roles-change-tenant" class="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors">
                                <span class="material-symbols-rounded text-base">swap_horiz</span>
                                Cambiar empresa
                            </button>` : ''}
                            <button type="button" id="roles-create-btn" class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-white shadow-md hover:opacity-90 active:scale-95 transition-all">
                                <span class="material-symbols-rounded text-base">add</span>
                                Crear nuevo rol
                            </button>
                        </div>
                    </div>

                    <div id="roles-create-modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-scrim/40 p-4 hidden backdrop-blur-sm">
                        <div class="w-full max-w-5xl animate-in fade-in zoom-in-95 duration-200 rounded-2xl bg-surface-container-lowest shadow-2xl ring-1 ring-outline-variant/50 flex flex-col max-h-[90vh]">
                            <div class="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
                                <h3 class="text-lg font-bold text-primary flex items-center gap-2">
                                    <span class="material-symbols-rounded">shield_person</span>
                                    Añadir nuevo rol
                                </h3>
                                <button type="button" id="roles-create-cancel-top" class="rounded-full p-1.5 hover:bg-surface-container transition-colors">
                                    <span class="material-symbols-rounded">close</span>
                                </button>
                            </div>
                            
                            <div class="overflow-y-auto p-8 space-y-8 flex-1">
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <label class="block">
                                        <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Nombre del rol <span class="text-error">*</span></span>
                                        <input type="text" id="roles-new-label" placeholder="Ej: Vendedor Senior" class="mt-2 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 transition-shadow" />
                                    </label>
                                    <label class="block">
                                        <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider text-on-surface-variant">Copiar permisos de</span>
                                        <select id="roles-new-template" class="mt-2 w-full rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-4 py-3 text-sm">
                                            <option value="">— En blanco —</option>
                                            ${state.roleSystemPresetsResolved.map(p => `<option value="${p.role_key}">${p.label}</option>`).join('')}
                                        </select>
                                    </label>
                                </div>

                                <div>
                                    <div class="flex items-center justify-between border-b border-outline-variant/20 pb-2 mb-6">
                                        <h4 class="text-sm font-bold text-on-surface flex items-center gap-2">
                                            Permisos <span class="text-error text-xs">*</span>
                                        </h4>
                                        <div class="flex items-center gap-4">
                                            <button type="button" id="roles-new-select-all" class="text-xs font-bold text-primary hover:underline">Seleccionar todo</button>
                                            <span class="text-on-surface-variant/30 text-xs">/</span>
                                            <button type="button" id="roles-new-clear-all" class="text-xs font-bold text-on-surface-variant hover:underline">Ninguno</button>
                                        </div>
                                    </div>
                                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10" id="roles-new-perm-grid">
                                        ${renderPermissionGrid('new')}
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center justify-end gap-3 border-t border-outline-variant/30 bg-surface-container-low/30 px-6 py-4">
                                <button type="button" id="roles-create-cancel" class="rounded-xl px-6 py-2.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors">Cancelar</button>
                                <button type="button" id="roles-create-confirm" class="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-white shadow-lg hover:opacity-90 active:scale-95 transition-all">
                                    <span class="material-symbols-rounded text-lg">save</span>
                                    Guardar rol
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-6">
                        ${(roles || []).map((role) => `
                            <div class="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                                <div class="flex items-center justify-between bg-surface-container-low px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <div class="rounded-xl bg-primary/10 p-2 text-primary">
                                            <span class="material-symbols-rounded text-xl">account_circle</span>
                                        </div>
                                        <div>
                                            <div class="flex items-center gap-2">
                                                <h4 class="font-bold text-on-surface">${role.label}</h4>
                                                ${role.is_system ? '<span class="rounded-full bg-outline-variant/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-on-surface-variant">Sistema</span>' : ''}
                                            </div>
                                            <p class="text-[10px] font-mono text-on-surface-variant/80 uppercase tracking-tighter">${role.role_key} · Nivel ${role.hierarchy_level}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-6">
                                        <div class="flex items-center gap-3 border-r border-outline-variant/30 pr-6">
                                            <button type="button" class="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary-variant transition-colors" data-role-select-all="${role.id}">Seleccionar todo</button>
                                            <span class="text-on-surface-variant/20 text-[10px]">|</span>
                                            <button type="button" class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors" data-role-clear-all="${role.id}">Ninguno</button>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            ${!role.is_system ? `
                                                <button type="button" class="rounded-lg border border-error/20 p-2 text-error hover:bg-error/5 transition-colors" data-role-delete="${role.id}" title="Eliminar rol">
                                                    <span class="material-symbols-rounded text-lg">delete</span>
                                                </button>
                                            ` : ''}
                                            <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-on-surface px-4 py-2 text-xs font-bold text-surface transition-all active:scale-95" data-role-save="${role.id}">
                                                <span class="material-symbols-rounded text-base">check_circle</span>
                                                Guardar cambios
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 p-8 bg-white/50">
                                    ${renderPermissionGrid(role.id)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            // Navigation Handlers
            document.getElementById('roles-change-tenant')?.addEventListener('click', async () => {
                state.rolesContextTenantId = null;
                await renderRolesModule();
            });
            document.getElementById('roles-open-acceso')?.addEventListener('click', async () => {
                if (!state.superAccessUi) state.superAccessUi = { tab: 'platform', memTenantId: '', memEmailQ: '', memStatus: '', platformQ: '' };
                state.superAccessUi.tab = 'memberships';
                state.superAccessUi.memTenantId = effectiveTenantId;
                await openModule('acceso');
            });

            // Modal Logic
            const modal = document.getElementById('roles-create-modal');
            const openBtn = document.getElementById('roles-create-btn');
            const cancelBtn = document.getElementById('roles-create-cancel');
            const cancelTopBtn = document.getElementById('roles-create-cancel-top');
            const confirmBtn = document.getElementById('roles-create-confirm');

            const toggleModal = (show) => {
                modal?.classList.toggle('hidden', !show);
                if (show) document.getElementById('roles-new-label')?.focus();
            };

            openBtn?.addEventListener('click', () => toggleModal(true));
            [cancelBtn, cancelTopBtn].forEach(b => b?.addEventListener('click', () => toggleModal(false)));

            // New Role "Select All" logic
            document.getElementById('roles-new-select-all')?.addEventListener('click', () => {
                modal?.querySelectorAll('[data-role-perm-role="new"]').forEach(cb => cb.checked = true);
            });
            document.getElementById('roles-new-clear-all')?.addEventListener('click', () => {
                modal?.querySelectorAll('[data-role-perm-role="new"]').forEach(cb => cb.checked = false);
            });

            // Template cloning logic for new role
            document.getElementById('roles-new-template')?.addEventListener('change', (e) => {
                const templateKey = e.target.value;
                modal?.querySelectorAll('[data-role-perm-role="new"]').forEach(cb => cb.checked = false);
                if (!templateKey) return;
                
                const preset = state.roleSystemPresetsResolved.find(p => p.role_key === templateKey);
                if (preset && preset.permissions) {
                    preset.permissions.forEach(key => {
                        const cb = modal?.querySelector(`[data-role-perm-role="new"][data-role-perm-key="${key}"]`);
                        if (cb) cb.checked = true;
                    });
                }
            });

            confirmBtn?.addEventListener('click', async () => {
                const label = document.getElementById('roles-new-label')?.value?.trim();
                const level = 50; // Default custom level
                if (!label) return window.alert('Ingresa un nombre para el rol.');
                
                const roleKey = slugifyTenant(label).replace(/-/g, '_');
                const selectedKeys = Array.from(modal.querySelectorAll('[data-role-perm-role="new"]:checked'))
                    .map(cb => cb.getAttribute('data-role-perm-key'));

                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<span class="animate-spin material-symbols-rounded">sync</span> Guardando...';

                const { data: inserted, error: roleError } = await dbInsert({
                    table: 'role_catalog',
                    values: [{
                        tenant_id: effectiveTenantId,
                        role_key: roleKey,
                        label: label,
                        hierarchy_level: level,
                        is_system: false
                    }]
                });

                if (roleError) {
                    window.alert('Error al crear el rol: ' + (roleError.message || String(roleError)));
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = 'Guardar rol';
                    return;
                }

                if (inserted?.[0] && selectedKeys.length > 0) {
                    const { data: allPermissions } = await dbSelect({ table: 'permission_catalog' });
                    const permissionByKey = new Map((allPermissions || []).map((perm) => [perm.permission_key, perm.id]));
                    const payload = selectedKeys
                        .map(key => permissionByKey.get(key))
                        .filter(Boolean)
                        .map(permissionId => ({ role_id: inserted[0].id, permission_id: permissionId }));
                    
                    if (payload.length > 0) {
                        await dbInsert({ table: 'role_permissions', values: payload });
                    }
                }
                
                toggleModal(false);
                await renderRolesModule();
            });

            // Card Shortcut Handlers
            dashboardContent.querySelectorAll('[data-role-select-all]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-role-select-all');
                    dashboardContent.querySelectorAll(`[data-role-perm-role="${id}"]`).forEach(cb => cb.checked = true);
                });
            });
            dashboardContent.querySelectorAll('[data-role-clear-all]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-role-clear-all');
                    dashboardContent.querySelectorAll(`[data-role-perm-role="${id}"]`).forEach(cb => cb.checked = false);
                });
            });

            // Load Existing Permissions for Cards
            for (const role of roles || []) {
                const { data: assignedRows } = await dbSelect({
                    table: 'role_permissions',
                    filters: [{ op: 'eq', column: 'role_id', value: role.id }]
                });
                const assignedKeys = new Set((assignedRows || []).map((row) => permissionMap.get(row.permission_id)).filter(Boolean));
                dashboardContent.querySelectorAll(`[data-role-perm-role="${role.id}"]`).forEach((checkbox) => {
                    const key = checkbox.getAttribute('data-role-perm-key');
                    checkbox.checked = assignedKeys.has(key);
                });
            }

            // Save Permissions Handler
            dashboardContent.querySelectorAll('[data-role-save]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const roleId = button.getAttribute('data-role-save');
                    const selectedKeys = Array.from(dashboardContent.querySelectorAll(`[data-role-perm-role="${roleId}"]:checked`))
                        .map((checkbox) => checkbox.getAttribute('data-role-perm-key'));

                    button.disabled = true;
                    button.innerHTML = '<span class="animate-spin material-symbols-rounded text-xs">sync</span>';

                    const { data: existingRows } = await dbSelect({
                        table: 'role_permissions',
                        filters: [{ op: 'eq', column: 'role_id', value: roleId }]
                    });
                    for (const row of existingRows || []) {
                        await dbDelete({
                            table: 'role_permissions',
                            filters: [{ op: 'eq', column: 'id', value: row.id }]
                        });
                    }

                    const { data: allPermissions } = await dbSelect({ table: 'permission_catalog' });
                    const permissionByKey = new Map((allPermissions || []).map((perm) => [perm.permission_key, perm.id]));
                    const payload = selectedKeys
                        .map((key) => permissionByKey.get(key))
                        .filter(Boolean)
                        .map(permissionId => ({ role_id: roleId, permission_id: permissionId }));
                    if (payload.length > 0) {
                        await dbInsert({
                            table: 'role_permissions',
                            values: payload
                        });
                    }
                    
                    button.disabled = false;
                    button.innerHTML = '<span class="material-symbols-rounded text-base">check_circle</span> Guardado';
                    setTimeout(() => {
                        button.innerHTML = '<span class="material-symbols-rounded text-base">check_circle</span> Guardar cambios';
                    }, 2000);
                });
            });

            // Delete Role Handler
            dashboardContent.querySelectorAll('[data-role-delete]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const roleId = button.getAttribute('data-role-delete');
                    if (!window.confirm('¿Estás seguro de eliminar este rol personalizado?')) return;
                    
                    const { error } = await dbDelete({
                        table: 'role_catalog',
                        filters: [{ op: 'eq', column: 'id', value: roleId }]
                    });

                    if (error) {
                        window.alert('Error al eliminar: ' + (error.message || String(error)));
                    } else {
                        await renderRolesModule();
                    }
                });
            });

            zyronLog('render:roles:done', { roleCount: (roles || []).length });
        };
