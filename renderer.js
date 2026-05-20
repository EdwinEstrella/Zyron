const updateMaximizeIcon = (isMaximized) => {
    const maxIcon = document.getElementById('max-icon');
    const restoreIcon = document.getElementById('restore-icon');
    const maxBtn = document.getElementById('max-btn');
    if (!maxIcon || !restoreIcon || !maxBtn) return;
    if (isMaximized) {
        maxIcon.style.display = 'none';
        restoreIcon.style.display = 'block';
        maxBtn.setAttribute('aria-label', 'Restaurar');
    } else {
        maxIcon.style.display = 'block';
        restoreIcon.style.display = 'none';
        maxBtn.setAttribute('aria-label', 'Maximizar');
    }
};

if (window.electronAPI) {
    window.electronAPI.onWindowMaximized(updateMaximizeIcon);
    document.getElementById('min-btn').addEventListener('click', () => window.electronAPI.minimize());
    document.getElementById('max-btn').addEventListener('click', () => window.electronAPI.maximize());
    document.getElementById('close-btn').addEventListener('click', () => window.electronAPI.close());
}

const passwordInput = document.getElementById('password');
const togglePw = document.getElementById('toggle-password');
const pwIcon = document.getElementById('pw-icon');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const openRegisterLink = document.getElementById('open-register-link');
const backToLoginLink = document.getElementById('back-to-login-link');
const logoutBtn = document.getElementById('logout-btn');
const loginStatus = document.getElementById('login-status');
const registerStatus = document.getElementById('register-status');

const viewLogin = document.getElementById('view-login');
const viewRegister = document.getElementById('view-register');
const viewDashboard = document.getElementById('view-dashboard');
const sidebarNav = document.getElementById('sidebar-nav');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');
const sidebarModulesContainer = document.getElementById('sidebar-modules-mount');
const dashboardContent = document.getElementById('dashboard-content');
const titlebarTitleEl = document.getElementById('titlebar-title');
const dashboardAppHeader = document.getElementById('dashboard-app-header');

const sessionNoticeBanner = document.getElementById('session-notice-banner');

const DEFAULT_PERMISSION_UI = Object.freeze([
    { key: 'users.manage', label: 'Gestion de usuarios' },
    { key: 'roles.manage', label: 'Gestion de roles' },
    { key: 'billing.manage', label: 'Facturacion' },
    { key: 'estimates.manage', label: 'Gestion de presupuestos' },
    { key: 'inventory.manage', label: 'Inventario' },
    { key: 'reports.view', label: 'Reportes' },
    { key: 'fiscal.manage', label: 'Fiscal / cumplimiento' }
]);

const DEFAULT_NAV_SUPER = Object.freeze([
    { key: 'empresas', label: 'Empresas', icon: 'apartment' },
    { key: 'solicitudes', label: 'Solicitudes', icon: 'inbox' },
    { key: 'acceso', label: 'Acceso', icon: 'shield_person' },
    { key: 'roles', label: 'Roles', icon: 'admin_panel_settings' }
]);

const DEFAULT_NAV_TENANT = Object.freeze([
    { key: 'panel', label: 'Panel principal', icon: 'dashboard' },
    { key: 'facturas', label: 'Facturas', icon: 'receipt_long' },
    { key: 'presupuestos', label: 'Presupuestos', icon: 'request_quote' },
    { key: 'pagos', label: 'Pagos y cobros', icon: 'payments' },
    { key: 'inventario', label: 'Inventario', icon: 'inventory_2' },
    { key: 'clientes', label: 'Clientes', icon: 'groups' },
    { key: 'reportes', label: 'Reportes', icon: 'monitoring' },
    { key: 'config', label: 'Configuracion', icon: 'settings' }
]);

const DEFAULT_ROLE_SYSTEM_PRESETS = Object.freeze([
    {
        role_key: 'tenant_admin',
        label: 'Admin empresa',
        hierarchy_level: 10,
        permissions: DEFAULT_PERMISSION_UI.map((p) => p.key)
    },
    {
        role_key: 'manager',
        label: 'Gerente',
        hierarchy_level: 20,
        permissions: ['users.manage', 'billing.manage', 'estimates.manage', 'inventory.manage', 'reports.view', 'fiscal.manage']
    },
    {
        role_key: 'billing_agent',
        label: 'Facturacion',
        hierarchy_level: 30,
        permissions: ['billing.manage', 'estimates.manage', 'reports.view', 'fiscal.manage']
    },
    {
        role_key: 'inventory_agent',
        label: 'Inventario',
        hierarchy_level: 40,
        permissions: ['inventory.manage']
    },
    { role_key: 'viewer', label: 'Solo lectura', hierarchy_level: 50, permissions: ['reports.view'] }
]);

const getPermissionGroupLabel = (permissionKey = '') => {
    const root = String(permissionKey).split('.')[0] || '';
    return {
        users: 'User',
        roles: 'Role',
        customers: 'Customer',
        products: 'Item',
        invoices: 'Invoice',
        estimates: 'Estimate',
        payments: 'Payment',
        expenses: 'Expense',
        reports: 'Common',
        fiscal: 'TaxType',
        settings: 'Common',
        billing: 'Invoice',
        inventory: 'Item',
        recurring: 'RecurringInvoice',
        custom_fields: 'CustomField'
    }[root] || 'Common';
};

const buildPermissionCascadeMap = (permissionRows = []) => {
    const keys = new Set((permissionRows || []).map((p) => String(p.permission_key || p.key || '').trim()).filter(Boolean));
    const cascade = new Map();
    keys.forEach((key) => {
        const implied = new Set();
        if (key.endsWith('.manage')) {
            const viewKey = key.replace(/\.manage$/, '.view');
            if (keys.has(viewKey)) implied.add(viewKey);
        }
        cascade.set(key, [...implied]);
    });
    return cascade;
};

const buildPermissionDependentsMap = (cascadeMap) => {
    const dependents = new Map();
    (cascadeMap || new Map()).forEach((children, parent) => {
        (children || []).forEach((child) => {
            if (!dependents.has(child)) dependents.set(child, new Set());
            dependents.get(child).add(parent);
        });
    });
    return dependents;
};

const state = {
    sessionUser: null,
    appUser: null,
    membership: null,
    currentTenantId: null,
    isSuperAdmin: false,
    currentModule: 'panel',
    navModulesSuper: [...DEFAULT_NAV_SUPER],
    navModulesTenant: [...DEFAULT_NAV_TENANT],
    permissionRowsForUi: [...DEFAULT_PERMISSION_UI],
    roleSystemPresetsResolved: [...DEFAULT_ROLE_SYSTEM_PRESETS],
    permissionCascadeMap: buildPermissionCascadeMap(DEFAULT_PERMISSION_UI),
    permissionDependentsMap: buildPermissionDependentsMap(buildPermissionCascadeMap(DEFAULT_PERMISSION_UI)),
    facturasUi: { tab: 'list', openComposer: false },
    presupuestosUi: { openComposer: false },
    configUi: { tab: 'empresa' },
    pagosUi: { tab: 'payments' },
    reportesUi: { tab: 'sales', dateFrom: '', dateTo: '' },
    fiscalUi: { tab: 'general' },
    /** Contexto regional y aislamiento por empresa (multi-tenant). */
    tenantContext: { defaultCurrency: 'DOP', defaultLocale: 'es', priceDisplayCurrency: null },
    /** Preferencias operativas cargadas desde app_settings por empresa. */
    tenantPreferences: {
        version: 1,
        defaultModule: 'panel',
        interfaceDensity: 'comfortable',
        confirmBeforeIssue: true,
        autoOpenDocumentPreview: false,
        invoiceDueDays: 30,
        estimateExpiryDays: 15
    },
    membershipsList: [],
    /** Canal realtime suscrito para la empresa activa (desuscribir al cambiar workspace). */
    _rtTenantChannel: null,
    /** Estado resumido de realtime administrado por main.js. */
    realtimeStatus: { degraded: false, channels: [] },
    /** Super admin: modulo Acceso (cuentas, membresías, auditoría). */
    superAccessUi: { tab: 'platform', memTenantId: '', memEmailQ: '', memStatus: '', platformQ: '' },
    clientesUi: {
        tab: 'list',
        q: '',
        segmentId: '',
        includeInactive: false,
        sheet: null,
        editId: null,
        historyCustomerId: null
    },
    inventarioUi: {
        section: 'catalog',
        tab: 'list',
        q: '',
        categoryId: '',
        itemKind: '',
        includeInactive: false,
        sheet: null,
        editId: null,
        invWarehouseId: '',
        kardexWarehouseId: '',
        kardexProductId: ''
    },
    /** Solo superadmin: tenant elegido en modulo Roles (no muta currentTenantId del panel tenant). */
    rolesContextTenantId: null
};

const isTenantPendingApproval = () =>
    Boolean(state.appUser && !state.isSuperAdmin && String(state.appUser.status || '').toLowerCase() === 'pending');

/** Claves `tenant_memberships.role_key` → etiqueta humana (no confundir con `app_users.global_role`). */
const TENANT_ROLE_LABELS = Object.freeze({
    tenant_admin: 'Administrador de empresa',
    manager: 'Gerente',
    billing_agent: 'Facturación / cobros',
    inventory_agent: 'Inventario',
    viewer: 'Solo lectura'
});

const formatGlobalRoleForUi = (globalRole) => {
    const g = String(globalRole || 'user').toLowerCase();
    if (g === 'super_admin') return 'Superadmin de plataforma';
    return 'Usuario de plataforma';
};

const formatTenantRolePrimary = (membership) => {
    if (!membership) return '';
    const key = String(membership.role_key || '').toLowerCase();
    const label = TENANT_ROLE_LABELS[key] || membership.role_key || 'Miembro del equipo';
    const owner = Boolean(membership.is_owner);
    if (key === 'tenant_admin' && owner) return `${label} · dueño`;
    return label;
};

/** Texto para chip de cabecera y badge de módulos: separa rol en empresa vs tipo de cuenta. */
const getSessionRolePresentation = () => {
    if (state.isSuperAdmin) {
        return {
            primary: 'Superadmin',
            secondary: 'Operación global (no es un rol dentro de una empresa)',
            title: 'global_role: super_admin'
        };
    }
    const tenantLine = formatTenantRolePrimary(state.membership);
    const plat = formatGlobalRoleForUi(state.appUser?.global_role);
    if (!tenantLine) {
        return {
            primary: 'Sin empresa activa',
            secondary: `${plat}: aún no tienes membresía a un tenant, o no se cargó.`,
            title: `global_role: ${state.appUser?.global_role || 'user'} · sin tenant_memberships activa`
        };
    }
    return {
        primary: tenantLine,
        secondary: `${plat} — el rol de arriba es el de tu empresa.`,
        title: `global_role: ${state.appUser?.global_role || 'user'} · empresa: ${state.membership?.role_key || ''}${state.membership?.is_owner ? ' (dueño)' : ''}`
    };
};

const refreshSessionRoleUi = () => {
    const wrap = document.getElementById('session-role-chip-wrap');
    const elP = document.getElementById('session-role-chip-primary');
    const elS = document.getElementById('session-role-chip-secondary');
    if (!wrap || !elP || !elS) return;
    if (isTenantPendingApproval() || !state.appUser) {
        wrap.classList.add('hidden');
        wrap.removeAttribute('title');
        elP.textContent = '';
        elS.textContent = '';
        return;
    }
    const pr = getSessionRolePresentation();
    wrap.classList.remove('hidden');
    elP.textContent = pr.primary;
    elS.textContent = pr.secondary;
    wrap.setAttribute('title', pr.title || '');
};

/** Usuarios y Roles solo existen en navegacion superadmin; nunca en menu tenant (ni por BD). */
const filterTenantNavForRole = (modules) => {
    if (!Array.isArray(modules)) return [];
    const superOnly = new Set(['acceso', 'roles', 'solicitudes', 'empresas']);
    return modules.filter((m) => !superOnly.has(m.key));
};

const updateSessionNoticeBanner = () => {
    if (!sessionNoticeBanner) return;
    if (state.realtimeStatus?.degraded && state.appUser && !isTenantPendingApproval()) {
        const primary = state.realtimeStatus.channels.find((ch) => ch.degraded || ch.status === 'degraded') || {};
        const retryAt = primary.nextRetryAt ? new Date(primary.nextRetryAt) : null;
        const retryText = retryAt && !Number.isNaN(retryAt.getTime())
            ? `Proximo reintento automatico: ${retryAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
            : 'Reintentando automaticamente.';
        sessionNoticeBanner.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between';
        const copy = document.createElement('div');
        copy.innerHTML = `
            <strong class="block text-on-surface">Realtime en modo degradado</strong>
            <span class="text-on-surface-variant">La app sigue funcionando; los eventos criticos se encolan y se sincronizan cuando vuelva la conexion. ${retryText}</span>
        `;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.dataset.action = 'retry-realtime';
        retry.dataset.channel = primary.channel || state._rtTenantChannel || '';
        retry.className = 'btn-secondary self-start whitespace-nowrap px-3 py-2 text-xs sm:self-center';
        retry.textContent = 'Reintentar ahora';
        retry.disabled = !retry.dataset.channel;
        wrap.append(copy, retry);
        sessionNoticeBanner.append(wrap);
        sessionNoticeBanner.classList.remove('hidden');
        return;
    }
    sessionNoticeBanner.innerHTML = '';
    sessionNoticeBanner.classList.add('hidden');
};

sessionNoticeBanner?.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-action="retry-realtime"]');
    if (!button || button.disabled) return;
    const channel = button.dataset.channel || state._rtTenantChannel;
    if (!channel) return;
    button.disabled = true;
    button.textContent = 'Reintentando...';
    await safeCall(() => window.insforgeAPI.realtime.retry(channel), `realtime.retry:${channel}`);
    button.textContent = 'Reintentar ahora';
    updateSessionNoticeBanner();
});

togglePw.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    pwIcon.textContent = show ? 'visibility_off' : 'visibility';
    togglePw.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

const setStatus = (el, message, isError = false) => {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    el.classList.toggle('form-status--error', isError);
};

const clearStatus = (el) => {
    if (!el) return;
    el.classList.add('hidden');
    el.textContent = '';
    el.classList.remove('form-status--error');
};

const hideAllViews = () => {
    viewLogin.classList.add('hidden');
    viewRegister.classList.add('hidden');
    viewDashboard.classList.add('hidden');
};

const sessionDisplayName = () => {
    const u = state.appUser;
    if (!u) return '';
    const name = String(u.full_name || '').trim();
    if (name) return name;
    const email = String(u.email || '').trim();
    if (email) return email.split('@')[0] || email;
    const authMail = String(state.sessionUser?.email || '').trim();
    if (authMail) return authMail.split('@')[0] || authMail;
    return 'Usuario';
};

const updateTitlebarAndDocumentTitle = () => {
    if (!titlebarTitleEl) return;
    if (!state.appUser) {
        titlebarTitleEl.textContent = 'Zyron';
        refreshSessionRoleUi();
        return;
    }
    const who = sessionDisplayName();
    titlebarTitleEl.textContent = `Zyron — ${who}`;
    refreshSessionRoleUi();
};

const showLogin = () => {
    hideAllViews();
    viewLogin.classList.remove('hidden');
    document.title = 'Zyron | Acceder';
    if (titlebarTitleEl) titlebarTitleEl.textContent = 'Zyron';
    refreshSessionRoleUi();
    sidebarNav?.classList.remove('hidden');
    sidebarToggleBtn?.classList.remove('pointer-events-none', 'opacity-40');
    dashboardAppHeader?.classList.remove('hidden');
};

const showRegister = () => {
    hideAllViews();
    viewRegister.classList.remove('hidden');
    document.title = 'Zyron | Registrarse';
    if (titlebarTitleEl) titlebarTitleEl.textContent = 'Zyron';
    sidebarNav?.classList.remove('hidden');
    sidebarToggleBtn?.classList.remove('pointer-events-none', 'opacity-40');
    dashboardAppHeader?.classList.remove('hidden');
};

const showDashboard = () => {
    hideAllViews();
    viewDashboard.classList.remove('hidden');
    const who = sessionDisplayName();
    if (isTenantPendingApproval()) {
        document.title = 'Zyron | Pendiente de aprobacion';
    } else {
        document.title = state.isSuperAdmin ? `Zyron — ${who} | Super Admin` : `Zyron — ${who} | Panel`;
    }
    updateTitlebarAndDocumentTitle();
    if (!isTenantPendingApproval()) {
        updateSessionNoticeBanner();
        renderTenantContextBar();
    } else if (sessionNoticeBanner) {
        sessionNoticeBanner.classList.add('hidden');
        sessionNoticeBanner.textContent = '';
    }
    if (dashboardAppHeader) {
        if (isTenantPendingApproval()) dashboardAppHeader.classList.add('hidden');
        else dashboardAppHeader.classList.remove('hidden');
    }
};

const updateSidebarToggleState = () => {
    const isCollapsed = sidebarNav.classList.contains('hidden');
    sidebarToggleIcon.textContent = isCollapsed ? 'menu' : 'menu_open';
    const label = isCollapsed ? 'Mostrar barra lateral' : 'Ocultar barra lateral';
    sidebarToggleBtn.setAttribute('aria-label', label);
    sidebarToggleBtn.setAttribute('title', label);
};

const toDateString = (value) => {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleDateString(getTenantDateLocale());
    } catch (_) {
        return String(value);
    }
};

/** Consola DevTools: localStorage zyron_quiet=1 silencia zyronLog y el trafico IPC exitoso en safeCall. */
const isZyronQuiet = () => {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('zyron_quiet') === '1';
    } catch (_) {
        return false;
    }
};

const zyronLog = (tag, detail) => {
    if (isZyronQuiet()) return;
    try {
        console.log(`[Zyron:${tag}]`, detail);
    } catch (_) {
        console.log(`[Zyron:${tag}]`, String(detail));
    }
};

const summarizeInsforgeResult = (result) => {
    if (result == null) return { result: 'null' };
    if (result.error) return { error: result.error?.message || result.error };
    const d = result.data;
    if (d == null) return { data: null };
    if (Array.isArray(d)) {
        if (d.length > 400) return { dataRows: d.length, sample: 'large_array' };
        return { dataRows: d.length, sample: d[0] ? Object.keys(d[0]).slice(0, 8) : [] };
    }
    if (typeof d === 'object') {
        const keys = Object.keys(d);
        if (keys.length > 40) return { dataKeys: keys.length, note: 'large_object' };
        return { dataKeys: keys.slice(0, 15) };
    }
    return { dataType: typeof d, preview: String(d).slice(0, 120) };
};

const safeCall = async (handler, debugLabel = 'ipc') => {
    const quiet = isZyronQuiet();
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!quiet) console.log(`[Zyron:ipc:>>] ${debugLabel}`);
    try {
        const result = await handler();
        const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
        if (result && typeof result === 'object' && result.error) {
            const quietRealtimeDegraded = debugLabel.startsWith('realtime.') && result.error.realtimeDegraded;
            if (quietRealtimeDegraded) zyronLog('safeCall:realtimeDegraded', { label: debugLabel, error: result.error });
            else console.warn(`[Zyron:ipc:!!] ${debugLabel} (${ms}ms)`, result.error, summarizeInsforgeResult(result));
            if (result.error.reauthRequired || result.error.code === 'AUTH_RELOGIN_REQUIRED') {
                await handleSessionExpired(result.error);
            }
        } else if (!quiet) {
            console.log(`[Zyron:ipc:<<] ${debugLabel} (${ms}ms)`, summarizeInsforgeResult(result));
        }
        return result;
    } catch (error) {
        const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : 0;
        console.error(`[Zyron:ipc:XX] ${debugLabel} (${ms}ms)`, error);
        zyronLog('safeCall:exception', { label: debugLabel, message: error.message || String(error) });
        return { data: null, error: { message: error.message || String(error) } };
    }
};

const handleSessionExpired = async (error = {}) => {
    zyronLog('auth:sessionExpired', { code: error.code, message: error.message });
    state.sessionUser = null;
    state.appUser = null;
    state.membership = null;
    state.membershipsList = [];
    state.currentTenantId = null;
    state.isSuperAdmin = false;
    state._rtTenantChannel = null;
    state.realtimeStatus = { degraded: false, channels: [] };
    showLogin();
    setStatus(loginStatus, error.message || 'Tu sesion expiro. Vuelve a iniciar sesion para continuar.', true);
};

window.insforgeAPI?.auth?.onSessionExpired?.((payload) => {
    void handleSessionExpired(payload || {});
});

window.insforgeAPI?.realtime?.onStatusChanged?.((payload) => {
    const channels = Array.isArray(payload?.channels) ? payload.channels : [];
    state.realtimeStatus = {
        degraded: Boolean(payload?.error || channels.some((ch) => ch.degraded || ch.status === 'degraded')),
        channels
    };
    updateSessionNoticeBanner();
});

window.insforgeAPI?.realtime?.onDomainEvent?.((event) => {
    zyronLog('realtime:domainEvent', event);
    if (!state.appUser || isTenantPendingApproval()) return;
    void openModule(state.currentModule, { skipHistory: true, replaceHistory: true });
});

const dbSelect = (payload) =>
    safeCall(
        () => window.insforgeAPI.database.select(enforceTenantScopeOnSelect(payload)),
        `db.select:${payload?.table || '?'}${payload?.filters?.length ? `:f${payload.filters.length}` : ''}`
    );
const dbInsert = (payload) =>
    safeCall(
        () => {
            const scoped = enforceTenantScopeOnInsert(payload);
            const values = Array.isArray(scoped?.values) ? scoped.values : [scoped?.values].filter(Boolean);
            return window.insforgeAPI.database.insert({ ...scoped, values });
        },
        `db.insert:${payload?.table || '?'}`
    );
const dbUpdate = (payload) =>
    safeCall(
        () => window.insforgeAPI.database.update(enforceTenantScopeOnMutate(payload)),
        `db.update:${payload?.table || '?'}`
    );
const dbDelete = (payload) =>
    safeCall(
        () => window.insforgeAPI.database.delete(enforceTenantScopeOnMutate(payload)),
        `db.delete:${payload?.table || '?'}`
    );
const dbRpc = (functionName, args = {}) =>
    safeCall(() => window.insforgeAPI.database.rpc({ functionName, args }), `db.rpc:${functionName}`);
const invokeFn = (slug, body = {}, method = 'POST') => {
    let b = body;
    if (body && typeof body === 'object' && !state.isSuperAdmin && state.currentTenantId) {
        const tid = body.tenantId;
        if (tid != null && String(tid) !== String(state.currentTenantId)) {
            zyronLog('invokeFn:tenantIdCoerced', { slug, requested: tid, enforced: state.currentTenantId });
            b = { ...body, tenantId: state.currentTenantId };
        }
    }
    return safeCall(() => window.insforgeAPI.functions.invoke({ slug, body: b, method }), `fn:${method || 'POST'}:${slug}`);
};

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/** Outlet principal (#dashboard-content): feedback inmediato al cambiar de modulo. */
const paintDashboardSkeleton = (moduleKey) => {
    if (!dashboardContent) return;
    const label =
        {
            panel: 'Panel',
            empresas: 'Empresas',
            solicitudes: 'Solicitudes',
            acceso: 'Acceso',
            usuarios: 'Usuarios',
            roles: 'Roles',
            facturas: 'Facturas',
            presupuestos: 'Presupuestos',
            fiscal: 'Fiscal',
            inventario: 'Inventario',
            clientes: 'Clientes',
            pagos: 'Pagos',
            reportes: 'Reportes',
            config: 'Configuracion'
        }[moduleKey] || 'Modulo';
    dashboardContent.innerHTML = `
        <div class="mx-auto flex w-full max-w-7xl flex-col gap-8" aria-busy="true" data-zyron-skeleton="1">
            <div class="space-y-2">
                <div class="h-7 w-44 max-w-[55%] animate-pulse rounded-md bg-outline-variant/25"></div>
                <div class="h-4 w-72 max-w-[85%] animate-pulse rounded-md bg-outline-variant/18"></div>
                <p class="text-xs text-on-surface-variant">${escapeHtml(label)} — cargando…</p>
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div class="h-24 animate-pulse rounded-xl bg-outline-variant/15 sm:col-span-1"></div>
                <div class="h-24 animate-pulse rounded-xl bg-outline-variant/15 sm:col-span-1"></div>
                <div class="h-24 animate-pulse rounded-xl bg-outline-variant/15 sm:col-span-1"></div>
                <div class="h-56 animate-pulse rounded-xl bg-outline-variant/12 sm:col-span-3"></div>
            </div>
        </div>`;
};

/** Modulos validos en ?view= (patron Nexo / portal). */
const ZYRON_VIEW_KEYS = new Set([
    'panel',
    'empresas',
    'solicitudes',
    'acceso',
    'usuarios',
    'roles',
    'facturas',
    'presupuestos',
    'fiscal',
    'inventario',
    'clientes',
    'pagos',
    'reportes',
    'config'
]);

/** Fragmento HTML inicial del outlet (mismo archivo por ahora; se puede trocear como Nexo). */
const ZYRON_MODULE_FRAGMENTS = {
    panel: 'fragments/outlet-skeleton.html',
    empresas: 'fragments/outlet-skeleton.html',
    solicitudes: 'fragments/outlet-skeleton.html',
    acceso: 'fragments/outlet-skeleton.html',
    usuarios: 'fragments/outlet-skeleton.html',
    roles: 'fragments/outlet-skeleton.html',
    facturas: 'fragments/outlet-skeleton.html',
    presupuestos: 'fragments/outlet-skeleton.html',
    fiscal: 'fragments/outlet-skeleton.html',
    inventario: 'fragments/outlet-skeleton.html',
    clientes: 'fragments/outlet-skeleton.html',
    pagos: 'fragments/outlet-skeleton.html',
    reportes: 'fragments/outlet-skeleton.html',
    config: 'fragments/outlet-skeleton.html'
};

const zyronModuleLabel = (moduleKey) =>
    (
        {
            panel: 'Panel',
            empresas: 'Empresas',
            solicitudes: 'Solicitudes',
            acceso: 'Acceso',
            usuarios: 'Usuarios',
            roles: 'Roles',
            facturas: 'Facturas',
            presupuestos: 'Presupuestos',
            fiscal: 'Fiscal',
            inventario: 'Inventario',
            clientes: 'Clientes',
            pagos: 'Pagos',
            reportes: 'Reportes',
            config: 'Configuracion'
        }[moduleKey] || 'Modulo'
    );

const getZyronViewFromUrl = () => {
    try {
        const v = new URL(window.location.href).searchParams.get('view');
        if (v && ZYRON_VIEW_KEYS.has(v)) return v;
    } catch (_) {
        /* */
    }
    return null;
};

const paintOutletFromFragment = async (moduleKey) => {
    if (!dashboardContent) return;
    const fragmentUrl = ZYRON_MODULE_FRAGMENTS[moduleKey] || 'fragments/outlet-skeleton.html';
    try {
        const res = await fetch(fragmentUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const html = await res.text();
        dashboardContent.innerHTML = html;
        const lab = dashboardContent.querySelector('[data-zyron-module-label]');
        if (lab) lab.textContent = zyronModuleLabel(moduleKey);
    } catch (e) {
        zyronLog('fragment:outlet:fallback', { moduleKey, message: e?.message || String(e) });
        paintDashboardSkeleton(moduleKey);
    }
};

const unwrapFnInvoke = (result) => {
    if (result?.error) return { err: result.error.message || String(result.error), data: null };
    let d = result?.data;
    if (d == null) return { err: null, data: null };
    if (typeof d === 'string') {
        try {
            d = JSON.parse(d);
        } catch (_) {
            return { err: 'Respuesta de funcion no es JSON valido', data: null };
        }
    }
    return { err: d?.error ? String(d.error) : null, data: d };
};

const loadActiveMembershipsDetailed = async (appUserId) => {
    if (!appUserId) return [];
    const { data: mems, error } = await dbSelect({
        table: 'tenant_memberships',
        filters: [
            { op: 'eq', column: 'app_user_id', value: appUserId },
            { op: 'eq', column: 'status', value: 'active' }
        ]
    });
    if (error || !mems?.length) return [];
    const out = [];
    for (const m of mems) {
        const { data: tr } = await dbSelect({
            table: 'tenants',
            filters: [{ op: 'eq', column: 'id', value: m.tenant_id }],
            limit: 1
        });
        out.push({ ...m, tenant: tr?.[0] || null });
    }
    return out;
};

const ZYRON_TENANT_CONTEXT_KEY = 'zyron_tenant_context';
const ZYRON_TENANT_PREFERENCES_KEY = 'zyron_preferences';
const defaultTenantContextObj = () => ({
    version: 1,
    defaultCurrency: 'DOP',
    defaultLocale: 'es',
    priceDisplayCurrency: null
});
const defaultTenantPreferencesObj = () => ({
    version: 1,
    defaultModule: 'panel',
    interfaceDensity: 'comfortable',
    confirmBeforeIssue: true,
    autoOpenDocumentPreview: false,
    invoiceDueDays: 30,
    estimateExpiryDays: 15
});
const clampPreferenceDays = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(365, Math.trunc(n)));
};
const parseTenantContextRaw = (raw) => {
    if (!raw || typeof raw !== 'string') return defaultTenantContextObj();
    try {
        const j = JSON.parse(raw);
        if (!j || typeof j !== 'object') return defaultTenantContextObj();
        return { ...defaultTenantContextObj(), ...j };
    } catch (_) {
        return defaultTenantContextObj();
    }
};
const parseTenantPreferencesRaw = (raw) => {
    if (!raw || typeof raw !== 'string') return defaultTenantPreferencesObj();
    try {
        const j = JSON.parse(raw);
        if (!j || typeof j !== 'object') return defaultTenantPreferencesObj();
        const next = { ...defaultTenantPreferencesObj(), ...j };
        if (!['panel', 'facturas', 'presupuestos', 'pagos', 'clientes', 'inventario', 'reportes'].includes(next.defaultModule)) {
            next.defaultModule = 'panel';
        }
        if (!['comfortable', 'compact'].includes(next.interfaceDensity)) next.interfaceDensity = 'comfortable';
        next.confirmBeforeIssue = next.confirmBeforeIssue !== false;
        next.autoOpenDocumentPreview = next.autoOpenDocumentPreview === true;
        next.invoiceDueDays = clampPreferenceDays(next.invoiceDueDays, 30);
        next.estimateExpiryDays = clampPreferenceDays(next.estimateExpiryDays, 15);
        return next;
    } catch (_) {
        return defaultTenantPreferencesObj();
    }
};

/** get_context vía dbSelect (misma fuente que manage-tenant-context en edge). */
const loadTenantContext = async (tenantId) => {
    if (!tenantId || state.isSuperAdmin) {
        state.tenantContext = { defaultCurrency: 'DOP', defaultLocale: 'es', priceDisplayCurrency: null };
        return;
    }
    const { data: rows, error } = await dbSelect({
        table: 'app_settings',
        filters: [
            { op: 'eq', column: 'tenant_id', value: tenantId },
            { op: 'eq', column: 'setting_key', value: ZYRON_TENANT_CONTEXT_KEY }
        ],
        limit: 1
    });
    if (error || !rows?.length) {
        state.tenantContext = { defaultCurrency: 'DOP', defaultLocale: 'es', priceDisplayCurrency: null };
        return;
    }
    const rawVal = rows[0]?.setting_value ?? rows[0]?.value ?? '';
    const c = parseTenantContextRaw(typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal || {}));
    const cur = String(c.defaultCurrency || 'DOP').toUpperCase();
    state.tenantContext = {
        defaultCurrency: /^[A-Z]{3}$/.test(cur) ? cur : 'DOP',
        defaultLocale: c.defaultLocale === 'en' ? 'en' : 'es',
        priceDisplayCurrency:
            c.priceDisplayCurrency && /^[A-Z]{3}$/.test(String(c.priceDisplayCurrency).toUpperCase())
                ? String(c.priceDisplayCurrency).toUpperCase()
                : null
    };
};

const applyTenantPreferencesToDom = () => {
    document.documentElement?.setAttribute('data-interface-density', state.tenantPreferences?.interfaceDensity || 'comfortable');
};

const loadTenantPreferences = async (tenantId) => {
    if (!tenantId || state.isSuperAdmin) {
        state.tenantPreferences = defaultTenantPreferencesObj();
        applyTenantPreferencesToDom();
        return state.tenantPreferences;
    }
    const prefRes = await fetchTenantPreferencesViaDb(tenantId);
    state.tenantPreferences = prefRes.data?.preferences || defaultTenantPreferencesObj();
    applyTenantPreferencesToDom();
    return state.tenantPreferences;
};

const switchWorkspaceTenant = async (tenantId) => {
    const row = state.membershipsList.find((m) => String(m.tenant_id) === String(tenantId));
    if (!row) return;
    if (state._rtTenantChannel) {
        await safeCall(() => window.insforgeAPI.realtime.unsubscribe(state._rtTenantChannel), 'realtime.unsubscribe:tenant');
        state._rtTenantChannel = null;
    }
    state.currentTenantId = row.tenant_id;
    state.membership = row;
    try {
        localStorage.setItem(LAST_TENANT_KEY, String(row.tenant_id));
    } catch (_) {
        /* */
    }
    const ch = `tenant:${row.tenant_id}:domain-events`;
    await safeCall(() => window.insforgeAPI.realtime.subscribe(ch), `realtime.subscribe:${ch}`);
    state._rtTenantChannel = ch;
    await loadTenantContext(row.tenant_id);
    await loadTenantPreferences(row.tenant_id);
    await loadUiCatalogsFromDb();
    await renderSidebar();
    renderTenantContextBar();
    refreshSessionRoleUi();
    updateSessionNoticeBanner();
    await paintOutletFromFragment(state.currentModule);
    await openModule(state.currentModule, { skipHistory: true });
};

const renderTenantContextBar = () => {
    const mount = document.getElementById('tenant-context-mount');
    if (!mount) return;
    if (state.isSuperAdmin || isTenantPendingApproval() || !state.currentTenantId) {
        mount.classList.add('hidden');
        mount.innerHTML = '';
        return;
    }
    mount.classList.remove('hidden');
    const tn = state.membershipsList.find((m) => String(m.tenant_id) === String(state.currentTenantId));
    const label = tn?.tenant?.display_name || tn?.tenant?.legal_name || state.currentTenantId;
    const cur = state.tenantContext?.defaultCurrency || 'DOP';
    const loc = (state.tenantContext?.defaultLocale || 'es').toUpperCase();
    const sw =
        state.membershipsList.length > 1
            ? `<label class="sr-only" for="tenant-workspace-select">${tr('iso.switch')}</label><select id="tenant-workspace-select" class="max-w-[220px] rounded-md border border-outline-variant/50 bg-surface-container-lowest px-2 py-1 text-xs font-medium">${state.membershipsList
                  .map(
                      (m) =>
                          `<option value="${escapeHtml(String(m.tenant_id))}" ${
                              String(m.tenant_id) === String(state.currentTenantId) ? 'selected' : ''
                          }>${escapeHtml(String(m.tenant?.display_name || m.tenant?.legal_name || m.tenant_id))}</option>`
                  )
                  .join('')}</select>`
            : `<span class="max-w-[180px] truncate text-xs font-semibold text-on-surface" title="${escapeHtml(String(state.currentTenantId))}">${escapeHtml(
                  String(label)
              )}</span>`;
    mount.innerHTML = `<div class="flex flex-wrap items-center gap-2 rounded-md border border-outline-variant/40 bg-surface-container-lowest/90 px-2 py-1.5 text-xs">
        <span class="shrink-0 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">${tr('iso.workspace')}</span>
        ${sw}
        <span class="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary" title="${tr('iso.currency')}">${escapeHtml(cur)}</span>
        <span class="shrink-0 rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-[10px]" title="${tr('iso.locale')}">${escapeHtml(loc)}</span>
    </div>`;
    document.getElementById('tenant-workspace-select')?.addEventListener('change', async (e) => {
        const v = e.target.value;
        if (v && String(v) !== String(state.currentTenantId)) await switchWorkspaceTenant(v);
    });
};

const loadUiCatalogsFromDb = async () => {
    const { data: navRows, error: navErr } = await dbSelect({
        table: 'app_navigation_modules',
        filters: [{ op: 'eq', column: 'is_active', value: true }],
        order: { column: 'sort_order', ascending: true }
    });
    if (navErr || !navRows?.length) {
        zyronLog('loadUiCatalogs:nav:fallback', { err: navErr?.message });
        state.navModulesSuper = [...DEFAULT_NAV_SUPER];
        state.navModulesTenant = [...DEFAULT_NAV_TENANT];
    } else {
        const toMod = (r) => ({ key: r.module_key, label: r.label, icon: r.icon });
        const sup = navRows.filter((r) => r.scope === 'super_admin').map(toMod);
        const ten = navRows.filter((r) => r.scope === 'tenant').map(toMod);
        state.navModulesSuper = sup.length ? sup : [...DEFAULT_NAV_SUPER];
        state.navModulesTenant = ten.length ? ten : [...DEFAULT_NAV_TENANT];
    }

    const { data: permRows, error: permErr } = await dbSelect({
        table: 'permission_catalog',
        order: { column: 'permission_key', ascending: true }
    });
    if (permErr || !permRows?.length) {
        zyronLog('loadUiCatalogs:perm:fallback', { err: permErr?.message });
        state.permissionRowsForUi = [...DEFAULT_PERMISSION_UI];
    } else {
        state.permissionRowsForUi = permRows.map((p) => ({
            key: p.permission_key,
            label: p.label || p.description || p.permission_key
        }));
    }
    state.permissionCascadeMap = buildPermissionCascadeMap(permRows?.length ? permRows : state.permissionRowsForUi);
    state.permissionDependentsMap = buildPermissionDependentsMap(state.permissionCascadeMap);

    const { data: presetRows, error: presetErr } = await dbSelect({
        table: 'role_system_presets',
        filters: [{ op: 'eq', column: 'is_active', value: true }],
        order: { column: 'sort_order', ascending: true }
    });
    if (presetErr || !presetRows?.length) {
        zyronLog('loadUiCatalogs:presets:fallback', { err: presetErr?.message });
        state.roleSystemPresetsResolved = [...DEFAULT_ROLE_SYSTEM_PRESETS];
    } else {
        state.roleSystemPresetsResolved = presetRows.map((r) => ({
            role_key: r.role_key,
            label: r.label,
            hierarchy_level: r.hierarchy_level,
            permissions: Array.isArray(r.permission_keys) ? r.permission_keys : []
        }));
    }
};

const normalizeRpcRows = (data) => {
    if (data == null) return [];
    return Array.isArray(data) ? data : [data];
};

const APP_USER_STATUS_LABEL = {
    pending: 'Pendiente (falta aprobar solicitud)',
    approved: 'Aprobado',
    active: 'Activo',
    inactive: 'Inactivo (pago / bloqueo)',
    suspended: 'Inactivo (pago / bloqueo)',
    blocked: 'Bloqueado'
};
const formatAppUserStatus = (status) => APP_USER_STATUS_LABEL[String(status || '').toLowerCase()] || status || '-';

const REQUEST_STATUS_LABEL = {
    pending: 'Pendiente',
    approved: 'Aprobada',
    rejected: 'Rechazada'
};
const formatRequestStatus = (status) => REQUEST_STATUS_LABEL[String(status || '').toLowerCase()] || status || '-';
const normalizeAccessRequestRow = (row) => {
    const payload = row?.request_payload && typeof row.request_payload === 'object' ? row.request_payload : {};
    return {
        ...row,
        requested_email: row?.requested_email || row?.email || payload.email || '',
        request_status: row?.request_status || row?.status || payload.status || 'pending',
        username: row?.username || payload.username || row?.full_name || '',
        full_name: row?.full_name || payload.full_name || row?.username || '',
        company_name: row?.company_name || payload.company_name || '',
        phone: row?.phone || payload.phone || '',
        notes: row?.notes || payload.notes || ''
    };
};
const normalizeAccessRequestRows = (rows) => (rows || []).map(normalizeAccessRequestRow);

const loadAppUsersSuperOrFallback = async () => {
    console.log('[Zyron:loadAppUsersSuperOrFallback] start');
    const [{ data: rpcData, error: rpcError }, { data: tableRows, error: tableError }] = await Promise.all([
        dbRpc('super_admin_list_app_users', {}),
        dbSelect({ table: 'app_users', order: { column: 'created_at', ascending: false } })
    ]);
    const direct = Array.isArray(tableRows) ? tableRows : [];
    const byId = new Map(direct.map((u) => [String(u.id), u]));
    const byEmail = new Map(direct.map((u) => [String(u.email || '').trim().toLowerCase(), u]));
    const rpcOk = !rpcError && rpcData != null;
    const rpcRows = rpcOk ? normalizeRpcRows(rpcData) : [];
    if (rpcRows.length > 0 && direct.length > 0) {
        const merged = rpcRows.map((u) => {
            const live =
                byId.get(String(u.id)) || byEmail.get(String(u.email || '').trim().toLowerCase());
            if (!live) {
                zyronLog('loadAppUsersSuperOrFallback:noLiveRow', {
                    rpcId: u.id,
                    rpcEmail: u.email
                });
                return u;
            }
            const rpcSt = String(u.status || '').toLowerCase();
            const liveSt = String(live.status || '').toLowerCase();
            if (rpcSt !== liveSt) {
                zyronLog('loadAppUsersSuperOrFallback:statusMismatch', {
                    id: u.id,
                    idRpc: String(u.id),
                    idLive: String(live.id),
                    email: u.email,
                    rpcStatus: u.status,
                    tableStatus: live.status
                });
            }
            return { ...u, ...live, status: live.status };
        });
        zyronLog('loadAppUsersSuperOrFallback:merged', { rpc: rpcRows.length, table: direct.length });
        console.log('[Zyron:loadAppUsersSuperOrFallback] end', { count: merged.length, source: 'merged' });
        return merged;
    }
    if (rpcRows.length > 0) {
        zyronLog('loadAppUsersSuperOrFallback:rpcOnly', { count: rpcRows.length, tableError: tableError?.message });
        console.log('[Zyron:loadAppUsersSuperOrFallback] end', { count: rpcRows.length, source: 'rpcOnly' });
        return rpcRows;
    }
    zyronLog('loadAppUsersSuperOrFallback:tableOnly', {
        count: direct.length,
        rpcError: rpcError?.message || rpcError
    });
    const out = direct;
    console.log('[Zyron:loadAppUsersSuperOrFallback] end', { count: out.length });
    return out;
};

const loadAccessRequestsSuperOrFallback = async () => {
    console.log('[Zyron:loadAccessRequestsSuperOrFallback] start');
    const { data, error } = await dbRpc('super_admin_list_user_access_requests', {});
    if (!error && data != null) {
        const rows = normalizeAccessRequestRows(normalizeRpcRows(data));
        zyronLog('loadAccessRequestsSuperOrFallback:rpc', { count: rows.length });
        console.log('[Zyron:loadAccessRequestsSuperOrFallback] end', { count: rows.length, source: 'rpc' });
        return rows;
    }
    zyronLog('loadAccessRequestsSuperOrFallback:fallback', { error: error?.message || error });
    const { data: rows } = await dbSelect({ table: 'user_access_requests', order: { column: 'created_at', ascending: false } });
    const out = normalizeAccessRequestRows(rows || []);
    console.log('[Zyron:loadAccessRequestsSuperOrFallback] end', { count: out.length, source: 'table' });
    return out;
};

const loadMyActiveMembershipsOrFallback = async (appUserId) => {
    console.log('[Zyron:loadMyActiveMembershipsOrFallback] start', { appUserId });
    const { data, error } = await dbRpc('zyron_my_active_memberships', {});
    if (!error && data != null) {
        const rows = normalizeRpcRows(data);
        zyronLog('loadMyActiveMembershipsOrFallback:rpc', { count: rows.length });
        console.log('[Zyron:loadMyActiveMembershipsOrFallback] end', { count: rows.length, source: 'rpc' });
        return { data: rows, error: null };
    }
    zyronLog('loadMyActiveMembershipsOrFallback:fallback', { error: error?.message || error });
    const fb = await dbSelect({
        table: 'tenant_memberships',
        filters: [
            { op: 'eq', column: 'app_user_id', value: appUserId },
            { op: 'eq', column: 'status', value: 'active' }
        ],
        limit: 1
    });
    const n = Array.isArray(fb?.data) ? fb.data.length : fb?.data ? 1 : 0;
    console.log('[Zyron:loadMyActiveMembershipsOrFallback] end', { count: n, source: 'table', error: fb?.error });
    return fb;
};

const patchAppUserStatusAfterApprove = async (requestedEmail) => {
    const emailNorm = String(requestedEmail || '').trim().toLowerCase();
    if (!emailNorm) {
        zyronLog('patchAppUserAfterApprove:skipNoEmail', {});
        return { ok: false };
    }
    const { data: rows, error: selErr } = await dbSelect({
        table: 'app_users',
        filters: [{ op: 'eq', column: 'email', value: emailNorm }],
        limit: 1
    });
    if (selErr || !rows?.length) {
        zyronLog('patchAppUserAfterApprove:selectFailed', { emailNorm, selErr });
        return { ok: false, error: selErr };
    }
    const row = rows[0];
    const st = String(row.status || '').toLowerCase();
    if (st === 'approved' || st === 'active') {
        zyronLog('patchAppUserAfterApprove:already', { id: row.id, status: row.status });
        return { ok: true };
    }
    let { data: updated, error: upErr } = await dbUpdate({
        table: 'app_users',
        values: { status: 'approved' },
        filters: [{ op: 'eq', column: 'id', value: row.id }]
    });
    if (upErr || !updated?.length) {
        zyronLog('patchAppUserAfterApprove:retryActive', { emailNorm, upErr });
        const second = await dbUpdate({
            table: 'app_users',
            values: { status: 'active' },
            filters: [{ op: 'eq', column: 'id', value: row.id }]
        });
        updated = second.data;
        upErr = second.error;
    }
    zyronLog('patchAppUserAfterApprove:done', {
        id: row.id,
        error: upErr?.message || upErr,
        returned: updated?.length
    });
    return { ok: Boolean(updated?.length), error: upErr };
};

const slugifyTenant = (value) => {
    const base = String(value || 'empresa')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 42);
    return base || `empresa-${Date.now().toString(36)}`;
};

const approveAccessRequestViaDb = async (requestId, action) => {
    const { data: reqRows, error: reqErr } = await dbSelect({
        table: 'user_access_requests',
        filters: [{ op: 'eq', column: 'id', value: requestId }],
        limit: 1
    });
    if (reqErr || !reqRows?.length) return { data: null, error: reqErr || { message: 'Solicitud no encontrada.' } };
    const req = normalizeAccessRequestRow(reqRows[0]);
    const now = new Date().toISOString();
    if (action === 'reject') {
        const upd = await dbUpdate({
            table: 'user_access_requests',
            values: {
                status: 'rejected',
                request_status: 'rejected',
                updated_at: now,
                reviewed_by: state.appUser?.id || null
            },
            filters: [{ op: 'eq', column: 'id', value: requestId }]
        });
        return upd.error ? { data: null, error: upd.error } : { data: { ok: true, action: 'reject' }, error: null };
    }
    if (action !== 'approve') return { data: null, error: { message: 'Accion invalida.' } };
    const email = String(req.requested_email || '').trim().toLowerCase();
    if (!email) return { data: null, error: { message: 'La solicitud no tiene correo.' } };

    let { data: appRows } = await dbSelect({
        table: 'app_users',
        filters: [{ op: 'eq', column: 'email', value: email }],
        limit: 1
    });
    let appUser = appRows?.[0] || null;
    if (!appUser) {
        const ins = await dbInsert({
            table: 'app_users',
            values: [
                {
                    email,
                    full_name: req.full_name || req.username || email.split('@')[0],
                    global_role: 'user',
                    status: 'active'
                }
            ]
        });
        if (ins.error || !ins.data?.length) return { data: null, error: ins.error || { message: 'No se pudo crear app_user.' } };
        appUser = ins.data[0];
    } else {
        const upd = await dbUpdate({
            table: 'app_users',
            values: {
                full_name: appUser.full_name || req.full_name || req.username || email.split('@')[0],
                global_role: 'user',
                status: 'active',
                updated_at: now
            },
            filters: [{ op: 'eq', column: 'id', value: appUser.id }]
        });
        if (upd.error) return { data: null, error: upd.error };
        appUser = upd.data?.[0] || appUser;
    }

    const slug = `${slugifyTenant(req.company_name)}-${Date.now().toString(36)}`;
    const ten = await dbInsert({
        table: 'tenants',
        values: [
            {
                slug,
                display_name: req.company_name || 'Empresa',
                legal_name: req.company_name || 'Empresa',
                email,
                status: 'active',
                created_by: appUser.id
            }
        ]
    });
    if (ten.error || !ten.data?.length) return { data: null, error: ten.error || { message: 'No se pudo crear empresa.' } };
    const tenant = ten.data[0];

    const mem = await dbInsert({
        table: 'tenant_memberships',
        values: [
            {
                tenant_id: tenant.id,
                app_user_id: appUser.id,
                role_key: 'tenant_admin',
                status: 'active',
                is_owner: true
            }
        ]
    });
    if (mem.error) return { data: null, error: mem.error };

    const reqUpd = await dbUpdate({
        table: 'user_access_requests',
        values: { status: 'approved', request_status: 'approved', reviewed_by: state.appUser?.id || null, updated_at: now },
        filters: [{ op: 'eq', column: 'id', value: requestId }]
    });
    if (reqUpd.error) return { data: null, error: reqUpd.error };
    await appendAuditLogSafe(tenant.id, 'access_request_approved', 'user_access_requests', requestId, {
        email,
        app_user_id: appUser.id,
        tenant_id: tenant.id
    });
    return { data: { ok: true, tenant, appUser }, error: null };
};

const runApproveAccessRequest = async (requestId, action, requestedEmail = null) => {
    if (!requestId) {
        window.alert('Solicitud invalida.');
        return { error: { message: 'Missing requestId' } };
    }
    zyronLog('approveAccessRequest', { requestId, action, requestedEmail });
    const res = await invokeFn('approve-access-request', { requestId, action });
    console.log('[Zyron:approveAccessRequest:raw]', summarizeInsforgeResult(res));
    if (res.error) {
        zyronLog('approveAccessRequest:error', res.error);
        const fallback = await approveAccessRequestViaDb(requestId, action);
        if (fallback.error) {
            window.alert(
                fallback.error.message ||
                    res.error.message ||
                    'No se pudo completar la accion. Revisa que la funcion approve-access-request este desplegada.'
            );
            return fallback;
        }
        window.alert(action === 'approve' ? 'Solicitud aprobada desde base de datos.' : 'Solicitud rechazada.');
        return fallback;
    }
    const body = res.data;
    if (body && typeof body === 'object' && body.ok !== true && body.error) {
        const msg = typeof body.error === 'string' ? body.error : body.error?.message || String(body.error);
        zyronLog('approveAccessRequest:bodyError', body);
        window.alert(msg || 'La funcion respondio con error.');
        return { data: null, error: { message: msg } };
    }
    console.log('[Zyron:approveAccessRequest:okBody]', body);
    if (action === 'approve' && requestedEmail) {
        const patch = await patchAppUserStatusAfterApprove(requestedEmail);
        if (!patch.ok) {
            console.warn('[Zyron:approveAccessRequest] app_users no se pudo actualizar desde el cliente; revisa RLS.', patch);
        }
    }
    window.alert(
        action === 'approve'
            ? 'Solicitud aprobada: empresa creada y usuario en estado Aprobado. La fila sale de solicitudes pendientes. Para cobros usa Suspender / Reactivar en Usuarios del sistema.'
            : 'Solicitud rechazada.'
    );
    return res;
};

const REMEMBER_EMAIL_KEY = 'zyron_remember_email';
const REMEMBER_PASSWORD_KEY = 'zyron_remember_password';
const LAST_TENANT_KEY = 'zyron_last_tenant_id';

/** Tablas de negocio que deben filtrarse siempre por tenant_id en sesion de usuario empresa. */
const TENANT_SCOPED_TABLES = new Set([
    'invoices',
    'invoice_items',
    'customers',
    'customer_segments',
    'products',
    'app_settings',
    'audit_logs',
    'invoice_series',
    'invoice_recurrence_templates',
    'tenant_fiscal_settings',
    'tax_rates_catalog',
    'ncf_sequences',
    'role_catalog',
    'payments',
    'payment_methods_catalog',
    'payment_allocations',
    'payment_reminder_log',
    'payment_gateway_events',
    'warehouses',
    'inventory_kardex',
    'product_categories',
    'measurement_units',
    'customer_segment_members',
    'custom_report_definitions',
    'report_exports'
]);

const ZYRON_I18N = Object.freeze({
    es: {
        'nav.panel': 'Panel principal',
        'nav.invoices': 'Facturas',
        'nav.estimates': 'Presupuestos',
        'nav.payments': 'Pagos y cobros',
        'nav.inventory': 'Inventario',
        'nav.customers': 'Clientes',
        'nav.reports': 'Reportes',
        'nav.fiscal': 'Fiscal',
        'nav.config': 'Configuracion',
        'iso.switch': 'Empresa activa',
        'iso.currency': 'Moneda',
        'iso.locale': 'Idioma',
        'iso.saveRegional': 'Guardar regional',
        'iso.saved': 'Preferencias regionales guardadas.',
        'iso.regionalTitle': 'Regional (moneda e idioma)',
        'iso.regionalSub': 'Formato de numeros y textos de navegacion. Los datos siguen filtrados por empresa.',
        'iso.workspace': 'Espacio de trabajo'
    },
    en: {
        'nav.panel': 'Dashboard',
        'nav.invoices': 'Invoices',
        'nav.estimates': 'Estimates',
        'nav.payments': 'Payments',
        'nav.inventory': 'Inventory',
        'nav.customers': 'Customers',
        'nav.reports': 'Reports',
        'nav.fiscal': 'Tax / compliance',
        'nav.config': 'Settings',
        'iso.switch': 'Active company',
        'iso.currency': 'Currency',
        'iso.locale': 'Language',
        'iso.saveRegional': 'Save regional settings',
        'iso.saved': 'Regional preferences saved.',
        'iso.regionalTitle': 'Regional (currency & language)',
        'iso.regionalSub': 'Number format and navigation labels. Data remains tenant-scoped.',
        'iso.workspace': 'Workspace'
    }
});

const NAV_LABEL_KEYS = Object.freeze({
    panel: 'nav.panel',
    facturas: 'nav.invoices',
    presupuestos: 'nav.estimates',
    pagos: 'nav.payments',
    inventario: 'nav.inventory',
    clientes: 'nav.customers',
    reportes: 'nav.reports',
    fiscal: 'nav.fiscal',
    config: 'nav.config'
});

const tr = (key) => {
    const loc = state.tenantContext?.defaultLocale === 'en' ? 'en' : 'es';
    const pack = ZYRON_I18N[loc] || ZYRON_I18N.es;
    return pack[key] || ZYRON_I18N.es[key] || key;
};

const getTenantNumberLocale = () => (state.tenantContext?.defaultLocale === 'en' ? 'en-US' : 'es-DO');
const getTenantDateLocale = () => (state.tenantContext?.defaultLocale === 'en' ? 'en-US' : 'es-DO');

const enforceTenantScopeOnSelect = (payload) => {
    if (!payload?.table || state.isSuperAdmin || !state.currentTenantId) return payload;
    if (!TENANT_SCOPED_TABLES.has(String(payload.table))) return payload;
    const filters = Array.isArray(payload.filters) ? [...payload.filters] : [];
    const cleaned = filters.filter((f) => !(String(f.column) === 'tenant_id' && String(f.op) === 'eq'));
    cleaned.push({ op: 'eq', column: 'tenant_id', value: state.currentTenantId });
    return { ...payload, filters: cleaned };
};

const enforceTenantScopeOnMutate = (payload) => {
    if (!payload?.table || state.isSuperAdmin || !state.currentTenantId) return payload;
    if (!TENANT_SCOPED_TABLES.has(String(payload.table))) return payload;
    const filters = Array.isArray(payload.filters) ? [...payload.filters] : [];
    const cleaned = filters.filter((f) => !(String(f.column) === 'tenant_id' && String(f.op) === 'eq'));
    cleaned.push({ op: 'eq', column: 'tenant_id', value: state.currentTenantId });
    return { ...payload, filters: cleaned };
};

const enforceTenantScopeOnInsert = (payload) => {
    if (!payload?.table || state.isSuperAdmin || !state.currentTenantId) return payload;
    if (!TENANT_SCOPED_TABLES.has(String(payload.table)) || payload.values == null) return payload;
    const vals = Array.isArray(payload.values) ? payload.values : [payload.values];
    const next = vals.map((v) => (v && typeof v === 'object' ? { ...v, tenant_id: state.currentTenantId } : v));
    return { ...payload, values: next };
};

const applyRememberedCredentials = () => {
    try {
        const emailField = document.getElementById('email');
        const rememberField = loginForm?.querySelector('input[name="remember"]');
        const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
        const savedPassword = localStorage.getItem(REMEMBER_PASSWORD_KEY);
        if (emailField && savedEmail) emailField.value = savedEmail;
        if (passwordInput && savedPassword) passwordInput.value = savedPassword;
        if (rememberField && savedEmail && savedPassword) rememberField.checked = true;
    } catch (_) {
        /* ignore */
    }
};

applyRememberedCredentials();

const upsertAppUser = async (authUser) => {
    const normalizedEmail = String(authUser.email || '').toLowerCase();
    zyronLog('upsertAppUser:start', { authUserId: authUser.id, email: normalizedEmail });
    const { data: existingRows, error: selectError } = await dbSelect({
        table: 'app_users',
        filters: [{ op: 'eq', column: 'auth_user_id', value: authUser.id }],
        limit: 1
    });
    if (selectError) {
        zyronLog('upsertAppUser:selectError', selectError);
        return { appUser: null, error: selectError };
    }

    if (existingRows && existingRows.length > 0) {
        const current = existingRows[0];
        zyronLog('upsertAppUser:existing', { id: current.id, status: current.status, global_role: current.global_role });
        return { appUser: current, error: null };
    }

    const { data: emailRows, error: emailSelectError } = await dbSelect({
        table: 'app_users',
        filters: [{ op: 'eq', column: 'email', value: normalizedEmail }],
        limit: 1
    });
    if (emailSelectError) {
        zyronLog('upsertAppUser:emailSelectError', emailSelectError);
        return { appUser: null, error: emailSelectError };
    }
    if (emailRows && emailRows.length > 0) {
        const current = emailRows[0];
        if (!current.auth_user_id) {
            const { data: claimedRows, error: claimError } = await dbUpdate({
                table: 'app_users',
                values: { auth_user_id: authUser.id, updated_at: new Date().toISOString() },
                filters: [{ op: 'eq', column: 'id', value: current.id }]
            });
            if (claimError) {
                zyronLog('upsertAppUser:claimByEmailError', claimError);
                return { appUser: null, error: claimError };
            }
            const claimed = claimedRows?.[0] || { ...current, auth_user_id: authUser.id };
            zyronLog('upsertAppUser:claimedByEmail', {
                id: claimed.id,
                status: claimed.status,
                global_role: claimed.global_role
            });
            return { appUser: claimed, error: null };
        }
        zyronLog('upsertAppUser:emailAlreadyLinked', {
            id: current.id,
            auth_user_id: current.auth_user_id,
            loginAuthUserId: authUser.id
        });
        return {
            appUser: null,
            error: { message: 'Este correo ya esta vinculado a otro usuario de autenticacion.' }
        };
    }

    zyronLog('upsertAppUser:insertPath', { reason: 'no_row_for_auth_user', authUserId: authUser.id });
    const { data: insertedRows, error: insertError } = await dbInsert({
        table: 'app_users',
        values: [{
            auth_user_id: authUser.id,
            email: normalizedEmail,
            full_name: authUser.profile?.name || normalizedEmail.split('@')[0],
            global_role: 'user',
            status: 'pending'
        }]
    });
    if (insertError) zyronLog('upsertAppUser:insertError', insertError);
    else zyronLog('upsertAppUser:insertOk', { id: insertedRows?.[0]?.id });
    return { appUser: insertedRows && insertedRows[0], error: insertError };
};

const bootstrapSession = async () => {
    zyronLog('bootstrapSession:start', {});
    const { data: currentUserData, error: userError } = await safeCall(
        () => window.insforgeAPI.auth.getCurrentUser(),
        'auth.getCurrentUser'
    );
    if (userError || !currentUserData?.user) {
        zyronLog('bootstrapSession:noAuthUser', { userError: userError?.message });
        const out = { ok: false, message: null };
        console.warn('[Zyron:bootstrapSession:return]', out);
        return out;
    }

    const { appUser, error: appUserError } = await upsertAppUser(currentUserData.user);
    if (appUserError || !appUser) {
        zyronLog('bootstrapSession:appUserFailed', { appUserError: appUserError?.message || appUserError, hasAppUser: Boolean(appUser) });
        const out = {
            ok: false,
            message: 'No se pudo cargar tu perfil de aplicacion. Si acabas de registrarte, espera un momento e intenta de nuevo.'
        };
        console.warn('[Zyron:bootstrapSession:return]', out);
        return out;
    }

    state.sessionUser = currentUserData.user;
    state.appUser = appUser;
    state.isSuperAdmin = appUser.global_role === 'super_admin';
    zyronLog('bootstrapSession:appUser', { id: appUser.id, status: appUser.status, isSuperAdmin: state.isSuperAdmin });

    const accountStatus = String(appUser.status || '').toLowerCase();
    const pendingGate = !state.isSuperAdmin && accountStatus === 'pending';

    if (!state.isSuperAdmin) {
        const blockedAccountStatuses = ['suspended', 'inactive', 'blocked'];
        if (blockedAccountStatuses.includes(accountStatus)) {
            zyronLog('bootstrapSession:accountBlocked', { status: appUser.status });
            await safeCall(() => window.insforgeAPI.auth.signOut(), 'auth.signOut:blockedAccount');
            const out = {
                ok: false,
                message:
                    'Tu cuenta no esta disponible para usar la aplicacion (servicio suspendido o inactivo). Si crees que es un error, contacta al administrador.'
            };
            console.warn('[Zyron:bootstrapSession:return]', out);
            return out;
        }

        if (pendingGate) {
            state.membership = null;
            state.currentTenantId = null;
            zyronLog('bootstrapSession:pendingGate', { appUserId: appUser.id });
        } else {
            state.membershipsList = await loadActiveMembershipsDetailed(appUser.id);
            let pick = state.membershipsList[0] || null;
            if (state.membershipsList.length > 0) {
                let saved = null;
                try {
                    saved = localStorage.getItem(LAST_TENANT_KEY);
                } catch (_) {
                    /* */
                }
                if (saved && state.membershipsList.some((m) => String(m.tenant_id) === String(saved))) {
                    pick = state.membershipsList.find((m) => String(m.tenant_id) === String(saved)) || pick;
                }
            }
            if (pick) {
                state.membership = pick;
                state.currentTenantId = pick.tenant_id;
                try {
                    localStorage.setItem(LAST_TENANT_KEY, String(pick.tenant_id));
                } catch (_) {
                    /* */
                }
                zyronLog('bootstrapSession:tenant', {
                    tenantId: state.currentTenantId,
                    workspaces: state.membershipsList.length
                });
            } else {
                state.membership = null;
                state.currentTenantId = null;
                state.membershipsList = [];
                zyronLog('bootstrapSession:noActiveTenant', { appUserStatus: appUser.status });
            }
            await loadTenantContext(state.currentTenantId);
            await loadTenantPreferences(state.currentTenantId);
        }
    } else {
        state.membership = null;
        state.currentTenantId = null;
        state.membershipsList = [];
        await loadTenantPreferences(null);
    }

    if (!pendingGate) {
        void (async () => {
            await safeCall(() => window.insforgeAPI.realtime.connect(), 'realtime.connect');
            if (state.isSuperAdmin) {
                await safeCall(() => window.insforgeAPI.realtime.subscribe('super-admin:alerts'), 'realtime.subscribe:super-admin');
            } else if (state.currentTenantId) {
                const ch = `tenant:${state.currentTenantId}:domain-events`;
                await safeCall(() => window.insforgeAPI.realtime.subscribe(ch), `realtime.subscribe:${ch}`);
                state._rtTenantChannel = ch;
            }
        })();
    }

    await loadUiCatalogsFromDb();
    await renderSidebar();
    showDashboard();
    if (pendingGate) {
        await renderPendingApprovalScreen();
        zyronLog('bootstrapSession:success', { module: 'pending-gate' });
    } else {
        const firstSuper = state.navModulesSuper[0]?.key || 'empresas';
        const defaultMod = state.isSuperAdmin ? firstSuper : state.tenantPreferences?.defaultModule || 'panel';
        const urlView = getZyronViewFromUrl();
        const target = urlView || defaultMod;
        void openModule(target, { replaceHistory: true });
        zyronLog('bootstrapSession:success', { module: target, fromUrl: Boolean(urlView) });
    }
    const bootOk = { ok: true, message: null };
    zyronLog('bootstrapSession:return', bootOk);
    console.log('[Zyron:bootstrapSession:return]', bootOk);
    return bootOk;
};

const renderPendingApprovalScreen = async () => {
    zyronLog('render:pendingGate', { appUserId: state.appUser?.id });
    state.currentModule = 'pending-gate';
    sidebarToggleBtn?.classList.add('pointer-events-none', 'opacity-40');
    refreshSidebarSelection();
    dashboardContent.innerHTML = `
        <div class="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-6 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-10 text-center">
            <span class="material-symbols-outlined text-5xl text-primary/80" aria-hidden="true">hourglass_top</span>
            <div>
                <h2 class="text-xl font-bold text-primary">Cuenta pendiente de aprobacion</h2>
                <p class="mt-3 text-sm text-on-surface-variant leading-relaxed">
                    Tu registro fue recibido. Un administrador debe aprobar tu solicitud antes de que puedas ver el panel y los modulos de la aplicacion.
                </p>
            </div>
            <button type="button" id="pending-gate-logout" class="rounded-lg border border-outline-variant/50 bg-surface-container px-5 py-2.5 text-sm font-semibold text-primary hover:bg-surface-container-high">
                Cerrar sesion
            </button>
        </div>
    `;
    const gateBtn = document.getElementById('pending-gate-logout');
    if (gateBtn) gateBtn.addEventListener('click', () => performLogout());
};

const renderSidebar = async () => {
    zyronLog('render:sidebar', {
        isSuperAdmin: state.isSuperAdmin,
        currentModule: state.currentModule,
        pendingGate: isTenantPendingApproval()
    });
    if (!sidebarModulesContainer) return;
    sidebarModulesContainer.innerHTML = '';
    if (isTenantPendingApproval()) {
        refreshSidebarSelection();
        return;
    }
    const allowedModules = state.isSuperAdmin
        ? state.navModulesSuper
        : filterTenantNavForRole(state.navModulesTenant).filter((module) => module.key !== 'fiscal');
    for (const module of allowedModules) {
        const link = document.createElement('a');
        link.className = `nav-module ${module.key === state.currentModule ? 'is-active' : ''}`;
        link.href = '#';
        link.dataset.module = module.key;
        if (module.key === state.currentModule) {
            link.setAttribute('aria-current', 'page');
        }
        const navKey = NAV_LABEL_KEYS[module.key];
        const labelText = navKey ? tr(navKey) : module.label;
        link.innerHTML = `
            <span class="material-symbols-outlined text-[20px] shrink-0">${module.icon}</span>
            <span>${escapeHtml(labelText)}</span>
        `;
        link.addEventListener('click', (event) => {
            event.preventDefault();
            void openModule(module.key);
        });
        sidebarModulesContainer.appendChild(link);
    }
};

const refreshSidebarSelection = () => {
    document.querySelectorAll('.nav-module[data-module]').forEach((el) => {
        if (el.dataset.module === state.currentModule) {
            el.classList.add('is-active');
            el.setAttribute('aria-current', 'page');
        } else {
            el.classList.remove('is-active');
            el.removeAttribute('aria-current');
        }
    });
};

const renderModuleHeader = (title, subtitle) => {
    const rp = getSessionRolePresentation();
    return `
    <div class="flex flex-col justify-between gap-4 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-5 sm:flex-row sm:items-center">
        <div>
            <h2 class="text-2xl font-bold tracking-tight text-primary">${title}</h2>
            <p class="mt-1 text-sm text-on-surface-variant">${subtitle}</p>
        </div>
    </div>
`;
};

const fmtMoneyPanel = (n, currencyCode = null) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '-';
    const cur =
        currencyCode ||
        state.tenantContext?.priceDisplayCurrency ||
        state.tenantContext?.defaultCurrency ||
        'DOP';
    const c = String(cur).toUpperCase();
    try {
        return new Intl.NumberFormat(getTenantNumberLocale(), {
            style: 'currency',
            currency: /^[A-Z]{3}$/.test(c) ? c : 'DOP',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(x);
    } catch (_) {
        return `${x.toFixed(2)} ${c}`;
    }
};

const renderPanelModule = async () => {
    zyronLog('render:panel:start', { isSuperAdmin: state.isSuperAdmin, tenantId: state.currentTenantId });
    if (state.isSuperAdmin) {
        dashboardContent.innerHTML = `<div class="flex flex-col gap-6" id="super-panel-root"></div>`;
        const root = document.getElementById('super-panel-root');
        const inv = await invokeFn('get-super-admin-overview', {}, 'GET');
        zyronLog('render:panel:overviewResponse', summarizeInsforgeResult(inv));
        const overview = inv.data;
        if (!overview?.metrics || !root) {
            zyronLog('render:panel:noMetrics', { hasOverview: Boolean(overview) });
            if (root) {
                root.innerHTML = `${renderModuleHeader('Panel', 'Super admin')}<p class="text-sm text-on-surface-variant">No se pudo cargar el resumen global. Comprueba que la funcion get-super-admin-overview este desplegada.</p>`;
            }
            return;
        }
        const m = overview.metrics;
        root.innerHTML = `
            ${renderModuleHeader('Panel', 'Indicadores globales del SaaS')}
            <div class="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
                <h3 class="text-sm font-bold text-primary mb-3">Centro de control super admin</h3>
                <div class="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
                    <div class="rounded-md bg-surface-container-lowest p-3"><div class="text-xs text-on-surface-variant">Empresas</div><div class="text-xl font-bold text-primary">${m.totalTenants}</div></div>
                    <div class="rounded-md bg-surface-container-lowest p-3"><div class="text-xs text-on-surface-variant">Usuarios</div><div class="text-xl font-bold text-primary">${m.totalUsers}</div></div>
                    <div class="rounded-md bg-surface-container-lowest p-3"><div class="text-xs text-on-surface-variant">Solicitudes</div><div class="text-xl font-bold text-primary">${m.pendingRequests}</div></div>
                    <div class="rounded-md bg-surface-container-lowest p-3"><div class="text-xs text-on-surface-variant">Empresas bloqueadas</div><div class="text-xl font-bold text-primary">${m.blockedTenants}</div></div>
                </div>
                <div class="mt-4 flex flex-wrap gap-2 border-t border-outline-variant/30 pt-4">
                    <button type="button" id="super-panel-acceso" class="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white">Control de acceso</button>
                    <button type="button" id="super-panel-empresas" class="rounded-md border border-outline-variant/50 px-3 py-2 text-xs font-semibold text-primary">Empresas</button>
                    <button type="button" id="super-panel-roles" class="rounded-md border border-outline-variant/50 px-3 py-2 text-xs font-semibold text-primary">Roles por empresa</button>
                </div>
            </div>
        `;
        document.getElementById('super-panel-acceso')?.addEventListener('click', () => {
            void openModule('acceso');
        });
        document.getElementById('super-panel-empresas')?.addEventListener('click', () => {
            void openModule('empresas');
        });
        document.getElementById('super-panel-roles')?.addEventListener('click', () => {
            void openModule('roles');
        });
        zyronLog('render:panel:done', { metrics: m });
        return;
    }

    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader('Panel principal', 'Sin empresa activa')}<p class="text-sm text-on-surface-variant mt-2">Cuando tengas una membresia aprobada, aqui veras facturas y stock recientes.</p>`;
        return;
    }

    const [{ data: invSlice }, { data: estimateRows }, { data: payRows }, { data: prodRows }, { data: customerRows }] = await Promise.all([
        dbSelect({
            table: 'invoices',
            filters: [
                { op: 'eq', column: 'tenant_id', value: state.currentTenantId },
                { op: 'neq', column: 'invoice_type', value: 'estimate' }
            ],
            order: { column: 'created_at', ascending: false },
            limit: 250
        }),
        dbSelect({
            table: 'invoices',
            filters: [
                { op: 'eq', column: 'tenant_id', value: state.currentTenantId },
                { op: 'eq', column: 'invoice_type', value: 'estimate' }
            ],
            order: { column: 'created_at', ascending: false },
            limit: 80
        }),
        dbSelect({
            table: 'payments',
            filters: [{ op: 'eq', column: 'tenant_id', value: state.currentTenantId }],
            order: { column: 'paid_at', ascending: false },
            limit: 250
        }),
        dbSelect({
            table: 'products',
            filters: [{ op: 'eq', column: 'tenant_id', value: state.currentTenantId }],
            limit: 150
        }),
        dbSelect({
            table: 'customers',
            filters: [{ op: 'eq', column: 'tenant_id', value: state.currentTenantId }],
            order: { column: 'name', ascending: true },
            limit: 400
        })
    ]);
    const invoices = invSlice || [];
    const estimates = estimateRows || [];
    const payments = payRows || [];
    const products = prodRows || [];
    const customers = customerRows || [];
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const lowStock = products.filter((p) => {
        const st = Number(p.stock);
        const min = Number(p.min_stock != null ? p.min_stock : 0);
        return Number.isFinite(st) && st <= min;
    }).length;
    const currency = state.tenantContext?.priceDisplayCurrency || state.tenantContext?.defaultCurrency || 'DOP';
    const openBalance = (inv) => Math.max(0, Number(inv.total || 0) - Number(inv.amount_paid || 0));
    const dueInvoices = invoices
        .filter((inv) => openBalance(inv) > 0)
        .sort((a, b) => {
            const ad = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
            const bd = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
            return ad - bd;
        })
        .slice(0, 8);
    const recentInvoices = invoices.slice(0, 8);
    const recentEstimates = estimates.slice(0, 8);
    const totalSales = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const totalReceipts = payments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
    const totalDue = invoices.reduce((sum, inv) => sum + openBalance(inv), 0);
    const netCash = totalReceipts - totalDue;
    const now = new Date();
    const currentYear = now.getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => ({
        i,
        label: new Date(currentYear, i, 1).toLocaleDateString(getTenantNumberLocale(), { month: 'short' }).replace('.', '')
    }));
    const monthSales = Array(12).fill(0);
    const monthReceipts = Array(12).fill(0);
    invoices.forEach((inv) => {
        const d = inv.created_at ? new Date(inv.created_at) : null;
        if (d && d.getFullYear() === currentYear) monthSales[d.getMonth()] += Number(inv.total || 0);
    });
    payments.forEach((pay) => {
        const d = pay.paid_at ? new Date(pay.paid_at) : pay.created_at ? new Date(pay.created_at) : null;
        if (d && d.getFullYear() === currentYear) monthReceipts[d.getMonth()] += Number(pay.amount || 0);
    });
    const maxMonthly = Math.max(1, ...monthSales, ...monthReceipts);
    const monthBars = months
        .map((m) => {
            const salesH = Math.max(4, Math.round((monthSales[m.i] / maxMonthly) * 150));
            const receiptsH = Math.max(4, Math.round((monthReceipts[m.i] / maxMonthly) * 150));
            return `
                <div class="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <div class="flex h-40 items-end gap-1.5">
                        <div title="Ventas ${fmtMoneyPanel(monthSales[m.i], currency)}" class="w-2 rounded-t bg-primary/80" style="height:${salesH}px"></div>
                        <div title="Cobros ${fmtMoneyPanel(monthReceipts[m.i], currency)}" class="w-2 rounded-t bg-emerald-500/85" style="height:${receiptsH}px"></div>
                    </div>
                    <span class="truncate text-[11px] uppercase text-on-surface-variant">${escapeHtml(m.label)}</span>
                </div>`;
        })
        .join('');
    const statCard = (icon, label, value, hint, tone = 'primary') => `
        <div class="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-4 text-left shadow-sm">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">${escapeHtml(label)}</div>
                    <div class="mt-2 text-2xl font-bold ${tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-error' : 'text-primary'}">${value}</div>
                    <p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(hint || '')}</p>
                </div>
                <span class="material-symbols-outlined rounded-md bg-surface-container-low p-2 text-primary/80" aria-hidden="true">${escapeHtml(icon)}</span>
            </div>
        </div>`;
    const invoiceRow = (invoice, opts = {}) => {
        const cust = invoice.customer_id ? customerById.get(invoice.customer_id) : null;
        const num = invoice.series != null && invoice.number != null ? `${invoice.series}-${invoice.number}` : invoice.id || '-';
        const amount = opts.balance ? openBalance(invoice) : Number(invoice.total || 0);
        return `
            <tr class="border-b border-outline-variant/15">
                <td class="py-3 pr-4 text-on-surface-variant">${escapeHtml(toDateString(opts.due ? invoice.due_date || invoice.created_at : invoice.created_at))}</td>
                <td class="py-3 pr-4">
                    <div class="font-medium text-primary">${escapeHtml(cust?.name || 'Cliente sin nombre')}</div>
                    <div class="font-mono text-[11px] text-on-surface-variant">${escapeHtml(String(num))}</div>
                </td>
                <td class="py-3 pr-4 text-xs">${escapeHtml(String(invoice.status || '-'))}</td>
                <td class="py-3 text-right font-semibold">${fmtMoneyPanel(amount, invoice.currency || currency)}</td>
            </tr>`;
    };
    const estimateRow = (estimate) => {
        const cust = estimate.customer_id ? customerById.get(estimate.customer_id) : null;
        const num = estimate.series != null && estimate.number != null ? `${estimate.series}-${estimate.number}` : estimate.id || '-';
        return `
            <tr class="border-b border-outline-variant/15">
                <td class="py-3 pr-4 text-on-surface-variant">${escapeHtml(toDateString(estimate.created_at))}</td>
                <td class="py-3 pr-4">
                    <div class="font-medium text-primary">${escapeHtml(cust?.name || 'Cliente sin nombre')}</div>
                    <div class="font-mono text-[11px] text-on-surface-variant">${escapeHtml(String(num))}</div>
                </td>
                <td class="py-3 pr-4 text-xs">${escapeHtml(String(estimate.status || '-'))}</td>
                <td class="py-3 text-right font-semibold">${fmtMoneyPanel(estimate.total, estimate.currency || currency)}</td>
            </tr>`;
    };

    dashboardContent.innerHTML = `
        ${renderModuleHeader('Panel principal', 'Resumen operativo de ventas, cobros y documentos')}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            ${statCard('account_balance_wallet', 'Monto por cobrar', fmtMoneyPanel(totalDue, currency), 'Facturas con saldo abierto')}
            ${statCard('groups', 'Clientes', String(customers.length), 'Contactos activos en esta empresa')}
            ${statCard('receipt_long', 'Facturas', String(invoices.length), 'Documentos de venta registrados')}
            ${statCard('request_quote', 'Presupuestos', String(estimates.length), 'Cotizaciones recientes')}
        </div>
        <div class="grid grid-cols-1 gap-6 xl:grid-cols-10">
            <div class="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm xl:col-span-7">
                <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 class="flex items-center gap-2 text-base font-bold text-primary"><span class="material-symbols-outlined text-xl" aria-hidden="true">monitoring</span>Movimiento mensual</h3>
                        <p class="mt-1 text-xs text-on-surface-variant">Ventas y cobros del ano actual.</p>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-on-surface-variant">
                        <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-primary"></span>Ventas</span>
                        <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-emerald-500"></span>Cobros</span>
                    </div>
                </div>
                <div class="flex min-h-48 items-end gap-2 border-b border-outline-variant/25 pb-3">${monthBars}</div>
            </div>
            <div class="grid grid-cols-2 rounded-lg border border-outline-variant/25 bg-surface-container-lowest shadow-sm xl:col-span-3 xl:grid-cols-1">
                <div class="p-5">
                    <div class="text-xs text-on-surface-variant">Ventas totales</div>
                    <div class="mt-1 text-xl font-bold text-primary">${fmtMoneyPanel(totalSales, currency)}</div>
                </div>
                <div class="border-l border-outline-variant/25 p-5 xl:border-l-0 xl:border-t">
                    <div class="text-xs text-on-surface-variant">Cobros recibidos</div>
                    <div class="mt-1 text-xl font-bold text-emerald-600">${fmtMoneyPanel(totalReceipts, currency)}</div>
                </div>
                <div class="border-t border-outline-variant/25 p-5">
                    <div class="text-xs text-on-surface-variant">Stock bajo</div>
                    <div class="mt-1 text-xl font-bold ${lowStock ? 'text-error' : 'text-primary'}">${lowStock}</div>
                </div>
                <div class="border-l border-t border-outline-variant/25 p-5 xl:border-l-0">
                    <div class="text-xs text-on-surface-variant">Flujo neto</div>
                    <div class="mt-1 text-xl font-bold ${netCash >= 0 ? 'text-primary' : 'text-error'}">${fmtMoneyPanel(netCash, currency)}</div>
                </div>
            </div>
        </div>
        <div class="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-4 shadow-sm">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 class="text-sm font-bold text-primary">Acciones rapidas</h3>
                    <p class="mt-1 text-xs text-on-surface-variant">Crea operaciones comunes desde el panel.</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" id="panel-quick-customer" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Agregar cliente</button>
                    <button type="button" id="panel-quick-product" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Agregar producto</button>
                    <button type="button" id="panel-quick-estimate" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Crear presupuesto</button>
                    <button type="button" id="panel-quick-invoice" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Crear factura</button>
                </div>
            </div>
        </div>
        <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div class="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
                <div class="mb-3 flex items-center justify-between gap-3">
                    <h3 class="text-base font-bold text-on-surface">Facturas por cobrar</h3>
                    <button type="button" id="panel-view-invoices" class="rounded-md border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold text-primary">Ver todas</button>
                </div>
                ${
                    dueInvoices.length
                        ? `<div class="w-full overflow-x-auto"><table class="w-full border-collapse text-left text-sm">
                    <thead><tr class="border-b border-outline-variant/30">
                        <th class="py-2 pr-4">Vence</th><th class="py-2 pr-4">Cliente</th><th class="py-2 pr-4">Estado</th><th class="py-2 text-right">Saldo</th>
                    </tr></thead>
                    <tbody>${dueInvoices
                        .map((invoice) => invoiceRow(invoice, { due: true, balance: true }))
                        .join('')}</tbody></table></div>`
                        : '<p class="text-sm text-on-surface-variant">No hay facturas con saldo pendiente.</p>'
                }
            </div>
            <div class="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
                <div class="mb-3 flex items-center justify-between gap-3">
                    <h3 class="text-base font-bold text-on-surface">Presupuestos recientes</h3>
                    <button type="button" id="panel-view-estimates" class="rounded-md border border-outline-variant/50 px-3 py-1.5 text-xs font-semibold text-primary">Ver todos</button>
                </div>
                ${
                    recentEstimates.length
                        ? `<div class="w-full overflow-x-auto"><table class="w-full border-collapse text-left text-sm">
                    <thead><tr class="border-b border-outline-variant/30">
                        <th class="py-2 pr-4">Fecha</th><th class="py-2 pr-4">Cliente</th><th class="py-2 pr-4">Estado</th><th class="py-2 text-right">Total</th>
                    </tr></thead>
                    <tbody>${recentEstimates.map((estimate) => estimateRow(estimate)).join('')}</tbody></table></div>`
                        : '<p class="text-sm text-on-surface-variant">No hay presupuestos recientes.</p>'
                }
            </div>
        </div>
        <div class="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-3">
                <h3 class="text-base font-bold text-on-surface">Facturas recientes</h3>
                <span class="text-xs text-on-surface-variant">Ultimos documentos emitidos</span>
            </div>
            ${
                recentInvoices.length
                    ? `<div class="w-full overflow-x-auto"><table class="w-full border-collapse text-left text-sm">
                <thead><tr class="border-b border-outline-variant/30">
                    <th class="py-2 pr-4">Fecha</th><th class="py-2 pr-4">Cliente</th><th class="py-2 pr-4">Estado</th><th class="py-2 text-right">Total</th>
                </tr></thead>
                <tbody>${recentInvoices.map((invoice) => invoiceRow(invoice)).join('')}</tbody></table></div>`
                    : '<p class="text-sm text-on-surface-variant">No hay facturas todavia. Usa el modulo Facturas para crear la primera.</p>'
                }
            }
        </div>
    `;
    document.getElementById('panel-quick-customer')?.addEventListener('click', () => {
        state.clientesUi = { ...state.clientesUi, sheet: 'form', editId: null, historyCustomerId: null, tab: 'list' };
        void openModule('clientes');
    });
    document.getElementById('panel-quick-product')?.addEventListener('click', () => {
        state.inventarioUi = { ...state.inventarioUi, section: 'catalog', tab: 'list', sheet: 'form', editId: null };
        void openModule('inventario');
    });
    document.getElementById('panel-quick-estimate')?.addEventListener('click', () => {
        state.presupuestosUi = { ...state.presupuestosUi, openComposer: true };
        void openModule('presupuestos');
    });
    document.getElementById('panel-quick-invoice')?.addEventListener('click', () => {
        state.facturasUi = { ...state.facturasUi, tab: 'list', openComposer: true };
        void openModule('facturas');
    });
    document.getElementById('panel-view-invoices')?.addEventListener('click', () => {
        state.facturasUi = { ...state.facturasUi, tab: 'list' };
        void openModule('facturas');
    });
    document.getElementById('panel-view-estimates')?.addEventListener('click', () => {
        void openModule('presupuestos');
    });
    zyronLog('render:panel:tenantDone', { invoices: invoices.length, estimates: estimates.length, products: products.length, lowStock });
};

const renderEmpresasModule = async () => {
    zyronLog('render:empresas:start', {});
    if (!state.isSuperAdmin) {
        dashboardContent.innerHTML = `${renderModuleHeader('Empresas', 'Solo disponible para super admin')}<div class="rounded-lg bg-error-container/20 p-4 text-sm text-error">No tienes acceso a este modulo.</div>`;
        zyronLog('render:empresas:forbidden', {});
        return;
    }
    const [{ data: tenants }, users, requests] = await Promise.all([
        dbSelect({ table: 'tenants', order: { column: 'created_at', ascending: false } }),
        loadAppUsersSuperOrFallback(),
        loadAccessRequestsSuperOrFallback()
    ]);
    const usersAll = users || [];
    const usersPanel = usersAll.filter((u) => u.global_role !== 'super_admin');
    const tenantList = tenants || [];
    const registrationRequests = (requests || []).filter((r) => String(r.request_status || '').toLowerCase() === 'pending');
    const firstTenantId = tenantList[0]?.id || '';
    zyronLog('render:empresas:data', {
        tenants: tenantList.length,
        usersAll: usersAll.length,
        usersPanel: usersPanel.length,
        pendingRequests: registrationRequests.length,
        userStatuses: usersPanel.map((u) => ({ id: u.id, email: u.email, status: u.status }))
    });
    dashboardContent.innerHTML = `
        ${renderModuleHeader('Empresas', 'Gestion global de empresas del SaaS')}
        <div class="rounded-xl bg-surface-container-low p-1">
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-primary">Editar empresa</h3>
                        <p class="text-xs text-on-surface-variant">Nombre legal, identificador, limites de usuarios y estado comercial.</p>
                    </div>
                    ${tenantList.length ? `
                    <div class="flex flex-wrap gap-2">
                        <label class="flex flex-col gap-1 text-xs text-on-surface-variant">
                            Seleccionar empresa
                            <select id="tenant-editor-select" class="rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1 text-sm text-on-surface">
                                ${tenantList.map((tenant) => `
                                    <option value="${tenant.id}">${tenant.display_name || tenant.legal_name || tenant.slug}</option>
                                `).join('')}
                            </select>
                        </label>
                    </div>
                    ` : ''}
                </div>
                ${tenantList.length ? `
                <form id="tenant-profile-form" class="mt-4 grid gap-3 md:grid-cols-2">
                    <label class="flex flex-col gap-1 text-xs text-on-surface-variant">
                        Nombre visible
                        <input name="display_name" class="rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 text-sm text-on-surface" />
                    </label>
                    <label class="flex flex-col gap-1 text-xs text-on-surface-variant">
                        Razon social
                        <input name="legal_name" class="rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 text-sm text-on-surface" />
                    </label>
                    <label class="flex flex-col gap-1 text-xs text-on-surface-variant">
                        Slug (URL interna)
                        <input name="slug" class="rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 text-sm text-on-surface" />
                    </label>
                    <label class="flex flex-col gap-1 text-xs text-on-surface-variant">
                        Max usuarios
                        <input name="max_users" type="number" min="1" class="rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 text-sm text-on-surface" />
                    </label>
                    <label class="flex items-center gap-2 text-sm text-on-surface md:col-span-2">
                        <input name="allow_more_users" type="checkbox" class="h-4 w-4 rounded border-outline/40 text-primary" />
                        Permitir superar el limite de usuarios (crecimiento)
                    </label>
                    <div class="flex flex-wrap gap-2 md:col-span-2">
                        <button type="submit" class="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white">Guardar cambios</button>
                        <button type="button" id="tenant-editor-block" class="rounded-md bg-error px-3 py-2 text-xs font-semibold text-white">Bloquear empresa</button>
                        <button type="button" id="tenant-editor-unblock" class="rounded-md bg-surface-container px-3 py-2 text-xs font-semibold text-on-surface">Desbloquear empresa</button>
                    </div>
                </form>
                <p id="tenant-editor-status" class="mt-2 hidden text-xs" role="status"></p>
                ` : '<p class="mt-3 text-sm text-on-surface-variant">Aun no hay empresas registradas.</p>'}
            </div>
        </div>
        <div class="rounded-xl bg-surface-container-low p-1 mt-6">
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <h3 class="mb-3 text-sm font-bold text-primary">Empresas registradas</h3>
                <table class="w-full text-left text-sm">
                    <thead>
                        <tr class="border-b border-outline-variant/30">
                            <th class="py-2">Empresa</th>
                            <th class="py-2">Estado</th>
                            <th class="py-2">Max usuarios</th>
                            <th class="py-2">Permite crecer</th>
                            <th class="py-2 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tenantList.map((tenant) => `
                            <tr class="border-b border-outline-variant/20">
                                <td class="py-3 font-medium text-on-surface">${tenant.display_name}</td>
                                <td class="py-3">${tenant.status}</td>
                                <td class="py-3">${tenant.max_users}</td>
                                <td class="py-3">${tenant.allow_more_users ? 'Si' : 'No'}</td>
                                <td class="py-3 text-right">
                                    <button type="button" class="rounded-md bg-primary px-2 py-1 text-xs text-white" data-tenant-edit="${tenant.id}">Editar</button>
                                    <button type="button" class="rounded-md bg-surface-container px-2 py-1 text-xs" data-tenant-row-action="${tenant.status === 'blocked' ? 'unblock' : 'block'}" data-tenant-id="${tenant.id}">
                                        ${tenant.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        <div class="rounded-xl bg-surface-container-low p-1 mt-6">
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <h3 class="mb-1 text-sm font-bold text-primary">Usuarios del sistema</h3>
                <p class="mb-3 text-xs text-on-surface-variant">La columna «Tipo cuenta» es <code class="rounded bg-surface-container px-1">global_role</code> (plataforma), no el rol dentro de una empresa. Estados: <strong>Pendiente</strong> (falta aprobar la solicitud), <strong>Aprobado</strong> (solicitud OK), <strong>Activo</strong> (servicio en uso), <strong>Inactivo</strong> (bloqueo por pago). Los botones de suspender / reactivar solo aparecen cuando el usuario ya esta <strong>Aprobado</strong>, <strong>Activo</strong> o <strong>Inactivo</strong>.</p>
                <table class="w-full text-left text-sm">
                    <thead>
                        <tr class="border-b border-outline-variant/30">
                            <th class="py-2">Correo</th>
                            <th class="py-2">Tipo cuenta (plataforma)</th>
                            <th class="py-2">Estado</th>
                            <th class="py-2 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${usersPanel.map((user) => `
                            <tr class="border-b border-outline-variant/20">
                                <td class="py-3">${user.email}</td>
                                <td class="py-3"><span class="font-medium">${escapeHtml(formatGlobalRoleForUi(user.global_role))}</span><span class="mt-0.5 block text-[10px] text-on-surface-variant">clave: ${escapeHtml(user.global_role || '')}</span></td>
                                <td class="py-3">${formatAppUserStatus(user.status)}</td>
                                <td class="py-3 text-right">
                                    <button type="button" class="rounded-md bg-primary px-2 py-1 text-xs text-white mr-1" data-reset-password="${user.email}">Restablecer clave</button>
                                    ${user.status === 'pending'
                                        ? '<span class="text-xs text-on-surface-variant mr-1">Aprobar la solicitud de registro abajo.</span>'
                                        : user.status === 'approved' || user.status === 'active' || user.status === 'inactive' || user.status === 'suspended'
                                          ? `<button type="button" class="rounded-md bg-surface-container px-2 py-1 text-xs mr-1" data-toggle-user-status="${user.id}" data-user-status="${user.status}">${user.status === 'inactive' || user.status === 'suspended' ? 'Reactivar (activo)' : 'Suspender por pago (inactivo)'}</button>`
                                          : ''}
                                    ${user.status !== 'pending'
                                        ? `<button type="button" class="rounded-md bg-error px-2 py-1 text-xs text-white" data-delete-user="${user.id}">Eliminar</button>`
                                        : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        <div class="rounded-xl bg-surface-container-low p-1 mt-6">
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <h3 class="mb-1 text-sm font-bold text-primary">Solicitudes de registro</h3>
                <p class="mb-3 text-xs text-on-surface-variant">Solo se listan solicitudes <strong>pendientes</strong>. Al aprobar, el usuario pasa a <strong>Aprobado</strong>, se crea la empresa y la fila desaparece de aqui. <strong>Rechazar</strong> marca la solicitud como rechazada.</p>
                <table class="w-full text-left text-sm">
                    <thead>
                        <tr class="border-b border-outline-variant/30">
                            <th class="py-2">Correo</th>
                            <th class="py-2">Empresa</th>
                            <th class="py-2">Nombre de usuario</th>
                            <th class="py-2">Estado</th>
                            <th class="py-2 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registrationRequests.length === 0
                            ? `<tr><td colspan="5" class="py-4 text-sm text-on-surface-variant">No hay solicitudes pendientes.</td></tr>`
                            : registrationRequests
                                  .map(
                                      (item) => `
                            <tr class="border-b border-outline-variant/20">
                                <td class="py-3">${item.requested_email}</td>
                                <td class="py-3">${item.company_name}</td>
                                <td class="py-3">${item.username}</td>
                                <td class="py-3">${formatRequestStatus(item.request_status)}</td>
                                <td class="py-3 text-right">
                                    <button type="button" class="rounded-md bg-primary px-2 py-1 text-xs text-white mr-2" data-request-action="approve" data-request-id="${item.id}" data-requested-email="${String(item.requested_email || '').trim().toLowerCase()}">Aprobar</button>
                                    <button type="button" class="rounded-md bg-error px-2 py-1 text-xs text-white" data-request-action="reject" data-request-id="${item.id}">Rechazar</button>
                                </td>
                            </tr>
                        `
                                  )
                                  .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    dashboardContent.querySelectorAll('[data-tenant-row-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            const tenantId = button.getAttribute('data-tenant-id');
            const action = button.getAttribute('data-tenant-row-action');
            await invokeFn('manage-tenant', { tenantId, action });
            await renderEmpresasModule();
        });
    });

    const tenantEditorSelect = dashboardContent.querySelector('#tenant-editor-select');
    const tenantProfileForm = dashboardContent.querySelector('#tenant-profile-form');
    const tenantEditorStatus = dashboardContent.querySelector('#tenant-editor-status');
    const tenantEditorBlock = dashboardContent.querySelector('#tenant-editor-block');
    const tenantEditorUnblock = dashboardContent.querySelector('#tenant-editor-unblock');

    const setTenantEditorStatus = (message, isError = false) => {
        if (!tenantEditorStatus) return;
        tenantEditorStatus.textContent = message || '';
        tenantEditorStatus.classList.toggle('hidden', !message);
        tenantEditorStatus.classList.toggle('text-error', isError);
        tenantEditorStatus.classList.toggle('text-on-surface-variant', !isError);
    };

    const fillTenantEditorForm = (tenantId) => {
        if (!tenantProfileForm) return;
        const tenant = tenantList.find((item) => item.id === tenantId);
        if (!tenant) return;
        tenantProfileForm.display_name.value = tenant.display_name || '';
        tenantProfileForm.legal_name.value = tenant.legal_name || '';
        tenantProfileForm.slug.value = tenant.slug || '';
        tenantProfileForm.max_users.value = String(tenant.max_users || 1);
        tenantProfileForm.allow_more_users.checked = Boolean(tenant.allow_more_users);
        setTenantEditorStatus('');
    };

    if (tenantEditorSelect && tenantProfileForm) {
        if (firstTenantId) tenantEditorSelect.value = firstTenantId;
        fillTenantEditorForm(tenantEditorSelect.value || firstTenantId);

        tenantEditorSelect.addEventListener('change', () => {
            fillTenantEditorForm(tenantEditorSelect.value);
        });

        tenantProfileForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const tenantId = tenantEditorSelect.value;
            if (!tenantId) return;
            const fd = new FormData(tenantProfileForm);
            const payload = {
                tenantId,
                action: 'update_profile',
                displayName: String(fd.get('display_name') || '').trim(),
                legalName: String(fd.get('legal_name') || '').trim(),
                slug: String(fd.get('slug') || '').trim().toLowerCase(),
                maxUsers: Number(fd.get('max_users') || 1),
                allowMoreUsers: Boolean(fd.get('allow_more_users'))
            };
            const { error } = await invokeFn('manage-tenant', payload);
            if (error) setTenantEditorStatus(error.message || 'No se pudo guardar.', true);
            else setTenantEditorStatus('Cambios guardados.');
            await renderEmpresasModule();
        });
    }

    tenantEditorBlock?.addEventListener('click', async () => {
        const tenantId = tenantEditorSelect?.value;
        if (!tenantId) return;
        await invokeFn('manage-tenant', { tenantId, action: 'block' });
        await renderEmpresasModule();
    });
    tenantEditorUnblock?.addEventListener('click', async () => {
        const tenantId = tenantEditorSelect?.value;
        if (!tenantId) return;
        await invokeFn('manage-tenant', { tenantId, action: 'unblock' });
        await renderEmpresasModule();
    });

    dashboardContent.querySelectorAll('[data-tenant-edit]').forEach((button) => {
        button.addEventListener('click', () => {
            const tenantId = button.getAttribute('data-tenant-edit');
            if (tenantEditorSelect && tenantId) {
                tenantEditorSelect.value = tenantId;
                fillTenantEditorForm(tenantId);
                tenantEditorSelect.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    dashboardContent.querySelectorAll('[data-delete-user]').forEach((button) => {
        button.addEventListener('click', async () => {
            const userId = button.getAttribute('data-delete-user');
            const candidate = usersAll.find((item) => item.id === userId);
            if (!candidate || candidate.global_role === 'super_admin') return;
            await dbDelete({
                table: 'tenant_memberships',
                filters: [{ op: 'eq', column: 'app_user_id', value: userId }]
            });
            await dbDelete({
                table: 'app_users',
                filters: [{ op: 'eq', column: 'id', value: userId }]
            });
            await renderEmpresasModule();
        });
    });

    dashboardContent.querySelectorAll('[data-reset-password]').forEach((button) => {
        button.addEventListener('click', async () => {
            const email = button.getAttribute('data-reset-password');
            if (!email) return;
            const { error } = await invokeFn('admin-reset-user-password', {
                targetEmail: email,
                reason: 'Super admin solicito restablecimiento'
            });
            if (error) window.alert(error.message || 'No se pudo enviar el correo de restablecimiento.');
            else window.alert('Se envio un correo para restablecer la contraseña.');
        });
    });

    dashboardContent.querySelectorAll('[data-toggle-user-status]').forEach((button) => {
        button.addEventListener('click', async () => {
            const userId = button.getAttribute('data-toggle-user-status');
            const current = String(button.getAttribute('data-user-status') || 'active');
            if (current === 'pending') return;
            const normalized = current === 'suspended' ? 'inactive' : current;
            const next = normalized === 'inactive' ? 'active' : 'inactive';
            await dbUpdate({
                table: 'app_users',
                values: { status: next },
                filters: [{ op: 'eq', column: 'id', value: userId }]
            });
            await renderEmpresasModule();
        });
    });

    dashboardContent.querySelectorAll('[data-request-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            const requestId = button.getAttribute('data-request-id');
            const action = button.getAttribute('data-request-action');
            const requestedEmail = button.getAttribute('data-requested-email');
            const { error } = await runApproveAccessRequest(requestId, action, requestedEmail);
            if (!error) await renderEmpresasModule();
        });
    });
    zyronLog('render:empresas:done', {
        approveButtons: dashboardContent.querySelectorAll('[data-request-action]').length
    });
};

const renderSolicitudesModule = async () => {
    zyronLog('render:solicitudes:start', { isSuperAdmin: state.isSuperAdmin });
    if (!state.isSuperAdmin) {
        dashboardContent.innerHTML = `${renderModuleHeader('Solicitudes', 'Acceso restringido')}
            <div class="rounded-xl bg-surface-container-low p-1">
                <div class="rounded-lg bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
                    Solo un <strong class="text-on-surface">superadministrador</strong> puede revisar solicitudes de alta de empresas.
                </div>
            </div>`;
        return;
    }
    const all = await loadAccessRequestsSuperOrFallback();
    const requests = (all || []).filter((r) => String(r.request_status || '').toLowerCase() === 'pending');
    dashboardContent.innerHTML = `
        ${renderModuleHeader('Solicitudes', 'Solo solicitudes pendientes de revision')}
        <div class="rounded-xl bg-surface-container-low p-1">
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <table class="w-full text-left text-sm">
                    <thead>
                        <tr class="border-b border-outline-variant/30">
                            <th class="py-2">Correo</th>
                            <th class="py-2">Empresa</th>
                            <th class="py-2">Nombre de usuario</th>
                            <th class="py-2">Estado</th>
                            <th class="py-2 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(requests || []).length === 0
                            ? `<tr><td colspan="5" class="py-4 text-sm text-on-surface-variant">No hay solicitudes pendientes.</td></tr>`
                            : (requests || [])
                                  .map(
                                      (item) => `
                            <tr class="border-b border-outline-variant/20">
                                <td class="py-3">${item.requested_email}</td>
                                <td class="py-3">${item.company_name}</td>
                                <td class="py-3">${item.username}</td>
                                <td class="py-3">${formatRequestStatus(item.request_status)}</td>
                                <td class="py-3 text-right">
                                    <button type="button" class="rounded-md bg-primary px-2 py-1 text-xs text-white mr-2" data-request-action="approve" data-request-id="${item.id}" data-requested-email="${String(item.requested_email || '').trim().toLowerCase()}">Aprobar</button>
                                    <button type="button" class="rounded-md bg-error px-2 py-1 text-xs text-white" data-request-action="reject" data-request-id="${item.id}">Rechazar</button>
                                </td>
                            </tr>
                        `
                                  )
                                  .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    zyronLog('render:solicitudes:rendered', { count: (requests || []).length });
    dashboardContent.querySelectorAll('[data-request-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            const requestId = button.getAttribute('data-request-id');
            const action = button.getAttribute('data-request-action');
            const requestedEmail = button.getAttribute('data-requested-email');
            const { error } = await runApproveAccessRequest(requestId, action, requestedEmail);
            if (!error) await renderSolicitudesModule();
        });
    });
    zyronLog('render:solicitudes:done', {});
};

const renderSuperAccessModule = async () => {
    zyronLog('render:superAccess:start', { isSuperAdmin: state.isSuperAdmin, tab: state.superAccessUi?.tab });
    if (!state.isSuperAdmin) {
        dashboardContent.innerHTML = `${renderModuleHeader('Acceso', 'Acceso restringido')}
            <div class="rounded-xl bg-surface-container-low p-1">
                <div class="rounded-lg bg-surface-container-lowest p-6 text-sm text-on-surface-variant">
                    Solo un <strong class="text-on-surface">superadministrador de plataforma</strong> puede abrir el control de acceso global (multiusuario, roles y cumplimiento de permisos a nivel plataforma y entre empresas).
                </div>
            </div>`;
        zyronLog('render:superAccess:forbidden', { role: state.membership?.role_key });
        return;
    }
    if (!state.superAccessUi) state.superAccessUi = { tab: 'platform', memTenantId: '', memEmailQ: '', memStatus: '', platformQ: '' };
    const tab = state.superAccessUi.tab || 'platform';
    const saTabBtn = (key, label) => {
        const on = tab === key;
        return `<button type="button" data-sa-tab="${key}" class="rounded-md px-3 py-1.5 text-sm ${
            on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
        }">${label}</button>`;
    };

    let membershipsBlock = '';
    let auditBlock = '';
    if (tab === 'memberships') {
        const [{ data: tenants }, memRes] = await Promise.all([
            dbSelect({ table: 'tenants', order: { column: 'display_name', ascending: true }, limit: 400 }),
            invokeFn('manage-super-access', {
                action: 'list_memberships',
                tenantId: state.superAccessUi.memTenantId || null,
                emailQ: state.superAccessUi.memEmailQ || '',
                status: state.superAccessUi.memStatus || '',
                limit: 400
            })
        ]);
        const memU = unwrapFnInvoke(memRes);
        const memRows = !memU.err && memU.data?.ok ? memU.data.rows || [] : [];
        const memErr =
            memU.err || (memU.data && memU.data.ok === false)
                ? `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">${
                      memU.err || memU.data?.error || 'Despliega la funcion manage-super-access en Insforge.'
                  }</div>`
                : '';
        const tenantOpts =
            `<option value="">Todas las empresas</option>` +
            (tenants || [])
                .map(
                    (t) =>
                        `<option value="${t.id}" ${state.superAccessUi.memTenantId === t.id ? 'selected' : ''}>${escapeHtml(
                            String(t.display_name || t.legal_name || t.slug || t.id)
                        )}</option>`
                )
                .join('');
        const roleKeys = [
            ...new Set([
                ...state.roleSystemPresetsResolved.map((p) => p.role_key),
                'staff',
                ...memRows.map((r) => r.role_key).filter(Boolean)
            ])
        ];
        membershipsBlock = `
            ${memErr}
            <form id="sa-mem-filter-form" class="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-outline-variant/30 bg-surface-container p-3 text-sm">
                <label class="block min-w-[200px]"><span class="text-xs font-medium text-on-surface-variant">Empresa</span>
                    <select name="tenantId" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-1.5 text-sm">${tenantOpts}</select></label>
                <label class="block min-w-[180px]"><span class="text-xs font-medium text-on-surface-variant">Correo contiene</span>
                    <input name="emailQ" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-1.5 text-sm" value="${escapeHtml(
                        state.superAccessUi.memEmailQ || ''
                    )}" placeholder="buscar" /></label>
                <label class="block w-36"><span class="text-xs font-medium text-on-surface-variant">Estado memb.</span>
                    <select name="status" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-1.5 text-sm">
                        <option value="" ${!state.superAccessUi.memStatus ? 'selected' : ''}>Cualquiera</option>
                        <option value="active" ${state.superAccessUi.memStatus === 'active' ? 'selected' : ''}>active</option>
                        <option value="suspended" ${state.superAccessUi.memStatus === 'suspended' ? 'selected' : ''}>suspended</option>
                    </select></label>
                <button type="submit" class="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white">Aplicar filtros</button>
            </form>
            <p class="mb-2 text-xs text-on-surface-variant">Control de acceso por empresa: <code class="rounded bg-surface-container px-1">role_key</code> debe existir en <code class="rounded bg-surface-container px-1">role_catalog</code> del tenant (usa el modulo Roles para sembrar presets).</p>
            <div class="overflow-x-auto max-h-[60vh] overflow-y-auto rounded-lg border border-outline-variant/25">
                <table class="w-full min-w-[920px] text-left text-sm">
                    <thead class="sticky top-0 z-10 bg-surface-container-highest"><tr class="border-b border-outline-variant/30">
                        <th class="py-2 px-2">Empresa</th><th class="py-2 px-2">Usuario</th><th class="py-2 px-2">Rol</th><th class="py-2 px-2">Estado</th><th class="py-2 px-2">Dueño</th><th class="py-2 px-2 text-right">Guardar</th>
                    </tr></thead>
                    <tbody>
                        ${memRows.length === 0
                            ? '<tr><td colspan="6" class="py-6 text-center text-on-surface-variant">Sin membresías con estos filtros.</td></tr>'
                            : memRows
                                  .map((r) => {
                                      const tn = r.tenant?.display_name || r.tenant?.legal_name || r.tenant_id;
                                      const em = r.user?.email || r.app_user_id;
                                      return `<tr class="border-b border-outline-variant/15" data-sa-mem-row="${escapeHtml(r.membership_id)}">
                                        <td class="py-2 px-2 max-w-[200px] truncate" title="${escapeHtml(String(tn))}">${escapeHtml(String(tn))}</td>
                                        <td class="py-2 px-2 font-mono text-xs">${escapeHtml(String(em))}</td>
                                        <td class="py-2 px-2"><select data-sa-field="role" class="w-full max-w-[160px] rounded border border-outline-variant/40 px-1 py-1 text-xs">${roleKeys
                                            .map(
                                                (rk) =>
                                                    `<option value="${escapeHtml(rk)}" ${
                                                        r.role_key === rk ? 'selected' : ''
                                                    }>${escapeHtml(rk)}</option>`
                                            )
                                            .join('')}</select></td>
                                        <td class="py-2 px-2"><select data-sa-field="status" class="rounded border border-outline-variant/40 px-1 py-1 text-xs">
                                            <option value="active" ${String(r.status || '').toLowerCase() === 'active' ? 'selected' : ''}>active</option>
                                            <option value="suspended" ${String(r.status || '').toLowerCase() === 'suspended' ? 'selected' : ''}>suspended</option>
                                        </select></td>
                                        <td class="py-2 px-2"><input type="checkbox" data-sa-field="owner" class="h-4 w-4" ${r.is_owner ? 'checked' : ''} /></td>
                                        <td class="py-2 px-2 text-right"><button type="button" data-sa-mem-save="${escapeHtml(
                                            r.membership_id
                                        )}" class="rounded-md bg-primary px-2 py-1 text-xs text-white">Guardar</button></td>
                                    </tr>`;
                                  })
                                  .join('')}
                    </tbody>
                </table>
            </div>`;
    }
    if (tab === 'audit') {
        const aRes = await invokeFn('manage-super-access', { action: 'list_super_audit', limit: 100 });
        const aU = unwrapFnInvoke(aRes);
        const logs = !aU.err && aU.data?.ok ? aU.data.rows || [] : [];
        const aErr = aU.err
            ? `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">${escapeHtml(
                  aU.err
              )}</div>`
            : '';
        auditBlock = `${aErr}
            <p class="mb-2 text-xs text-on-surface-variant">Registro de acciones sensibles ejecutadas solo por super admin (cambios en membresías, estado de cuenta plataforma, eliminación de usuarios).</p>
            <div class="max-h-[60vh] space-y-2 overflow-y-auto">${(logs || [])
                .map(
                    (l) =>
                        `<div class="rounded-md border border-outline-variant/30 p-3 text-xs">
                            <div class="font-semibold text-primary">${escapeHtml(l.action || '')}</div>
                            <div class="text-on-surface-variant">${escapeHtml(toDateString(l.created_at))} · tenant ${escapeHtml(
                            String(l.tenant_id || '—')
                        )}</div>
                            <pre class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-container-high p-2 font-mono text-[10px]">${escapeHtml(
                                JSON.stringify(l.details || {}, null, 0)
                            )}</pre>
                        </div>`
                )
                .join('') || '<p class="text-on-surface-variant">Sin entradas todavía.</p>'}</div>`;
    }

    const raw = tab === 'platform' ? await loadAppUsersSuperOrFallback() : [];
    const pq = String(state.superAccessUi.platformQ || '')
        .trim()
        .toLowerCase();
    const usersAll = (raw || []).filter((u) => !pq || String(u.email || '').toLowerCase().includes(pq));
    const users = usersAll.filter((u) => u.global_role !== 'super_admin');
    const supers = usersAll.filter((u) => u.global_role === 'super_admin');

    const platformTable = (list, opts) => {
        const { showDemote, showDelete } = opts || {};
        if (!list.length) return '<p class="text-sm text-on-surface-variant">Sin filas.</p>';
        return `<table class="w-full text-left text-sm">
            <thead><tr class="border-b border-outline-variant/30">
                <th class="py-2">Correo</th><th class="py-2">Tipo</th><th class="py-2">Estado</th><th class="py-2">Clave</th><th class="py-2 text-right">Acciones</th>
            </tr></thead><tbody>
            ${list
                .map(
                    (user) => `
                <tr class="border-b border-outline-variant/15">
                    <td class="py-2 font-mono text-xs">${escapeHtml(String(user.email || ''))}</td>
                    <td class="py-2">${escapeHtml(formatGlobalRoleForUi(user.global_role))}</td>
                    <td class="py-2">${formatAppUserStatus(user.status)}</td>
                    <td class="py-2 text-xs">${user.must_reset_password ? '<span class="font-semibold text-amber-700">Debe cambiar clave</span>' : '—'}</td>
                    <td class="py-2 text-right space-x-1">
                        <button type="button" class="rounded-md bg-surface-container px-2 py-1 text-xs" data-sa-reset-email="${escapeHtml(
                            String(user.email || '')
                        )}">Reset pass</button>
                        ${
                            user.status !== 'pending' && user.global_role !== 'super_admin'
                                ? `<button type="button" class="rounded-md bg-surface-container px-2 py-1 text-xs" data-sa-toggle-status="${user.id}" data-sa-user-status="${escapeHtml(
                                      String(user.status || '')
                                  )}">${['inactive', 'suspended'].includes(String(user.status || '').toLowerCase()) ? 'Reactivar' : 'Suspender'}</button>`
                                : ''
                        }
                        ${showDemote && user.global_role === 'super_admin' && user.id !== state.appUser?.id ? `<button type="button" class="rounded-md border border-error/50 px-2 py-1 text-xs text-error" data-sa-demote="${user.id}">Degradar a usuario</button>` : ''}
                        ${showDelete && user.global_role !== 'super_admin' ? `<button type="button" class="rounded-md bg-error px-2 py-1 text-xs text-white" data-sa-delete-user="${user.id}">Eliminar</button>` : ''}
                    </td>
                </tr>`
                )
                .join('')}
            </tbody></table>`;
    };

    let platformBlock = '';
    if (tab === 'platform') {
        platformBlock = `
            <div class="mb-4 flex flex-wrap items-end gap-3">
                <label class="block min-w-[220px] text-sm"><span class="text-xs font-medium text-on-surface-variant">Buscar por correo</span>
                    <input id="sa-platform-q" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-1.5 text-sm" value="${escapeHtml(
                        state.superAccessUi.platformQ || ''
                    )}" /></label>
                <button type="button" id="sa-platform-q-go" class="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white">Filtrar</button>
            </div>
            <p class="mb-3 text-xs text-on-surface-variant">Las cuentas <strong>super admin</strong> no se eliminan desde aqui; solo se puede <strong>degradar</strong> a usuario de plataforma si queda otro super. El resto del control por empresa es la pestaña Membresías.</p>
            ${supers.length ? `<h4 class="mb-2 text-xs font-bold uppercase tracking-wide text-primary">Super administradores</h4>${platformTable(supers, { showDemote: true, showDelete: false })}` : ''}
            <h4 class="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-primary">Usuarios de plataforma</h4>
            ${platformTable(users, { showDemote: false, showDelete: true })}`;
    }

    dashboardContent.innerHTML = `
        ${renderModuleHeader(
            'Acceso',
            'Multiusuario, roles por empresa (role_catalog) y control de acceso global para super admin. Las invitaciones por correo con tenant siguen en Empresas / API manage-tenant-user.'
        )}
        <div class="rounded-xl bg-surface-container-low p-1">
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <div class="mb-4 flex flex-wrap gap-2">${saTabBtn('platform', 'Cuentas plataforma')}${saTabBtn(
        'memberships',
        'Membresías'
    )}${saTabBtn('audit', 'Auditoría super')}</div>
                ${tab === 'platform' ? platformBlock : ''}
                ${tab === 'memberships' ? membershipsBlock : ''}
                ${tab === 'audit' ? auditBlock : ''}
            </div>
        </div>
    `;

    dashboardContent.querySelectorAll('[data-sa-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.superAccessUi.tab = btn.getAttribute('data-sa-tab');
            void renderSuperAccessModule();
        });
    });

    document.getElementById('sa-platform-q-go')?.addEventListener('click', () => {
        state.superAccessUi.platformQ = document.getElementById('sa-platform-q')?.value || '';
        void renderSuperAccessModule();
    });

    dashboardContent.querySelectorAll('[data-sa-reset-email]').forEach((button) => {
        button.addEventListener('click', async () => {
            const email = button.getAttribute('data-sa-reset-email');
            const r = await invokeFn('admin-reset-user-password', {
                tenantId: null,
                targetEmail: email,
                reason: 'Super admin — modulo Acceso'
            });
            const u = unwrapFnInvoke(r);
            if (u.err) window.alert(u.err);
            else window.alert('Correo de restablecimiento enviado (si el proveedor lo permite).');
        });
    });

    dashboardContent.querySelectorAll('[data-sa-toggle-status]').forEach((button) => {
        button.addEventListener('click', async () => {
            const userId = button.getAttribute('data-sa-toggle-status');
            const current = String(button.getAttribute('data-sa-user-status') || 'active');
            if (current === 'pending') return;
            const normalized = current === 'suspended' ? 'inactive' : current;
            const next = normalized === 'inactive' ? 'active' : 'inactive';
            const r = await invokeFn('manage-super-access', { action: 'patch_app_user', appUserId: userId, status: next });
            const u = unwrapFnInvoke(r);
            if (u.err || u.data?.error) window.alert(u.err || u.data?.error || 'Error');
            else void renderSuperAccessModule();
        });
    });

    dashboardContent.querySelectorAll('[data-sa-delete-user]').forEach((button) => {
        button.addEventListener('click', async () => {
            const userId = button.getAttribute('data-sa-delete-user');
            if (!window.confirm('Eliminar usuario y todas sus membresías? Esta acción no se puede deshacer.')) return;
            const r = await invokeFn('manage-super-access', { action: 'delete_platform_user', appUserId: userId });
            const u = unwrapFnInvoke(r);
            if (u.err || u.data?.error) window.alert(u.err || u.data?.error || 'Error');
            else void renderSuperAccessModule();
        });
    });

    dashboardContent.querySelectorAll('[data-sa-demote]').forEach((button) => {
        button.addEventListener('click', async () => {
            const userId = button.getAttribute('data-sa-demote');
            if (!window.confirm('Degradar a usuario de plataforma (global_role: user)? Requiere haber otro super admin activo.')) return;
            const r = await invokeFn('manage-super-access', { action: 'patch_app_user', appUserId: userId, globalRole: 'user' });
            const u = unwrapFnInvoke(r);
            if (u.err || u.data?.error) window.alert(u.err || u.data?.error || 'Error');
            else void renderSuperAccessModule();
        });
    });

    document.getElementById('sa-mem-filter-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        state.superAccessUi.memTenantId = String(fd.get('tenantId') || '');
        state.superAccessUi.memEmailQ = String(fd.get('emailQ') || '');
        state.superAccessUi.memStatus = String(fd.get('status') || '');
        void renderSuperAccessModule();
    });

    dashboardContent.querySelectorAll('[data-sa-mem-save]').forEach((button) => {
        button.addEventListener('click', async () => {
            const mid = button.getAttribute('data-sa-mem-save');
            const tr = dashboardContent.querySelector(`tr[data-sa-mem-row="${mid}"]`);
            if (!tr) return;
            const roleKey = tr.querySelector('[data-sa-field="role"]')?.value;
            const st = tr.querySelector('[data-sa-field="status"]')?.value;
            const isOwner = Boolean(tr.querySelector('[data-sa-field="owner"]')?.checked);
            const r = await invokeFn('manage-super-access', {
                action: 'patch_membership',
                membershipId: mid,
                roleKey,
                status: st,
                isOwner
            });
            const u = unwrapFnInvoke(r);
            if (u.err || u.data?.error) window.alert(u.err || u.data?.error || 'Error');
            else void renderSuperAccessModule();
        });
    });

    zyronLog('render:superAccess:done', { tab, users: users.length, supers: supers.length });
};

const ensureRolePresetsForTenant = async (tenantId) => {
    zyronLog('ensureRolePresetsForTenant', { tenantId });
    if (!tenantId) return;

    const { data: existingRoles } = await dbSelect({
        table: 'role_catalog',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }]
    });
    const roleMap = new Map((existingRoles || []).map((role) => [role.role_key, role]));

    for (const preset of state.roleSystemPresetsResolved) {
        if (roleMap.has(preset.role_key)) continue;
        const { data: inserted } = await dbInsert({
            table: 'role_catalog',
            values: [{ tenant_id: tenantId, role_key: preset.role_key, label: preset.label, hierarchy_level: preset.hierarchy_level, is_system: true }]
        });
        if (inserted?.[0]) roleMap.set(preset.role_key, inserted[0]);
    }

    const { data: permissionRows } = await dbSelect({ table: 'permission_catalog' });
    const permissionMap = new Map((permissionRows || []).map((perm) => [perm.permission_key, perm.id]));
    const presetRoleIds = state.roleSystemPresetsResolved.map((preset) => roleMap.get(preset.role_key)?.id).filter(Boolean);
    const { data: assignedRows } = presetRoleIds.length
        ? await dbSelect({ table: 'role_permissions', filters: [{ op: 'in', column: 'role_id', value: presetRoleIds }] })
        : { data: [] };
    const assignedByRole = new Map();
    for (const row of assignedRows || []) {
        if (!assignedByRole.has(row.role_id)) assignedByRole.set(row.role_id, new Set());
        assignedByRole.get(row.role_id).add(row.permission_id);
    }

    const missing = [];
    for (const preset of state.roleSystemPresetsResolved) {
        const role = roleMap.get(preset.role_key);
        if (!role) continue;
        const assigned = assignedByRole.get(role.id) || new Set();
        for (const key of preset.permissions || []) {
            const permissionId = permissionMap.get(key);
            if (permissionId && !assigned.has(permissionId)) missing.push({ role_id: role.id, permission_id: permissionId });
        }
    }
    if (missing.length) await dbInsert({ table: 'role_permissions', values: missing });
};

const renderRolesModule = async (opts = {}) => {
    const rolesRoot = opts.mount || dashboardContent;
    const embedded = Boolean(opts.embedded);
    zyronLog('render:roles:start', { rolesContextTenantId: state.rolesContextTenantId, currentTenantId: state.currentTenantId });

    const isTenantAdmin = state.membership?.role_key === 'tenant_admin';
    if (!state.isSuperAdmin && !isTenantAdmin) {
        rolesRoot.innerHTML = `${renderModuleHeader('Roles', 'Acceso restringido')}
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
        const { data: tenants } = await dbSelect({ table: 'tenants', order: { column: 'display_name', ascending: true }, limit: 300 });
        const opts = (tenants || []).map((t) => `<option value="${t.id}">${escapeHtml(String(t.display_name || t.legal_name || t.slug || t.id))}</option>`).join('');
        rolesRoot.innerHTML = `
            ${renderModuleHeader('Roles', 'Elige una empresa')}
            <div class="rounded-xl bg-surface-container-low p-1">
                <div class="rounded-lg bg-surface-container-lowest p-6 space-y-4">
                    <label class="block text-sm">
                        <span class="font-medium text-on-surface">Empresa</span>
                        <select id="roles-tenant-select" class="mt-2 w-full max-w-lg rounded-md border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm">
                            <option value="">Seleccionar</option>
                            ${opts}
                        </select>
                    </label>
                    <button type="button" id="roles-tenant-open" class="rounded-md bg-primary px-4 py-2 text-sm text-white">Abrir roles</button>
                </div>
            </div>`;
        document.getElementById('roles-tenant-open')?.addEventListener('click', async () => {
            const v = document.getElementById('roles-tenant-select')?.value?.trim();
            if (!v) return window.alert('Selecciona una empresa.');
            state.rolesContextTenantId = v;
            await renderRolesModule();
        });
        return;
    }

    const { data: tenantRow } = await dbSelect({ table: 'tenants', filters: [{ op: 'eq', column: 'id', value: effectiveTenantId }], limit: 1 });
    const tenantLabel = escapeHtml((tenantRow && tenantRow[0] && (tenantRow[0].display_name || tenantRow[0].legal_name)) || effectiveTenantId);

    await ensureRolePresetsForTenant(effectiveTenantId);

    const [{ data: roles }, { data: permissionRows }] = await Promise.all([
        dbSelect({ table: 'role_catalog', filters: [{ op: 'eq', column: 'tenant_id', value: effectiveTenantId }], order: { column: 'hierarchy_level', ascending: true } }),
        dbSelect({ table: 'permission_catalog' })
    ]);

    const permissionMap = new Map((permissionRows || []).map((perm) => [perm.id, perm.permission_key]));
    const roleIds = (roles || []).map((role) => role.id).filter(Boolean);
    const { data: allAssignedRows } = roleIds.length
        ? await dbSelect({ table: 'role_permissions', filters: [{ op: 'in', column: 'role_id', value: roleIds }] })
        : { data: [] };
    const assignedKeysByRole = new Map();
    for (const row of allAssignedRows || []) {
        const key = permissionMap.get(row.permission_id);
        if (!key) continue;
        if (!assignedKeysByRole.has(row.role_id)) assignedKeysByRole.set(row.role_id, new Set());
        assignedKeysByRole.get(row.role_id).add(key);
    }
    const roleById = new Map((roles || []).map((role) => [String(role.id), role]));

    const groupedPermissions = {};
    (permissionRows || []).forEach((permission) => {
        const groupLabel = getPermissionGroupLabel(permission.permission_key);
        if (!groupedPermissions[groupLabel]) groupedPermissions[groupLabel] = [];
        groupedPermissions[groupLabel].push(permission);
    });
    Object.values(groupedPermissions).forEach((list) => list.sort((a, b) => String(a.permission_key || '').localeCompare(String(b.permission_key || ''))));

    const renderPermissionGrid = (roleId) => Object.entries(groupedPermissions)
        .filter(([_, list]) => list.length > 0)
        .map(([group, list]) => `
            <div class="min-w-[150px]">
                <h5 class="mb-2 border-b border-outline-variant/25 pb-1 text-sm font-medium text-on-surface-variant">${group}</h5>
                <div class="space-y-2">
                    ${list.map((permission) => {
                        const implied = state.permissionCascadeMap?.get(permission.permission_key) || [];
                        const impliedAttr = implied.length ? ` data-implies="${escapeHtml(implied.join('|'))}"` : '';
                        return `
                            <label class="flex cursor-pointer items-center gap-2 text-sm text-on-surface-variant hover:text-primary">
                                <input type="checkbox" class="h-4 w-4 rounded border-outline/40 text-primary focus:ring-primary/20" data-role-perm-role="${roleId}" data-role-perm-key="${permission.permission_key}"${impliedAttr} />
                                <span>${escapeHtml(permission.label || permission.permission_key)}</span>
                            </label>`;
                    }).join('')}
                </div>
            </div>`).join('');

    const applyPermissionSelection = (scopeRoot, permissionKey, checked) => {
        if (!scopeRoot || !permissionKey) return;
        const selector = `[data-role-perm-role="${scopeRoot}"][data-role-perm-key="${permissionKey}"]`;
        const checkbox = rolesRoot.querySelector(selector) || modal?.querySelector(selector) || editModal?.querySelector(selector);
        if (!checkbox) return;
        checkbox.checked = checked;
        if (checked) {
            (state.permissionCascadeMap?.get(permissionKey) || []).forEach((impliedKey) => {
                if (impliedKey !== permissionKey) applyPermissionSelection(scopeRoot, impliedKey, true);
            });
            return;
        }
        (state.permissionDependentsMap?.get(permissionKey) ? [...state.permissionDependentsMap.get(permissionKey)] : []).forEach((dependentKey) => {
            const dependentSelector = `[data-role-perm-role="${scopeRoot}"][data-role-perm-key="${dependentKey}"]`;
            const dependentCheckbox = rolesRoot.querySelector(dependentSelector) || modal?.querySelector(dependentSelector) || editModal?.querySelector(dependentSelector);
            if (dependentCheckbox?.checked) dependentCheckbox.checked = false;
        });
    };

    const formatRoleCreatedAt = (value) => {
        if (!value) return '-';
        try { return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
        catch (_) { return String(value).slice(0, 10); }
    };

    rolesRoot.innerHTML = `
        ${embedded ? '' : renderModuleHeader('Roles', 'Configura los roles y permisos de esta empresa.')}
        <div class="mx-auto w-full max-w-6xl pb-12">
            <div class="rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-6 shadow-sm">
                <div class="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <h3 class="text-xl font-semibold text-on-surface">Roles</h3>
                        <p class="mt-2 text-sm text-on-surface-variant">Configura los roles y permisos de esta empresa</p>
                        <p class="mt-1 text-xs text-on-surface-variant">Empresa: <strong class="text-on-surface">${tenantLabel}</strong></p>
                    </div>
                    <button type="button" id="roles-create-btn" class="inline-flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5"><span class="text-lg leading-none">+</span>Añadir nuevo rol</button>
                </div>
                <div class="overflow-hidden rounded-lg border border-outline-variant/25 bg-surface-container-lowest">
                    <div class="grid grid-cols-[1fr_180px_80px] border-b border-outline-variant/25 bg-surface-container-low px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                        <span>Nombre del rol</span><span>Añadido el</span><span class="text-right">Acción</span>
                    </div>
                    ${(roles || []).map((role) => {
                        const isOwnerRole = role.role_key === 'tenant_admin';
                        return `<div class="grid grid-cols-[1fr_180px_80px] items-center border-b border-outline-variant/15 px-6 py-4 last:border-b-0 hover:bg-surface-container-low/40">
                            <div class="min-w-0"><div class="flex items-center gap-2"><span class="truncate font-semibold text-on-surface">${escapeHtml(role.label)}</span>${isOwnerRole ? '<span class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Dueño de acceso total</span>' : ''}</div>${isOwnerRole ? '<p class="mt-1 text-xs text-on-surface-variant">Este perfil no se edita: siempre tiene todos los permisos.</p>' : ''}</div>
                            <div class="text-sm text-on-surface-variant">${formatRoleCreatedAt(role.created_at)}</div>
                            <div class="text-right">${isOwnerRole ? '<span class="text-xs text-on-surface-variant">-</span>' : `<button type="button" class="rounded-md px-3 py-1 text-xl leading-none text-on-surface-variant hover:bg-surface-container" data-role-edit="${role.id}" title="Administrar permisos">...</button>`}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
            <div id="roles-create-modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-scrim/35 p-4 hidden"><div class="w-full max-w-5xl rounded-lg bg-surface-container-lowest shadow-2xl"><div class="flex items-center justify-between border-b border-outline-variant/25 px-6 py-4"><h3 class="text-lg font-semibold text-on-surface">Añadir rol</h3><button type="button" id="roles-create-cancel-top" class="rounded-md px-2 py-1 text-2xl leading-none text-on-surface-variant hover:bg-surface-container">?</button></div><div class="max-h-[72vh] overflow-y-auto px-8 py-7"><label class="block"><span class="text-sm font-semibold text-on-surface-variant">Nombre <span class="text-error">*</span></span><input type="text" id="roles-new-label" class="mt-2 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm focus:border-primary focus:outline-none" /></label><label class="mt-5 block"><span class="text-sm font-semibold text-on-surface-variant">Copiar permisos de</span><select id="roles-new-template" class="mt-2 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm"><option value="">En blanco</option>${state.roleSystemPresetsResolved.map(p => `<option value="${p.role_key}">${escapeHtml(p.label)}</option>`).join('')}</select></label><div class="mt-8"><div class="mb-4 flex items-center justify-between border-b border-outline-variant/25 pb-2"><h4 class="text-sm font-semibold text-on-surface">Permisos <span class="text-error">*</span></h4><div class="flex items-center gap-2 text-sm"><button type="button" id="roles-new-select-all" class="text-primary hover:underline">Seleccionar todo</button><span class="text-on-surface-variant">/</span><button type="button" id="roles-new-clear-all" class="text-primary hover:underline">Ninguno</button></div></div><div class="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-4" id="roles-new-perm-grid">${renderPermissionGrid('new')}</div></div></div><div class="flex items-center justify-end gap-3 border-t border-outline-variant/25 px-6 py-4"><button type="button" id="roles-create-cancel" class="rounded-md border border-outline-variant px-5 py-2 text-sm font-medium text-primary hover:bg-primary/5">Cancelar</button><button type="button" id="roles-create-confirm" class="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-white hover:opacity-90">Guardar</button></div></div></div>
            <div id="roles-edit-modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-scrim/35 p-4 hidden"><div class="w-full max-w-5xl rounded-lg bg-surface-container-lowest shadow-2xl"><div class="flex items-center justify-between border-b border-outline-variant/25 px-6 py-4"><h3 id="roles-edit-title" class="text-lg font-semibold text-on-surface">Administrar permisos</h3><button type="button" id="roles-edit-cancel-top" class="rounded-md px-2 py-1 text-2xl leading-none text-on-surface-variant hover:bg-surface-container">?</button></div><div class="max-h-[72vh] overflow-y-auto px-8 py-7"><div class="mb-4 flex items-center justify-between border-b border-outline-variant/25 pb-2"><h4 class="text-sm font-semibold text-on-surface">Permisos</h4><div class="flex items-center gap-2 text-sm"><button type="button" id="roles-edit-select-all" class="text-primary hover:underline">Seleccionar todo</button><span class="text-on-surface-variant">/</span><button type="button" id="roles-edit-clear-all" class="text-primary hover:underline">Ninguno</button></div></div><div class="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-4" id="roles-edit-perm-grid">${renderPermissionGrid('edit')}</div></div><div class="flex items-center justify-end gap-3 border-t border-outline-variant/25 px-6 py-4"><button type="button" id="roles-edit-cancel" class="rounded-md border border-outline-variant px-5 py-2 text-sm font-medium text-primary hover:bg-primary/5">Cancelar</button><button type="button" id="roles-edit-confirm" class="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-white hover:opacity-90">Guardar</button></div></div></div>
        </div>`;

    const modal = document.getElementById('roles-create-modal');
    const editModal = document.getElementById('roles-edit-modal');
    const editTitle = document.getElementById('roles-edit-title');
    const confirmBtn = document.getElementById('roles-create-confirm');
    const editConfirmBtn = document.getElementById('roles-edit-confirm');
    const toggleModal = (show) => { modal?.classList.toggle('hidden', !show); if (show) document.getElementById('roles-new-label')?.focus(); };
    const toggleEditModal = (show, roleId = '') => { editModal?.classList.toggle('hidden', !show); if (show) editModal?.setAttribute('data-edit-role-id', roleId); else editModal?.removeAttribute('data-edit-role-id'); };
    document.getElementById('roles-create-btn')?.addEventListener('click', () => toggleModal(true));
    document.getElementById('roles-create-cancel')?.addEventListener('click', () => toggleModal(false));
    document.getElementById('roles-create-cancel-top')?.addEventListener('click', () => toggleModal(false));
    document.getElementById('roles-edit-cancel')?.addEventListener('click', () => toggleEditModal(false));
    document.getElementById('roles-edit-cancel-top')?.addEventListener('click', () => toggleEditModal(false));
    document.getElementById('roles-new-select-all')?.addEventListener('click', () => modal?.querySelectorAll('[data-role-perm-role="new"]').forEach((checkbox) => applyPermissionSelection('new', checkbox.getAttribute('data-role-perm-key'), true)));
    document.getElementById('roles-new-clear-all')?.addEventListener('click', () => modal?.querySelectorAll('[data-role-perm-role="new"]').forEach((checkbox) => { checkbox.checked = false; }));
    document.getElementById('roles-new-template')?.addEventListener('change', (event) => {
        modal?.querySelectorAll('[data-role-perm-role="new"]').forEach((checkbox) => { checkbox.checked = false; });
        const preset = state.roleSystemPresetsResolved.find((p) => p.role_key === event.target.value);
        (preset?.permissions || []).forEach((key) => applyPermissionSelection('new', key, true));
    });
    modal?.querySelectorAll('[data-role-perm-role="new"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => applyPermissionSelection('new', event.target.getAttribute('data-role-perm-key'), event.target.checked)));
    confirmBtn?.addEventListener('click', async () => {
        const label = document.getElementById('roles-new-label')?.value?.trim();
        if (!label) return window.alert('Ingresa un nombre para el rol.');
        const roleKey = slugifyTenant(label).replace(/-/g, '_');
        const selectedKeys = Array.from(modal.querySelectorAll('[data-role-perm-role="new"]:checked')).map((checkbox) => checkbox.getAttribute('data-role-perm-key'));
        confirmBtn.disabled = true; confirmBtn.textContent = 'Guardando...';
        const { data: inserted, error: roleError } = await dbInsert({ table: 'role_catalog', values: [{ tenant_id: effectiveTenantId, role_key: roleKey, label, hierarchy_level: 50, is_system: false }] });
        if (roleError) { window.alert('Error al crear el rol: ' + (roleError.message || String(roleError))); confirmBtn.disabled = false; confirmBtn.textContent = 'Guardar'; return; }
        if (inserted?.[0] && selectedKeys.length > 0) {
            const permissionByKey = new Map((permissionRows || []).map((perm) => [perm.permission_key, perm.id]));
            const payload = selectedKeys.map((key) => permissionByKey.get(key)).filter(Boolean).map((permissionId) => ({ role_id: inserted[0].id, permission_id: permissionId }));
            if (payload.length > 0) await dbInsert({ table: 'role_permissions', values: payload });
        }
        toggleModal(false); await renderRolesModule();
    });
    rolesRoot.querySelectorAll('[data-role-edit]').forEach((button) => button.addEventListener('click', () => {
        const roleId = button.getAttribute('data-role-edit');
        const role = roleById.get(String(roleId));
        if (!role || role.role_key === 'tenant_admin') return;
        editTitle.textContent = 'Permisos de ' + role.label;
        editModal?.querySelectorAll('[data-role-perm-role="edit"]').forEach((checkbox) => { checkbox.checked = false; });
        [...(assignedKeysByRole.get(role.id) || new Set())].forEach((key) => applyPermissionSelection('edit', key, true));
        toggleEditModal(true, role.id);
    }));
    editModal?.querySelectorAll('[data-role-perm-role="edit"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => applyPermissionSelection('edit', event.target.getAttribute('data-role-perm-key'), event.target.checked)));
    document.getElementById('roles-edit-select-all')?.addEventListener('click', () => editModal?.querySelectorAll('[data-role-perm-role="edit"]').forEach((checkbox) => applyPermissionSelection('edit', checkbox.getAttribute('data-role-perm-key'), true)));
    document.getElementById('roles-edit-clear-all')?.addEventListener('click', () => editModal?.querySelectorAll('[data-role-perm-role="edit"]').forEach((checkbox) => { checkbox.checked = false; }));
    editConfirmBtn?.addEventListener('click', async () => {
        const roleId = editModal?.getAttribute('data-edit-role-id');
        const role = roleById.get(String(roleId));
        if (!role || role.role_key === 'tenant_admin') return;
        const selectedKeys = Array.from(editModal.querySelectorAll('[data-role-perm-role="edit"]:checked')).map((checkbox) => checkbox.getAttribute('data-role-perm-key'));
        editConfirmBtn.disabled = true; editConfirmBtn.textContent = 'Guardando...';
        const existingRows = (allAssignedRows || []).filter((row) => String(row.role_id) === String(roleId));
        for (const row of existingRows) await dbDelete({ table: 'role_permissions', filters: [{ op: 'eq', column: 'id', value: row.id }] });
        const permissionByKey = new Map((permissionRows || []).map((perm) => [perm.permission_key, perm.id]));
        const payload = selectedKeys.map((key) => permissionByKey.get(key)).filter(Boolean).map((permissionId) => ({ role_id: roleId, permission_id: permissionId }));
        if (payload.length > 0) await dbInsert({ table: 'role_permissions', values: payload });
        editConfirmBtn.disabled = false; editConfirmBtn.textContent = 'Guardar';
        toggleEditModal(false); await renderRolesModule();
    });
    zyronLog('render:roles:done', { roleCount: (roles || []).length });
};

const defaultInvoiceDocumentSettings = () => ({
    version: 1,
    templateId: 'classic',
    accentHex: '#0f2744',
    footerLegal: '',
    logoDataUrl: '',
    companyDisplayName: '',
    showLineDiscounts: true
});

const mergeInvoiceDocumentSettings = (raw) => {
    const d = raw && typeof raw === 'object' ? raw : {};
    const tpl = String(d.templateId || 'classic');
    return {
        ...defaultInvoiceDocumentSettings(),
        ...d,
        templateId: ['classic', 'minimal', 'compact'].includes(tpl) ? tpl : 'classic',
        accentHex: String(d.accentHex || '#0f2744').slice(0, 9),
        footerLegal: String(d.footerLegal || '').slice(0, 4000),
        logoDataUrl: typeof d.logoDataUrl === 'string' ? d.logoDataUrl : '',
        companyDisplayName: String(d.companyDisplayName || '').slice(0, 200),
        showLineDiscounts: d.showLineDiscounts !== false
    };
};

const documentTemplateCatalog = () => [
    {
        id: 'classic',
        label: 'Clasica',
        description: 'Tabla con bordes, barra de color en cabecera. Apta para oficina y archivo.'
    },
    {
        id: 'minimal',
        label: 'Minimal',
        description: 'Tipografia amplia, poco marco. Ideal para marcas limpias.'
    },
    {
        id: 'compact',
        label: 'Compacta',
        description: 'Alta densidad; util para copia impresa o ticket largo en una pagina.'
    }
];

const INVOICE_DOC_SETTINGS_KEY = 'invoice_document_branding';

const numOrZyron = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
};

/** Lecturas facturacion vía dbSelect (equivalente a edge: get_hints, get_settings, list series/recurrence). */
const fetchTaxHintsViaDb = async (tenantId) => {
    try {
        const { data: srows, error: sErr } = await dbSelect({
            table: 'tenant_fiscal_settings',
            filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }],
            limit: 1
        });
        if (sErr) return { data: null, error: sErr };
        const settings = srows?.[0] || null;
        const defRate = settings ? numOrZyron(settings.default_tax_rate, 18) : 18;
        const label = settings?.tax_label || 'ITBIS';
        let defaultTaxRate = defRate;
        const { data: rates, error: rErr } = await dbSelect({
            table: 'tax_rates_catalog',
            filters: [
                { op: 'eq', column: 'tenant_id', value: tenantId },
                { op: 'eq', column: 'is_active', value: true }
            ],
            order: { column: 'sort_order', ascending: true }
        });
        if (!rErr && rates?.length) {
            const defRow = rates.find((r) => r.is_default);
            if (defRow) defaultTaxRate = numOrZyron(defRow.rate_percent, defRate);
        }
        const body = {
            ok: true,
            defaultTaxRate,
            taxLabel: label,
            pricesTaxInclusive: Boolean(settings?.prices_tax_inclusive),
            ncfEnabled: Boolean(settings?.ncf_enabled),
            countryCode: settings?.country_code || 'DO',
            withholding: {
                isrOnSubtotalPct: numOrZyron(settings?.withholding_isr_on_subtotal_pct, 0),
                itbisOnTaxPct: numOrZyron(settings?.withholding_itbis_on_tax_pct, 0)
            },
            electronicRequested: Boolean(settings?.electronic_invoicing_requested),
            companyRnc: settings?.company_rnc || null,
            companyLegalName: settings?.company_legal_name || null
        };
        return { data: body, error: null };
    } catch (e) {
        return { data: null, error: { message: e?.message || String(e) } };
    }
};

const fetchInvoiceDocSettingsViaDb = async (tenantId) => {
    try {
        const { data: rows, error } = await dbSelect({
            table: 'app_settings',
            filters: [
                { op: 'eq', column: 'tenant_id', value: tenantId },
                { op: 'eq', column: 'setting_key', value: INVOICE_DOC_SETTINGS_KEY }
            ],
            limit: 1
        });
        if (error) return { data: null, error };
        const row = rows?.[0] || null;
        const rawVal = row?.setting_value ?? row?.value ?? '';
        let parsed = {};
        if (rawVal && typeof rawVal === 'string') {
            try {
                parsed = JSON.parse(rawVal);
            } catch (_) {
                parsed = {};
            }
        } else if (rawVal && typeof rawVal === 'object') parsed = rawVal;
        const settings = mergeInvoiceDocumentSettings(parsed);
        const body = {
            ok: true,
            settings,
            templates: documentTemplateCatalog(),
            rowId: row?.id || null
        };
        return { data: body, error: null };
    } catch (e) {
        return { data: null, error: { message: e?.message || String(e) } };
    }
};

const fetchInvoiceSeriesListViaDb = async (tenantId) => {
    const { data, error } = await dbSelect({
        table: 'invoice_series',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }]
    });
    if (error) return { data: { ok: true, rows: [] }, error: null };
    const rows = (data || []).slice().sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
    return { data: { ok: true, rows }, error: null };
};

const fetchInvoiceRecurrenceListViaDb = async (tenantId) => {
    const { data, error } = await dbSelect({
        table: 'invoice_recurrence_templates',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }]
    });
    if (error) return { data: { ok: true, rows: [] }, error: null };
    const rows = (data || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return { data: { ok: true, rows }, error: null };
};

/** Lectura directa: misma consulta que manage-customers `list_segments` (solo SELECT). */
const fetchCustomerSegmentsListViaDb = async (tenantId) => {
    const { data, error } = await dbSelect({
        table: 'customer_segments',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }],
        order: { column: 'sort_order', ascending: true }
    });
    if (error) return { data: { ok: false, error: error.message || String(error) }, error: null };
    return { data: { ok: true, rows: data || [] }, error: null };
};

const customersCsvEscape = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
};

const customersGroupBy = (arr, keyFn) => {
    const m = {};
    for (const x of arr || []) {
        const k = keyFn(x);
        if (!m[k]) m[k] = [];
        m[k].push(x);
    }
    return m;
};

const customersInvoiceOpenBalance = (inv) => {
    const st = String(inv.status || '').toLowerCase();
    if (st === 'draft' || st === 'cancelled' || st === 'void') return 0;
    const bal = Number(inv.total || 0) - Number(inv.amount_paid || 0);
    return bal > 0.0001 ? bal : 0;
};

const customersRound2 = (n) => Math.round(Number(n) * 100) / 100;

const customersLoadOpenBalancesByCustomer = async () => {
    const openMap = new Map();
    const { data: invs } = await dbSelect({
        table: 'invoices',
        columns: 'customer_id,total,amount_paid,status',
        limit: 5000
    });
    for (const inv of invs || []) {
        if (!inv.customer_id) continue;
        const add = customersInvoiceOpenBalance(inv);
        if (add <= 0) continue;
        openMap.set(inv.customer_id, (openMap.get(inv.customer_id) || 0) + add);
    }
    return openMap;
};

const customersLoadSegmentMaps = async (tenantId, customerIds) => {
    const segById = new Map();
    const { data: segs } = await dbSelect({
        table: 'customer_segments',
        columns: '*',
        limit: 500
    });
    for (const s of segs || []) segById.set(s.id, s);
    const membersByCustomer = new Map();
    if (!customerIds.length) return { membersByCustomer, segById };
    const { data: members } = await dbSelect({
        table: 'customer_segment_members',
        columns: 'customer_id,segment_id',
        filters: [{ op: 'in', column: 'customer_id', value: customerIds }],
        limit: 10000
    });
    for (const m of members || []) {
        if (!membersByCustomer.has(m.customer_id)) membersByCustomer.set(m.customer_id, []);
        membersByCustomer.get(m.customer_id).push(m.segment_id);
    }
    return { membersByCustomer, segById };
};

const customersEnrichRow = (c, openMap, membersByCustomer, segById) => {
    const open = openMap.get(c.id) || 0;
    const limRaw = c.credit_limit;
    const lim = limRaw != null && limRaw !== '' ? Number(limRaw) : null;
    const credit_available = lim != null && !Number.isNaN(lim) ? Math.max(0, lim - open) : null;
    const segIds = membersByCustomer.get(c.id) || [];
    const segments = segIds.map((id) => segById.get(id)).filter(Boolean);
    return {
        ...c,
        open_balance: customersRound2(open),
        credit_available: credit_available == null ? null : customersRound2(credit_available),
        segments
    };
};

const customersBuildPatch = (body, isCreate) => {
    const row = {
        name: body.name != null ? String(body.name).trim() || undefined : undefined,
        email: body.email != null ? String(body.email).trim() || null : undefined,
        phone: body.phone != null ? String(body.phone).trim() || null : undefined,
        credit_limit:
            body.creditLimit !== undefined
                ? body.creditLimit === '' || body.creditLimit === null
                    ? null
                    : Number(body.creditLimit)
                : body.credit_limit !== undefined
                  ? body.credit_limit === '' || body.credit_limit === null
                      ? null
                      : Number(body.credit_limit)
                  : undefined,
        tax_id: body.taxId != null ? String(body.taxId).trim() || null : body.tax_id != null ? String(body.tax_id).trim() || null : undefined,
        address: body.address != null ? String(body.address).trim() || null : undefined,
        city: body.city != null ? String(body.city).trim() || null : undefined,
        country: body.country != null ? String(body.country).trim() || null : undefined,
        internal_notes:
            body.internalNotes != null
                ? String(body.internalNotes)
                : body.internal_notes != null
                  ? String(body.internal_notes)
                  : undefined
    };
    if (!isCreate) {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
            if (v !== undefined) out[k] = v;
        }
        if (out.credit_limit !== undefined && out.credit_limit !== null && Number.isNaN(Number(out.credit_limit))) out.credit_limit = null;
        return out;
    }
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        if (v !== undefined) out[k] = v;
    }
    if (out.credit_limit === undefined) out.credit_limit = null;
    if (out.credit_limit !== null && out.credit_limit !== undefined && Number.isNaN(Number(out.credit_limit))) out.credit_limit = null;
    return out;
};

const customersReplaceSegments = async (tenantId, customerId, segmentIds) => {
    await dbDelete({
        table: 'customer_segment_members',
        filters: [
            { op: 'eq', column: 'customer_id', value: customerId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    const uniq = [...new Set(segmentIds)].filter(Boolean);
    for (const segmentId of uniq) {
        await dbInsert({
            table: 'customer_segment_members',
            values: { tenant_id: tenantId, customer_id: customerId, segment_id: segmentId }
        });
    }
};

/** Misma logica que edge manage-customers (IPC). */
const customersManageViaDb = async (body) => {
    const tenantId = body.tenantId;
    const action = body.action;
    if (!tenantId || !action) return { data: { error: 'tenantId and action are required' }, error: null };
    try {
        if (action === 'seed_segments') {
            const defaults = [
                { code: 'vip', label: 'VIP', sort_order: 10, color: '#7c3aed' },
                { code: 'mayorista', label: 'Mayorista', sort_order: 20, color: '#0369a1' },
                { code: 'minorista', label: 'Minorista', sort_order: 30, color: '#4d7c0f' },
                { code: 'moroso', label: 'Seguimiento cobro', sort_order: 90, color: '#b91c1c' }
            ];
            for (const d of defaults) {
                const ins = await dbInsert({
                    table: 'customer_segments',
                    values: {
                        tenant_id: tenantId,
                        code: d.code,
                        label: d.label,
                        sort_order: d.sort_order,
                        color: d.color
                    }
                });
                const msg = ins.error?.message || '';
                if (ins.error && !/duplicate|unique/i.test(msg)) {
                    return { data: { error: msg || 'seed failed' }, error: null };
                }
            }
            const { data: rows, error } = await dbSelect({
                table: 'customer_segments',
                order: { column: 'sort_order', ascending: true },
                limit: 500
            });
            if (error) return { data: { error: error.message }, error: null };
            return { data: { ok: true, rows: rows || [] }, error: null };
        }
        if (action === 'upsert_segment') {
            const id = body.id || null;
            const code = String(body.code || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_');
            const label = String(body.label || '').trim();
            if (!code || !label) return { data: { error: 'code and label required' }, error: null };
            const patch = {
                code,
                label,
                color: body.color || null,
                sort_order: Number(body.sortOrder ?? body.sort_order ?? 0)
            };
            if (id) {
                const r = await dbUpdate({
                    table: 'customer_segments',
                    values: patch,
                    filters: [
                        { op: 'eq', column: 'id', value: id },
                        { op: 'eq', column: 'tenant_id', value: tenantId }
                    ]
                });
                const row = Array.isArray(r.data) ? r.data[0] : r.data;
                if (r.error || !row) return { data: { error: r.error?.message || 'update failed' }, error: null };
                return { data: { ok: true, segment: row }, error: null };
            }
            const r = await dbInsert({
                table: 'customer_segments',
                values: { tenant_id: tenantId, ...patch }
            });
            const row = Array.isArray(r.data) ? r.data[0] : r.data;
            if (r.error || !row) return { data: { error: r.error?.message || 'insert failed' }, error: null };
            return { data: { ok: true, segment: row }, error: null };
        }
        if (action === 'delete_segment') {
            const segmentId = body.segmentId;
            if (!segmentId) return { data: { error: 'segmentId required' }, error: null };
            const r = await dbDelete({
                table: 'customer_segments',
                filters: [
                    { op: 'eq', column: 'id', value: segmentId },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ]
            });
            if (r.error) return { data: { error: r.error.message }, error: null };
            return { data: { ok: true }, error: null };
        }
        if (action === 'list_customers') {
            const q = body.q ? String(body.q).trim().toLowerCase() : '';
            const segmentId = body.segmentId || null;
            const includeInactive = Boolean(body.includeInactive);
            const { data: customers, error: cErr } = await dbSelect({
                table: 'customers',
                order: { column: 'name', ascending: true },
                limit: 800
            });
            if (cErr) return { data: { ok: false, error: cErr.message, rows: [] }, error: null };
            let rows = customers || [];
            if (!includeInactive) rows = rows.filter((c) => c.is_active !== false);
            if (q) {
                rows = rows.filter((c) => {
                    const blob = [c.name, c.email, c.phone, c.tax_id, c.city, c.country]
                        .map((x) => String(x || '').toLowerCase())
                        .join(' ');
                    return blob.includes(q);
                });
            }
            const openMap = await customersLoadOpenBalancesByCustomer();
            const { membersByCustomer, segById } = await customersLoadSegmentMaps(
                tenantId,
                rows.map((r) => r.id)
            );
            if (segmentId) {
                rows = rows.filter((c) => (membersByCustomer.get(c.id) || []).some((sid) => sid === segmentId));
            }
            const enriched = rows.map((c) => customersEnrichRow(c, openMap, membersByCustomer, segById));
            return { data: { ok: true, rows: enriched }, error: null };
        }
        if (action === 'get_customer') {
            const customerId = body.customerId;
            if (!customerId) return { data: { error: 'customerId required' }, error: null };
            const { data: custRows, error } = await dbSelect({
                table: 'customers',
                filters: [
                    { op: 'eq', column: 'id', value: customerId },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ],
                limit: 1
            });
            if (error || !custRows?.length) return { data: { error: error?.message || 'not found' }, error: null };
            const c = custRows[0];
            const openMap = await customersLoadOpenBalancesByCustomer();
            const { membersByCustomer, segById } = await customersLoadSegmentMaps(tenantId, [c.id]);
            const row = customersEnrichRow(c, openMap, membersByCustomer, segById);
            const segmentIds = membersByCustomer.get(c.id) || [];
            return { data: { ok: true, customer: row, segmentIds }, error: null };
        }
        if (action === 'create_customer') {
            const nm = String(body.name || '').trim();
            if (!nm) return { data: { error: 'name required' }, error: null };
            const insertRow = { tenant_id: tenantId, ...customersBuildPatch(body, true) };
            insertRow.name = nm;
            let ins = await dbInsert({ table: 'customers', values: insertRow });
            let data = ins.data;
            let err = ins.error;
            if (err && /column .* does not exist/i.test(String(err.message || ''))) {
                const slim = {
                    tenant_id: tenantId,
                    name: insertRow.name,
                    email: insertRow.email || null,
                    phone: insertRow.phone || null,
                    credit_limit: insertRow.credit_limit ?? null
                };
                ins = await dbInsert({ table: 'customers', values: slim });
                data = ins.data;
                err = ins.error;
            }
            const row0 = Array.isArray(data) ? data[0] : data;
            if (err || !row0) return { data: { error: err?.message || 'insert failed' }, error: null };
            const customer = row0;
            if (Array.isArray(body.segmentIds) && body.segmentIds.length) {
                await customersReplaceSegments(tenantId, customer.id, body.segmentIds);
            }
            return { data: { ok: true, customer }, error: null };
        }
        if (action === 'update_customer') {
            const customerId = body.customerId;
            if (!customerId) return { data: { error: 'customerId required' }, error: null };
            const patch = customersBuildPatch(body, false);
            let data;
            let err;
            if (Object.keys(patch).length > 0) {
                let r = await dbUpdate({
                    table: 'customers',
                    values: patch,
                    filters: [
                        { op: 'eq', column: 'id', value: customerId },
                        { op: 'eq', column: 'tenant_id', value: tenantId }
                    ]
                });
                data = r.data;
                err = r.error;
                if (err && /column .* does not exist/i.test(String(err.message || ''))) {
                    const slim = {};
                    if (patch.name != null) slim.name = patch.name;
                    if (patch.email != null) slim.email = patch.email;
                    if (patch.phone != null) slim.phone = patch.phone;
                    if (patch.credit_limit !== undefined) slim.credit_limit = patch.credit_limit;
                    r = await dbUpdate({
                        table: 'customers',
                        values: slim,
                        filters: [
                            { op: 'eq', column: 'id', value: customerId },
                            { op: 'eq', column: 'tenant_id', value: tenantId }
                        ]
                    });
                    data = r.data;
                    err = r.error;
                }
                const row0 = Array.isArray(data) ? data[0] : data;
                if (err || !row0) return { data: { error: err?.message || 'update failed' }, error: null };
                data = [row0];
            } else {
                const { data: rows, error: gErr } = await dbSelect({
                    table: 'customers',
                    filters: [
                        { op: 'eq', column: 'id', value: customerId },
                        { op: 'eq', column: 'tenant_id', value: tenantId }
                    ],
                    limit: 1
                });
                if (gErr || !rows?.length) return { data: { error: gErr?.message || 'not found' }, error: null };
                data = rows;
            }
            if (Array.isArray(body.segmentIds)) {
                await customersReplaceSegments(tenantId, customerId, body.segmentIds);
            }
            const row = Array.isArray(data) ? data[0] : data;
            return { data: { ok: true, customer: row }, error: null };
        }
        if (action === 'set_customer_active') {
            const { customerId, isActive } = body;
            if (!customerId) return { data: { error: 'customerId required' }, error: null };
            const r = await dbUpdate({
                table: 'customers',
                values: { is_active: Boolean(isActive) },
                filters: [
                    { op: 'eq', column: 'id', value: customerId },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ]
            });
            const msg = r.error?.message || '';
            if (r.error && /is_active|column .* does not exist/i.test(msg)) {
                return { data: { error: 'Columna is_active no disponible; aplica customers_module_advanced.sql' }, error: null };
            }
            const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
            if (r.error || !row0) return { data: { error: msg || 'update failed' }, error: null };
            return { data: { ok: true, customer: row0 }, error: null };
        }
        if (action === 'set_customer_segments') {
            const customerId = body.customerId;
            if (!customerId) return { data: { error: 'customerId required' }, error: null };
            const ids = Array.isArray(body.segmentIds) ? body.segmentIds : [];
            await customersReplaceSegments(tenantId, customerId, ids);
            return { data: { ok: true }, error: null };
        }
        if (action === 'purchase_history') {
            const customerId = body.customerId;
            if (!customerId) return { data: { error: 'customerId required' }, error: null };
            const limit = Math.min(80, Math.max(1, Number(body.limit || 40)));
            const { data: invoices, error: invErr } = await dbSelect({
                table: 'invoices',
                columns: 'id,series,number,total,amount_paid,status,invoice_type,currency,created_at,notes',
                filters: [{ op: 'eq', column: 'customer_id', value: customerId }],
                order: { column: 'created_at', ascending: false },
                limit
            });
            if (invErr) {
                return { data: { ok: false, error: invErr.message, invoices: [], itemsByInvoice: {} }, error: null };
            }
            const invList = invoices || [];
            const ids = invList.map((i) => i.id);
            let itemsByInvoice = {};
            if (ids.length) {
                const { data: items, error: itErr } = await dbSelect({
                    table: 'invoice_items',
                    columns: '*',
                    filters: [{ op: 'in', column: 'invoice_id', value: ids }],
                    limit: 5000
                });
                if (!itErr && items) itemsByInvoice = customersGroupBy(items, (r) => r.invoice_id);
            }
            return { data: { ok: true, invoices: invList, itemsByInvoice }, error: null };
        }
        if (action === 'export_customers') {
            const format = String(body.format || 'csv').toLowerCase();
            const { data: customers, error: cErr } = await dbSelect({
                table: 'customers',
                order: { column: 'name', ascending: true },
                limit: 5000
            });
            if (cErr) return { data: { ok: false, error: cErr.message }, error: null };
            const rows = customers || [];
            const openMap = await customersLoadOpenBalancesByCustomer();
            const { membersByCustomer, segById } = await customersLoadSegmentMaps(tenantId, rows.map((r) => r.id));
            const enriched = rows.map((c) => customersEnrichRow(c, openMap, membersByCustomer, segById));
            if (format === 'json') {
                return { data: { ok: true, format: 'json', rows: enriched }, error: null };
            }
            const headers = [
                'id',
                'name',
                'email',
                'phone',
                'tax_id',
                'city',
                'country',
                'credit_limit',
                'open_balance',
                'credit_available',
                'segments',
                'is_active'
            ];
            const lines = [headers.join(',')];
            for (const r of enriched) {
                const seg = (r.segments || []).map((s) => s.label || s.code).join(';');
                lines.push(
                    [
                        customersCsvEscape(r.id),
                        customersCsvEscape(r.name),
                        customersCsvEscape(r.email),
                        customersCsvEscape(r.phone),
                        customersCsvEscape(r.tax_id),
                        customersCsvEscape(r.city),
                        customersCsvEscape(r.country),
                        r.credit_limit == null ? '' : String(r.credit_limit),
                        String(r.open_balance ?? ''),
                        r.credit_available == null ? '' : String(r.credit_available),
                        customersCsvEscape(seg),
                        r.is_active === false ? '0' : '1'
                    ].join(',')
                );
            }
            const csv = '\ufeff' + lines.join('\n');
            return { data: { ok: true, format: 'csv', filename: 'clientes.csv', csv }, error: null };
        }
        return { data: { error: 'Unknown action' }, error: null };
    } catch (e) {
        return { data: { error: e?.message || String(e) }, error: null };
    }
};

const productsNumOr = (v, def) => {
    if (v === null || v === undefined || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
};

const productsCsvEsc = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
};

const productsSyncDefaultWarehouseStock = async (tenantId, productId, stockQty, itemKind, tracksStock) => {
    try {
        if (String(itemKind || '').toLowerCase() === 'service') return;
        if (tracksStock === false) return;
        const { data: wh } = await dbSelect({
            table: 'warehouses',
            columns: 'id',
            filters: [{ op: 'eq', column: 'is_default', value: true }],
            limit: 1
        });
        const wid = wh?.[0]?.id;
        if (!wid) return;
        const n = Number(stockQty);
        const qty = Number.isFinite(n) ? n : 0;
        const nowIso = new Date().toISOString();
        const { data: ex } = await dbSelect({
            table: 'warehouse_stock',
            columns: 'warehouse_id',
            filters: [
                { op: 'eq', column: 'warehouse_id', value: wid },
                { op: 'eq', column: 'product_id', value: productId }
            ],
            limit: 1
        });
        if (ex?.length) {
            await dbUpdate({
                table: 'warehouse_stock',
                values: { quantity: qty, updated_at: nowIso },
                filters: [
                    { op: 'eq', column: 'warehouse_id', value: wid },
                    { op: 'eq', column: 'product_id', value: productId }
                ]
            });
        } else {
            await dbInsert({
                table: 'warehouse_stock',
                values: { warehouse_id: wid, product_id: productId, quantity: qty, updated_at: nowIso }
            });
        }
    } catch (_) {
        /* almacenes opcionales */
    }
};

const productsInvokeListCatalogLike = async (tenantId, rows) => {
    const [{ data: cats }, { data: unts }] = await Promise.all([
        dbSelect({
            table: 'product_categories',
            columns: 'id,label,code',
            limit: 500
        }),
        dbSelect({
            table: 'measurement_units',
            columns: 'id,label,code,symbol',
            limit: 500
        })
    ]);
    const catMap = new Map((cats || []).map((c) => [c.id, c]));
    const unitMap = new Map((unts || []).map((u) => [u.id, u]));
    return (rows || []).map((p) => ({
        ...p,
        category: p.category_id ? catMap.get(p.category_id) : null,
        unit: p.unit_id ? unitMap.get(p.unit_id) : null
    }));
};

/** Misma logica que edge manage-products (IPC). */
const productsManageViaDb = async (body) => {
    const tenantId = body.tenantId;
    const action = body.action;
    if (!tenantId || !action) return { data: { error: 'tenantId and action are required' }, error: null };
    try {
        if (action === 'seed_categories') {
            const defaults = [
                { code: 'general', label: 'General', sort_order: 10 },
                { code: 'servicios', label: 'Servicios', sort_order: 20 },
                { code: 'repuestos', label: 'Repuestos', sort_order: 30 }
            ];
            for (const d of defaults) {
                const ins = await dbInsert({
                    table: 'product_categories',
                    values: { tenant_id: tenantId, code: d.code, label: d.label, sort_order: d.sort_order }
                });
                const msg = ins.error?.message || '';
                if (ins.error && !/duplicate|unique/i.test(msg)) {
                    return { data: { error: msg || 'seed failed' }, error: null };
                }
            }
            const { data: rows, error } = await dbSelect({
                table: 'product_categories',
                order: { column: 'sort_order', ascending: true },
                limit: 500
            });
            if (error) return { data: { error: error.message }, error: null };
            return { data: { ok: true, rows: rows || [] }, error: null };
        }
        if (action === 'list_categories') {
            const { data, error } = await dbSelect({
                table: 'product_categories',
                order: { column: 'sort_order', ascending: true },
                limit: 500
            });
            if (error) return { data: { ok: true, rows: [], err: error.message }, error: null };
            return { data: { ok: true, rows: data || [] }, error: null };
        }
        if (action === 'upsert_category') {
            const id = body.id || null;
            const code = String(body.code || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_');
            const label = String(body.label || '').trim();
            if (!code || !label) return { data: { error: 'code and label required' }, error: null };
            const row = {
                code,
                label,
                parent_id: body.parentId || body.parent_id || null,
                sort_order: Number(body.sortOrder ?? body.sort_order ?? 0)
            };
            if (id) {
                const r = await dbUpdate({
                    table: 'product_categories',
                    values: row,
                    filters: [
                        { op: 'eq', column: 'id', value: id },
                        { op: 'eq', column: 'tenant_id', value: tenantId }
                    ]
                });
                const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
                if (r.error || !row0) return { data: { error: r.error?.message || 'update failed' }, error: null };
                return { data: { ok: true, category: row0 }, error: null };
            }
            const r = await dbInsert({
                table: 'product_categories',
                values: { tenant_id: tenantId, ...row }
            });
            const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
            if (r.error || !row0) return { data: { error: r.error?.message || 'insert failed' }, error: null };
            return { data: { ok: true, category: row0 }, error: null };
        }
        if (action === 'delete_category') {
            const categoryId = body.categoryId;
            if (!categoryId) return { data: { error: 'categoryId required' }, error: null };
            const r = await dbDelete({
                table: 'product_categories',
                filters: [
                    { op: 'eq', column: 'id', value: categoryId },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ]
            });
            if (r.error) return { data: { error: r.error.message }, error: null };
            return { data: { ok: true }, error: null };
        }
        if (action === 'list_units') {
            const { data, error } = await dbSelect({
                table: 'measurement_units',
                order: { column: 'sort_order', ascending: true },
                limit: 500
            });
            if (error) return { data: { ok: true, rows: [], err: error.message }, error: null };
            return { data: { ok: true, rows: data || [] }, error: null };
        }
        if (action === 'seed_units') {
            const defaults = [
                { code: 'unit', label: 'Unidad', symbol: 'u', sort_order: 10 },
                { code: 'hour', label: 'Hora', symbol: 'h', sort_order: 20 },
                { code: 'day', label: 'Dia', symbol: 'd', sort_order: 30 },
                { code: 'kg', label: 'Kilogramo', symbol: 'kg', sort_order: 40 },
                { code: 'g', label: 'Gramo', symbol: 'g', sort_order: 50 },
                { code: 'lb', label: 'Libra', symbol: 'lb', sort_order: 60 },
                { code: 'm', label: 'Metro', symbol: 'm', sort_order: 70 },
                { code: 'm2', label: 'Metro cuadrado', symbol: 'm2', sort_order: 80 },
                { code: 'm3', label: 'Metro cubico', symbol: 'm3', sort_order: 90 },
                { code: 'box', label: 'Caja', symbol: 'cj', sort_order: 100 },
                { code: 'pack', label: 'Paquete', symbol: 'paq', sort_order: 110 }
            ];
            for (const d of defaults) {
                const ins = await dbInsert({
                    table: 'measurement_units',
                    values: {
                        tenant_id: tenantId,
                        code: d.code,
                        label: d.label,
                        symbol: d.symbol,
                        sort_order: d.sort_order
                    }
                });
                const msg = ins.error?.message || '';
                if (ins.error && !/duplicate|unique/i.test(msg)) {
                    return { data: { error: msg || 'seed failed' }, error: null };
                }
            }
            const { data: rows, error } = await dbSelect({
                table: 'measurement_units',
                order: { column: 'sort_order', ascending: true },
                limit: 500
            });
            if (error) return { data: { error: error.message }, error: null };
            return { data: { ok: true, rows: rows || [] }, error: null };
        }
        if (action === 'delete_unit') {
            const unitId = body.unitId;
            if (!unitId) return { data: { error: 'unitId required' }, error: null };
            const r = await dbDelete({
                table: 'measurement_units',
                filters: [
                    { op: 'eq', column: 'id', value: unitId },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ]
            });
            if (r.error) return { data: { error: r.error.message }, error: null };
            return { data: { ok: true }, error: null };
        }
        if (action === 'list_catalog') {
            const q = body.q ? String(body.q).trim().toLowerCase() : '';
            const categoryId = body.categoryId || null;
            const itemKind = body.itemKind ? String(body.itemKind).toLowerCase() : null;
            const includeInactive = Boolean(body.includeInactive);
            const { data: prows, error: pErr } = await dbSelect({
                table: 'products',
                order: { column: 'name', ascending: true },
                limit: 1000
            });
            if (pErr) return { data: { ok: false, error: pErr.message, rows: [] }, error: null };
            let rows = prows || [];
            if (!includeInactive) rows = rows.filter((p) => p.is_active !== false);
            if (itemKind === 'product' || itemKind === 'service') {
                rows = rows.filter((p) => String(p.item_kind || 'product').toLowerCase() === itemKind);
            }
            if (categoryId) rows = rows.filter((p) => String(p.category_id || '') === String(categoryId));
            if (q) {
                rows = rows.filter((p) => {
                    const blob = [p.name, p.sku, p.description].map((x) => String(x || '').toLowerCase()).join(' ');
                    return blob.includes(q);
                });
            }
            const enriched = await productsInvokeListCatalogLike(tenantId, rows);
            return { data: { ok: true, rows: enriched }, error: null };
        }
        if (action === 'get_product') {
            const productId = body.productId;
            if (!productId) return { data: { error: 'productId required' }, error: null };
            const { data, error } = await dbSelect({
                table: 'products',
                filters: [
                    { op: 'eq', column: 'id', value: productId },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ],
                limit: 1
            });
            if (error || !data?.length) return { data: { error: error?.message || 'not found' }, error: null };
            return { data: { ok: true, product: data[0] }, error: null };
        }
        if (action === 'create_product') {
            const sku = String(body.sku || '').trim();
            const name = String(body.name || '').trim();
            if (!sku || !name) return { data: { error: 'sku and name required' }, error: null };
            const itemKind = String(body.itemKind || body.item_kind || 'product').toLowerCase() === 'service' ? 'service' : 'product';
            const tracksStock =
                itemKind === 'service'
                    ? false
                    : body.tracksStock !== undefined
                      ? Boolean(body.tracksStock)
                      : body.tracks_stock !== undefined
                        ? Boolean(body.tracks_stock)
                        : true;
            const insertRow = {
                tenant_id: tenantId,
                sku,
                name,
                description: body.description != null ? String(body.description) : null,
                price: productsNumOr(body.price, 0),
                stock: itemKind === 'service' && !tracksStock ? 0 : productsNumOr(body.stock, 0),
                min_stock: productsNumOr(body.minStock ?? body.min_stock, 0),
                category_id: body.categoryId || body.category_id || null,
                unit_id: body.unitId || body.unit_id || null,
                item_kind: itemKind,
                tracks_stock: tracksStock,
                tax_rate_default: productsNumOr(body.tax_rate_default ?? body.taxRateDefault, 18),
                discount_default: productsNumOr(body.discount_default ?? body.discountDefault, 0),
                cost_price:
                    body.costPrice != null || body.cost_price != null ? productsNumOr(body.costPrice ?? body.cost_price, null) : null,
                is_active: body.isActive === false || body.is_active === false ? false : true
            };
            let ins = await dbInsert({ table: 'products', values: insertRow });
            let data = ins.data;
            let err = ins.error;
            if (err && /column .* does not exist/i.test(String(err.message || ''))) {
                const slim = {
                    tenant_id: tenantId,
                    sku,
                    name,
                    description: insertRow.description,
                    price: insertRow.price,
                    stock: insertRow.stock,
                    min_stock: insertRow.min_stock
                };
                ins = await dbInsert({ table: 'products', values: slim });
                data = ins.data;
                err = ins.error;
            }
            const row0 = Array.isArray(data) ? data[0] : data;
            if (err || !row0) return { data: { error: err?.message || 'insert failed' }, error: null };
            await productsSyncDefaultWarehouseStock(tenantId, row0.id, row0.stock, row0.item_kind, row0.tracks_stock);
            return { data: { ok: true, product: row0 }, error: null };
        }
        if (action === 'update_product') {
            const productId = body.productId;
            if (!productId) return { data: { error: 'productId required' }, error: null };
            const patch = {};
            if (body.sku != null) patch.sku = String(body.sku).trim();
            if (body.name != null) patch.name = String(body.name).trim();
            if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description);
            if (body.price !== undefined) patch.price = productsNumOr(body.price, 0);
            if (body.stock !== undefined) patch.stock = productsNumOr(body.stock, 0);
            if (body.minStock !== undefined || body.min_stock !== undefined) patch.min_stock = productsNumOr(body.minStock ?? body.min_stock, 0);
            if (body.categoryId !== undefined || body.category_id !== undefined) {
                patch.category_id = body.categoryId ?? body.category_id ?? null;
            }
            if (body.unitId !== undefined || body.unit_id !== undefined) patch.unit_id = body.unitId ?? body.unit_id ?? null;
            if (body.itemKind != null || body.item_kind != null) {
                const ik = String(body.itemKind || body.item_kind).toLowerCase();
                patch.item_kind = ik === 'service' ? 'service' : 'product';
            }
            if (body.tracksStock !== undefined || body.tracks_stock !== undefined) {
                patch.tracks_stock = Boolean(body.tracksStock ?? body.tracks_stock);
            }
            if (body.taxRateDefault !== undefined || body.tax_rate_default !== undefined) {
                patch.tax_rate_default = productsNumOr(body.taxRateDefault ?? body.tax_rate_default, null);
            }
            if (body.discountDefault !== undefined || body.discount_default !== undefined) {
                patch.discount_default = productsNumOr(body.discountDefault ?? body.discount_default, 0);
            }
            if (body.costPrice !== undefined || body.cost_price !== undefined) {
                patch.cost_price =
                    body.costPrice == null && body.cost_price == null ? null : productsNumOr(body.costPrice ?? body.cost_price, null);
            }
            if (body.isActive !== undefined || body.is_active !== undefined) {
                patch.is_active = Boolean(body.isActive ?? body.is_active);
            }
            let r = await dbUpdate({
                table: 'products',
                values: patch,
                filters: [
                    { op: 'eq', column: 'id', value: productId },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ]
            });
            let data = r.data;
            let err = r.error;
            if (err && /column .* does not exist/i.test(String(err.message || ''))) {
                const slim = {};
                for (const k of ['sku', 'name', 'description', 'price', 'stock', 'min_stock']) {
                    if (patch[k] !== undefined) slim[k] = patch[k];
                }
                r = await dbUpdate({
                    table: 'products',
                    values: slim,
                    filters: [
                        { op: 'eq', column: 'id', value: productId },
                        { op: 'eq', column: 'tenant_id', value: tenantId }
                    ]
                });
                data = r.data;
                err = r.error;
            }
            const row0 = Array.isArray(data) ? data[0] : data;
            if (err || !row0) return { data: { error: err?.message || 'update failed' }, error: null };
            if (patch.stock !== undefined || patch.item_kind !== undefined || patch.tracks_stock !== undefined) {
                await productsSyncDefaultWarehouseStock(tenantId, productId, row0.stock, row0.item_kind, row0.tracks_stock);
            }
            return { data: { ok: true, product: row0 }, error: null };
        }
        if (action === 'export_catalog') {
            const { data: prows, error: pErr } = await dbSelect({
                table: 'products',
                order: { column: 'sku', ascending: true },
                limit: 5000
            });
            if (pErr) return { data: { ok: false, error: pErr.message }, error: null };
            const res = await productsInvokeListCatalogLike(tenantId, prows || []);
            const lines = [
                [
                    'sku',
                    'name',
                    'item_kind',
                    'price',
                    'cost_price',
                    'stock',
                    'tracks_stock',
                    'tax_rate_default',
                    'discount_default',
                    'category',
                    'unit',
                    'is_active'
                ].join(',')
            ];
            for (const r of res) {
                lines.push(
                    [
                        productsCsvEsc(r.sku),
                        productsCsvEsc(r.name),
                        r.item_kind || 'product',
                        String(r.price ?? ''),
                        r.cost_price == null ? '' : String(r.cost_price),
                        String(r.stock ?? ''),
                        r.tracks_stock === false ? '0' : '1',
                        r.tax_rate_default == null ? '' : String(r.tax_rate_default),
                        r.discount_default == null ? '' : String(r.discount_default),
                        productsCsvEsc(r.category?.label || ''),
                        productsCsvEsc(r.unit?.label || ''),
                        r.is_active === false ? '0' : '1'
                    ].join(',')
                );
            }
            const csv = '\ufeff' + lines.join('\n');
            return { data: { ok: true, format: 'csv', filename: 'catalogo_productos.csv', csv }, error: null };
        }
        return { data: { error: 'Unknown action' }, error: null };
    } catch (e) {
        return { data: { error: e?.message || String(e) }, error: null };
    }
};

const fiscalNumOr = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
};

/** Misma logica que edge manage-tax-compliance (IPC). */
const taxComplianceManageViaDb = async (body) => {
    const tenantId = body.tenantId;
    const action = body.action;
    if (!tenantId || !action) return { data: { error: 'tenantId and action are required' }, error: null };
    try {
        if (action === 'get_settings') {
            const { data: rows, error: err } = await dbSelect({
                table: 'tenant_fiscal_settings',
                limit: 1
            });
            const msg = err?.message || '';
            if (err && /does not exist|relation/i.test(msg)) {
                return { data: { ok: true, settings: null, missingSql: true }, error: null };
            }
            if (err) return { data: { ok: false, error: msg }, error: null };
            return { data: { ok: true, settings: rows?.[0] || null }, error: null };
        }
        if (action === 'upsert_settings') {
            const { data: existingRows } = await dbSelect({
                table: 'tenant_fiscal_settings',
                filters: [{ column: 'tenant_id', op: 'eq', value: tenantId }],
                limit: 1
            });
            const cur = existingRows?.[0] || {};
            const has = (a, b) => body[a] !== undefined || body[b] !== undefined;
            const row = {
                tenant_id: tenantId,
                country_code: has('countryCode', 'country_code')
                    ? String(body.countryCode || body.country_code || 'DO')
                          .slice(0, 2)
                          .toUpperCase()
                    : cur.country_code || 'DO',
                tax_label: has('taxLabel', 'tax_label')
                    ? String(body.taxLabel || body.tax_label || 'ITBIS').slice(0, 40)
                    : cur.tax_label || 'ITBIS',
                default_tax_rate: has('defaultTaxRate', 'default_tax_rate')
                    ? fiscalNumOr(body.defaultTaxRate ?? body.default_tax_rate, 18)
                    : fiscalNumOr(cur.default_tax_rate, 18),
                prices_tax_inclusive: has('pricesTaxInclusive', 'prices_tax_inclusive')
                    ? Boolean(body.pricesTaxInclusive ?? body.prices_tax_inclusive)
                    : Boolean(cur.prices_tax_inclusive),
                ncf_enabled: has('ncfEnabled', 'ncf_enabled') ? Boolean(body.ncfEnabled ?? body.ncf_enabled) : Boolean(cur.ncf_enabled),
                electronic_invoicing_requested: has('electronicInvoicingRequested', 'electronic_invoicing_requested')
                    ? Boolean(body.electronicInvoicingRequested ?? body.electronic_invoicing_requested)
                    : Boolean(cur.electronic_invoicing_requested),
                company_rnc: has('companyRnc', 'company_rnc')
                    ? String(body.companyRnc ?? body.company_rnc ?? '').trim() || null
                    : cur.company_rnc ?? null,
                company_legal_name: has('companyLegalName', 'company_legal_name')
                    ? String(body.companyLegalName ?? body.company_legal_name ?? '').trim() || null
                    : cur.company_legal_name ?? null,
                fiscal_notes: has('fiscalNotes', 'fiscal_notes')
                    ? String(body.fiscalNotes ?? body.fiscal_notes ?? '').trim() || null
                    : cur.fiscal_notes ?? null,
                compliance_ack_at: has('complianceAckAt', 'compliance_ack_at')
                    ? body.complianceAckAt || body.compliance_ack_at || null
                    : cur.compliance_ack_at ?? null,
                withholding_isr_on_subtotal_pct: has('withholdingIsrOnSubtotalPct', 'withholding_isr_on_subtotal_pct')
                    ? fiscalNumOr(body.withholdingIsrOnSubtotalPct ?? body.withholding_isr_on_subtotal_pct, 0)
                    : fiscalNumOr(cur.withholding_isr_on_subtotal_pct, 0),
                withholding_itbis_on_tax_pct: has('withholdingItbisOnTaxPct', 'withholding_itbis_on_tax_pct')
                    ? fiscalNumOr(body.withholdingItbisOnTaxPct ?? body.withholding_itbis_on_tax_pct, 0)
                    : fiscalNumOr(cur.withholding_itbis_on_tax_pct, 0),
                updated_at: new Date().toISOString()
            };
            const { data: ex } = await dbSelect({ table: 'tenant_fiscal_settings', columns: 'id', filters: [{ column: 'tenant_id', op: 'eq', value: tenantId }], limit: 1 });
            let out;
            if (ex?.length) {
                const r = await dbUpdate({
                    table: 'tenant_fiscal_settings',
                    values: row,
                    filters: [{ column: 'tenant_id', op: 'eq', value: tenantId }]
                });
                const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
                if (r.error || !row0) return { data: { error: r.error?.message || 'update failed' }, error: null };
                out = row0;
            } else {
                const r = await dbInsert({ table: 'tenant_fiscal_settings', values: row });
                const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
                if (r.error || !row0) return { data: { error: r.error?.message || 'insert failed' }, error: null };
                out = row0;
            }
            return { data: { ok: true, settings: out }, error: null };
        }
        if (action === 'list_tax_rates') {
            const { data, error } = await dbSelect({
                table: 'tax_rates_catalog',
                order: { column: 'sort_order', ascending: true },
                limit: 500
            });
            if (error && /does not exist|relation/i.test(error.message || '')) {
                return { data: { ok: true, rows: [] }, error: null };
            }
            if (error) return { data: { ok: false, error: error.message, rows: [] }, error: null };
            return { data: { ok: true, rows: data || [] }, error: null };
        }
        if (action === 'upsert_tax_rate') {
            const code = String(body.code || '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_');
            const label = String(body.label || '').trim();
            if (!code || !label) return { data: { error: 'code and label required' }, error: null };
            const id = body.id || null;
            const row = {
                tenant_id: tenantId,
                code,
                label,
                rate_percent: fiscalNumOr(body.ratePercent ?? body.rate_percent, 0),
                is_default: Boolean(body.isDefault ?? body.is_default),
                is_active: body.isActive === false || body.is_active === false ? false : true,
                sort_order: fiscalNumOr(body.sortOrder ?? body.sort_order, 0)
            };
            if (row.is_default) {
                await dbUpdate({
                    table: 'tax_rates_catalog',
                    values: { is_default: false },
                    filters: []
                });
            }
            if (id) {
                const r = await dbUpdate({
                    table: 'tax_rates_catalog',
                    values: row,
                    filters: [
                        { op: 'eq', column: 'id', value: id },
                        { op: 'eq', column: 'tenant_id', value: tenantId }
                    ]
                });
                const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
                if (r.error || !row0) return { data: { error: r.error?.message || 'update failed' }, error: null };
                return { data: { ok: true, rate: row0 }, error: null };
            }
            const r = await dbInsert({ table: 'tax_rates_catalog', values: row });
            const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
            if (r.error || !row0) return { data: { error: r.error?.message || 'insert failed' }, error: null };
            return { data: { ok: true, rate: row0 }, error: null };
        }
        if (action === 'delete_tax_rate') {
            const id = body.id;
            if (!id) return { data: { error: 'id required' }, error: null };
            const r = await dbDelete({
                table: 'tax_rates_catalog',
                filters: [
                    { op: 'eq', column: 'id', value: id },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ]
            });
            if (r.error) return { data: { error: r.error.message }, error: null };
            return { data: { ok: true }, error: null };
        }
        if (action === 'seed_tax_rates_do') {
            const seeds = [
                { code: 'itbis_18', label: 'ITBIS tasa general 18%', rate_percent: 18, sort_order: 10, is_default: true },
                { code: 'itbis_16', label: 'ITBIS tasa reducida 16%', rate_percent: 16, sort_order: 20, is_default: false },
                { code: 'exento', label: 'Exento 0%', rate_percent: 0, sort_order: 30, is_default: false }
            ];
            for (const s of seeds) {
                const ins = await dbInsert({
                    table: 'tax_rates_catalog',
                    values: {
                        tenant_id: tenantId,
                        code: s.code,
                        label: s.label,
                        rate_percent: s.rate_percent,
                        sort_order: s.sort_order,
                        is_default: s.is_default,
                        is_active: true
                    }
                });
                const msg = ins.error?.message || '';
                if (ins.error && !/duplicate|unique/i.test(msg)) {
                    return { data: { error: msg }, error: null };
                }
            }
            const { data } = await dbSelect({
                table: 'tax_rates_catalog',
                order: { column: 'sort_order', ascending: true },
                limit: 500
            });
            return { data: { ok: true, rows: data || [] }, error: null };
        }
        if (action === 'list_ncf_sequences') {
            const { data, error } = await dbSelect({
                table: 'ncf_sequences',
                order: { column: 'invoice_series_match', ascending: true },
                limit: 500
            });
            if (error && /does not exist|relation/i.test(error.message || '')) {
                return { data: { ok: true, rows: [] }, error: null };
            }
            if (error) return { data: { ok: false, error: error.message, rows: [] }, error: null };
            return { data: { ok: true, rows: data || [] }, error: null };
        }
        if (action === 'upsert_ncf_sequence') {
            const ncfType = String(body.ncfType || body.ncf_type || '').trim().toUpperCase();
            const invoiceSeriesMatch = String(body.invoiceSeriesMatch || body.invoice_series_match || '')
                .trim()
                .toUpperCase();
            const prefix = String(body.prefix || '').trim().toUpperCase();
            if (!ncfType || !invoiceSeriesMatch || !prefix) {
                return { data: { error: 'ncfType, invoiceSeriesMatch y prefix requeridos' }, error: null };
            }
            const id = body.id || null;
            const row = {
                tenant_id: tenantId,
                ncf_type: ncfType,
                invoice_series_match: invoiceSeriesMatch,
                prefix,
                correlative_width: Math.min(12, Math.max(1, fiscalNumOr(body.correlativeWidth ?? body.correlative_width, 8))),
                next_correlative: Math.max(1, Math.floor(fiscalNumOr(body.nextCorrelative ?? body.next_correlative, 1))),
                is_active: body.isActive === false || body.is_active === false ? false : true,
                notes: body.notes != null ? String(body.notes).trim() || null : null,
                updated_at: new Date().toISOString()
            };
            if (id) {
                const r = await dbUpdate({
                    table: 'ncf_sequences',
                    values: row,
                    filters: [
                        { op: 'eq', column: 'id', value: id },
                        { op: 'eq', column: 'tenant_id', value: tenantId }
                    ]
                });
                const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
                if (r.error || !row0) return { data: { error: r.error?.message || 'update failed' }, error: null };
                return { data: { ok: true, sequence: row0 }, error: null };
            }
            const r = await dbInsert({ table: 'ncf_sequences', values: row });
            const row0 = Array.isArray(r.data) ? r.data[0] : r.data;
            if (r.error || !row0) return { data: { error: r.error?.message || 'insert failed' }, error: null };
            return { data: { ok: true, sequence: row0 }, error: null };
        }
        if (action === 'delete_ncf_sequence') {
            const id = body.id;
            if (!id) return { data: { error: 'id required' }, error: null };
            const r = await dbDelete({
                table: 'ncf_sequences',
                filters: [
                    { op: 'eq', column: 'id', value: id },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ]
            });
            if (r.error) return { data: { error: r.error.message }, error: null };
            return { data: { ok: true }, error: null };
        }
        if (action === 'preview_ncf') {
            const invoiceSeries = String(body.invoiceSeries || body.invoice_series || 'FAC').trim().toUpperCase();
            const { data: rows } = await dbSelect({
                table: 'ncf_sequences',
                filters: [
                    { op: 'eq', column: 'invoice_series_match', value: invoiceSeries },
                    { op: 'eq', column: 'is_active', value: true }
                ],
                limit: 1
            });
            const seq = rows?.[0];
            if (!seq) return { data: { ok: true, preview: null }, error: null };
            const n = Number(seq.next_correlative || 1);
            const w = Number(seq.correlative_width || 8);
            const full = String(seq.prefix || '') + String(n).padStart(w, '0');
            return { data: { ok: true, preview: { ncf: full, ncf_type: seq.ncf_type, next: n } }, error: null };
        }
        return { data: { error: 'Unknown action' }, error: null };
    } catch (e) {
        return { data: { error: e?.message || String(e) }, error: null };
    }
};
/** Misma logica que edge manage-reports (IPC). */
const ZYRON_REPORT_KEYS = new Set(['sales', 'income', 'tax', 'customers', 'top_products', 'ar']);
const ZYRON_CUSTOM_REPORT_DATASET_KEYS = new Set(['sales', 'income', 'tax', 'customers', 'top_products', 'ar']);

const reportsNumOr = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
};

const reportsParseRange = (body) => {
    const now = new Date();
    const to = body.dateTo ? new Date(body.dateTo) : now;
    let from = body.dateFrom ? new Date(body.dateFrom) : new Date(to.getTime() - 89 * 86400000);
    if (from.getTime() > to.getTime()) {
        const t = from;
        from = to;
        to = t;
    }
    const toEnd = new Date(to);
    toEnd.setUTCHours(23, 59, 59, 999);
    return { fromISO: from.toISOString(), toISO: toEnd.toISOString() };
};

const reportsCsvEscape = (s) => {
    const x = String(s ?? '');
    if (/[",\n\r]/.test(x)) return '"' + x.replace(/"/g, '""') + '"';
    return x;
};

const reportsRowsToCsv = (headers, rows) => {
    const lines = [headers.map(reportsCsvEscape).join(',')];
    for (const r of rows) {
        lines.push(headers.map((h) => reportsCsvEscape(r[h])).join(','));
    }
    return '\uFEFF' + lines.join('\n');
};

const reportsSafeLogExport = async (tenantId, reportKey, format, meta) => {
    try {
        await dbInsert({
            table: 'report_exports',
            values: {
                tenant_id: tenantId,
                report_type: reportKey,
                format,
                meta: meta || {},
                created_by: state.appUser?.id || null
            }
        });
    } catch (_) {
        /* tabla opcional */
    }
};

const reportsLoadCustomerMap = async (ids) => {
    const uniq = [...new Set((ids || []).filter(Boolean))];
    if (!uniq.length) return new Map();
    const { data, error } = await dbSelect({
        table: 'customers',
        columns: 'id,name,email',
        filters: [{ op: 'in', column: 'id', value: uniq }],
        limit: 5000
    });
    if (error) return new Map();
    return new Map((data || []).map((c) => [c.id, c]));
};

const reportsRunDataset = async (tenantId, key, range) => {
    const { fromISO, toISO } = range;
    const invDateFilters = [
        { op: 'gte', column: 'created_at', value: fromISO },
        { op: 'lte', column: 'created_at', value: toISO }
    ];
    const payDateFilters = [
        { op: 'gte', column: 'paid_at', value: fromISO },
        { op: 'lte', column: 'paid_at', value: toISO }
    ];
    if (key === 'sales') {
        const { data: invs, error } = await dbSelect({
            table: 'invoices',
            columns: 'id,series,number,status,invoice_type,customer_id,currency,subtotal,tax_total,total,created_at',
            filters: invDateFilters,
            order: { column: 'created_at', ascending: false },
            limit: 2500
        });
        if (error) return { ok: false, error: error.message, rows: [], summary: {} };
        const custMap = await reportsLoadCustomerMap((invs || []).map((i) => i.customer_id));
        const rows = (invs || [])
            .filter((i) => {
                const st = String(i.status || '').toLowerCase();
                return st !== 'draft' && st !== 'cancelled' && st !== 'void';
            })
            .map((i) => {
                const c = i.customer_id ? custMap.get(i.customer_id) : null;
                return {
                    id: i.id,
                    fecha: i.created_at,
                    serie: i.series,
                    numero: i.number,
                    estado: i.status,
                    tipo: i.invoice_type || 'standard',
                    cliente_id: i.customer_id || '',
                    cliente_nombre: c?.name || '',
                    cliente_email: c?.email || '',
                    moneda: i.currency || 'USD',
                    subtotal: reportsNumOr(i.subtotal, 0),
                    impuestos: reportsNumOr(i.tax_total, 0),
                    total: reportsNumOr(i.total, 0)
                };
            });
        const summary = rows.reduce(
            (acc, r) => {
                acc.count += 1;
                acc.subtotal += r.subtotal;
                acc.impuestos += r.impuestos;
                acc.total += r.total;
                return acc;
            },
            { count: 0, subtotal: 0, impuestos: 0, total: 0 }
        );
        return { ok: true, rows, summary };
    }
    if (key === 'income') {
        const { data: pays, error } = await dbSelect({
            table: 'payments',
            columns: 'id,amount,currency,payment_method,payment_method_code,paid_at,customer_id,status,reference,notes',
            filters: payDateFilters,
            order: { column: 'paid_at', ascending: false },
            limit: 2500
        });
        if (error) return { ok: false, error: error.message, rows: [], summary: {} };
        const custMap = await reportsLoadCustomerMap((pays || []).map((p) => p.customer_id));
        const rows = (pays || []).map((p) => {
            const c = p.customer_id ? custMap.get(p.customer_id) : null;
            return {
                id: p.id,
                fecha: p.paid_at,
                monto: reportsNumOr(p.amount, 0),
                moneda: p.currency || 'USD',
                metodo: p.payment_method_code || p.payment_method || '',
                estado: p.status,
                cliente_id: p.customer_id || '',
                cliente_nombre: c?.name || '',
                referencia: p.reference || '',
                notas: p.notes || ''
            };
        });
        const summary = rows.reduce(
            (acc, r) => {
                acc.count += 1;
                acc.total += r.monto;
                return acc;
            },
            { count: 0, total: 0 }
        );
        return { ok: true, rows, summary };
    }
    if (key === 'tax') {
        const { data: invs, error } = await dbSelect({
            table: 'invoices',
            columns: 'id,series,number,status,customer_id,currency,subtotal,tax_total,total,created_at',
            filters: invDateFilters,
            order: { column: 'created_at', ascending: false },
            limit: 2500
        });
        if (error) return { ok: false, error: error.message, rows: [], summary: {} };
        const custMap = await reportsLoadCustomerMap((invs || []).map((i) => i.customer_id));
        const rows = (invs || [])
            .filter((i) => {
                const st = String(i.status || '').toLowerCase();
                return st !== 'draft' && st !== 'cancelled' && st !== 'void';
            })
            .map((i) => {
                const c = i.customer_id ? custMap.get(i.customer_id) : null;
                const sub = reportsNumOr(i.subtotal, 0);
                const tax = reportsNumOr(i.tax_total, 0);
                const tot = reportsNumOr(i.total, 0);
                const base = tot - tax;
                return {
                    id: i.id,
                    fecha: i.created_at,
                    serie: i.series,
                    numero: i.number,
                    estado: i.status,
                    cliente_nombre: c?.name || '',
                    base_imponible: sub || Math.max(0, base),
                    impuestos: tax,
                    total: tot
                };
            });
        const summary = rows.reduce(
            (acc, r) => {
                acc.count += 1;
                acc.base_imponible += r.base_imponible;
                acc.impuestos += r.impuestos;
                acc.total += r.total;
                return acc;
            },
            { count: 0, base_imponible: 0, impuestos: 0, total: 0 }
        );
        return { ok: true, rows, summary };
    }
    if (key === 'customers') {
        const { data: invs, error } = await dbSelect({
            table: 'invoices',
            columns: 'customer_id,total,created_at,status',
            filters: invDateFilters,
            limit: 5000
        });
        if (error) return { ok: false, error: error.message, rows: [], summary: {} };
        const byC = new Map();
        for (const i of invs || []) {
            const st = String(i.status || '').toLowerCase();
            if (st === 'draft' || st === 'cancelled' || st === 'void') continue;
            const cid = i.customer_id || '_sin_cliente';
            if (!byC.has(cid)) {
                byC.set(cid, { customer_id: cid === '_sin_cliente' ? '' : cid, facturas: 0, ventas: 0, ultima_fecha: null });
            }
            const agg = byC.get(cid);
            agg.facturas += 1;
            agg.ventas += reportsNumOr(i.total, 0);
            const t = i.created_at ? new Date(i.created_at).getTime() : 0;
            if (!agg.ultima_fecha || t > new Date(agg.ultima_fecha).getTime()) agg.ultima_fecha = i.created_at;
        }
        const ids = [...byC.keys()].filter((k) => k && k !== '_sin_cliente');
        const custMap = await reportsLoadCustomerMap(ids);
        const rows = [...byC.values()].map((r) => {
            const c = r.customer_id ? custMap.get(r.customer_id) : null;
            return {
                cliente_id: r.customer_id,
                cliente_nombre: c?.name || (r.customer_id ? '—' : '(sin cliente)'),
                facturas: r.facturas,
                ventas: r.ventas,
                ultima_fecha: r.ultima_fecha || ''
            };
        });
        rows.sort((a, b) => b.ventas - a.ventas);
        const summary = {
            clientes: rows.length,
            facturas: rows.reduce((s, r) => s + r.facturas, 0),
            ventas: rows.reduce((s, r) => s + r.ventas, 0)
        };
        return { ok: true, rows, summary };
    }
    if (key === 'top_products') {
        const { data: invs, error: invErr } = await dbSelect({
            table: 'invoices',
            columns: 'id',
            filters: invDateFilters,
            order: { column: 'created_at', ascending: false },
            limit: 2000
        });
        if (invErr) return { ok: false, error: invErr.message, rows: [], summary: {} };
        const invList = (invs || []).filter(Boolean);
        const invIds = invList.map((i) => i.id);
        if (!invIds.length) return { ok: true, rows: [], summary: { lineas: 0 } };
        const { data: items, error: itErr } = await dbSelect({
            table: 'invoice_items',
            columns: 'product_id,quantity,description,line_kind,invoice_id',
            filters: [{ op: 'in', column: 'invoice_id', value: invIds.slice(0, 2000) }],
            limit: 8000
        });
        if (itErr) return { ok: false, error: itErr.message, rows: [], summary: {} };
        const { data: invStatus, error: stErr } = await dbSelect({
            table: 'invoices',
            columns: 'id,status',
            filters: [{ op: 'in', column: 'id', value: invIds.slice(0, 2000) }],
            limit: 2500
        });
        if (stErr) return { ok: false, error: stErr.message, rows: [], summary: {} };
        const statusMap = new Map((invStatus || []).map((x) => [x.id, String(x.status || '').toLowerCase()]));
        const agg = new Map();
        for (const it of items || []) {
            const st = statusMap.get(it.invoice_id);
            if (st === 'draft' || st === 'cancelled' || st === 'void') continue;
            if (!it.product_id) continue;
            const lk = String(it.line_kind || 'product').toLowerCase();
            if (lk === 'service') continue;
            const pid = it.product_id;
            const q = reportsNumOr(it.quantity, 0);
            if (!agg.has(pid)) agg.set(pid, { product_id: pid, unidades: 0, lineas: 0 });
            const a = agg.get(pid);
            a.unidades += q;
            a.lineas += 1;
        }
        const pids = [...agg.keys()];
        const { data: prods, error: perr } = await dbSelect({
            table: 'products',
            columns: 'id,sku,name',
            filters: [{ op: 'in', column: 'id', value: pids }],
            limit: 5000
        });
        if (perr) return { ok: false, error: perr.message, rows: [], summary: {} };
        const prodMap = new Map((prods || []).map((p) => [p.id, p]));
        const rows = [...agg.values()]
            .map((r) => {
                const p = prodMap.get(r.product_id);
                return {
                    product_id: r.product_id,
                    sku: p?.sku || '',
                    nombre: p?.name || r.product_id,
                    unidades_vendidas: r.unidades,
                    lineas_factura: r.lineas
                };
            })
            .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas);
        const summary = { productos: rows.length, unidades: rows.reduce((s, r) => s + r.unidades_vendidas, 0) };
        return { ok: true, rows, summary };
    }
    if (key === 'ar') {
        const { data: invs, error } = await dbSelect({
            table: 'invoices',
            columns: 'id,series,number,total,amount_paid,status,due_date,customer_id,currency,created_at',
            filters: [],
            order: { column: 'due_date', ascending: true },
            limit: 2000
        });
        if (error) return { ok: false, error: error.message, rows: [], summary: {} };
        const custMap = await reportsLoadCustomerMap((invs || []).map((i) => i.customer_id));
        const now = Date.now();
        const rows = (invs || [])
            .filter((inv) => {
                const st = String(inv.status || '').toLowerCase();
                if (st === 'draft' || st === 'cancelled' || st === 'void') return false;
                const bal = reportsNumOr(inv.total, 0) - reportsNumOr(inv.amount_paid, 0);
                return bal > 0.0001;
            })
            .map((inv) => {
                const c = inv.customer_id ? custMap.get(inv.customer_id) : null;
                const bal = reportsNumOr(inv.total, 0) - reportsNumOr(inv.amount_paid, 0);
                const dueMs = inv.due_date ? new Date(inv.due_date).getTime() : null;
                let bucket = 'sin_vencimiento';
                if (dueMs != null) {
                    const days = Math.floor((now - dueMs) / 86400000);
                    if (days < 0) bucket = 'por_vencer';
                    else if (days <= 30) bucket = 'vencido_0_30';
                    else if (days <= 60) bucket = 'vencido_31_60';
                    else bucket = 'vencido_60_mas';
                }
                return {
                    id: inv.id,
                    serie: inv.series,
                    numero: inv.number,
                    cliente_nombre: c?.name || '',
                    moneda: inv.currency || 'USD',
                    total: reportsNumOr(inv.total, 0),
                    pagado: reportsNumOr(inv.amount_paid, 0),
                    saldo: bal,
                    vencimiento: inv.due_date || '',
                    estado: inv.status,
                    antiguedad_bucket: bucket
                };
            });
        const summary = {
            facturas: rows.length,
            saldo_total: rows.reduce((s, r) => s + r.saldo, 0)
        };
        return { ok: true, rows, summary };
    }
    return { ok: false, error: 'unknown dataset', rows: [], summary: {} };
};

const reportsManageViaDb = async (body) => {
    try {
        const tenantId = body?.tenantId || state.tenantId;
        if (!tenantId) return { data: { error: 'tenantId and action are required' }, error: null };
        const action = String(body?.action || '').trim();
        if (!action) return { data: { error: 'tenantId and action are required' }, error: null };

        if (action === 'run_report') {
            const reportKey = String(body?.reportKey || '').toLowerCase();
            if (!ZYRON_REPORT_KEYS.has(reportKey)) {
                return { data: { error: 'reportKey invalido' }, error: null };
            }
            const range = reportsParseRange(body || {});
            const result = await reportsRunDataset(tenantId, reportKey, range);
            const format = String(body?.format || 'json').toLowerCase();
            if (format === 'csv') {
                if (!result.ok) {
                    return { data: { ok: false, error: result.error || 'run failed', summary: result.summary }, error: null };
                }
                const sample = (result.rows || [])[0] || {};
                const headers = Object.keys(sample);
                if (!headers.length) {
                    await reportsSafeLogExport(tenantId, reportKey, 'csv', { dateFrom: range.fromISO, dateTo: range.toISO, rows: 0 });
                    return {
                        data: {
                            ok: true,
                            csv: '\uFEFF',
                            filename: reportKey + '_vacio.csv',
                            summary: result.summary,
                            reportKey
                        },
                        error: null
                    };
                }
                const csv = reportsRowsToCsv(headers, result.rows || []);
                await reportsSafeLogExport(tenantId, reportKey, 'csv', {
                    dateFrom: range.fromISO,
                    dateTo: range.toISO,
                    rows: (result.rows || []).length
                });
                return {
                    data: {
                        ok: true,
                        csv,
                        filename: reportKey + '_' + range.fromISO.slice(0, 10) + '_' + range.toISO.slice(0, 10) + '.csv',
                        summary: result.summary,
                        reportKey
                    },
                    error: null
                };
            }
            return {
                data: { ...result, reportKey, range: { fromISO: range.fromISO, toISO: range.toISO } },
                error: null
            };
        }

        if (action === 'list_custom_definitions') {
            const { data, error } = await dbSelect({
                table: 'custom_report_definitions',
                columns: 'id,tenant_id,name,dataset_key,column_keys,filter_json,created_at,updated_at',
                filters: [],
                order: { column: 'updated_at', ascending: false },
                limit: 200
            });
            const msg = error?.message || '';
            if (error && /does not exist|relation/i.test(msg)) {
                return { data: { ok: true, rows: [] }, error: null };
            }
            if (error) {
                return { data: { ok: false, error: msg, rows: [] }, error: null };
            }
            return { data: { ok: true, rows: data || [] }, error: null };
        }

        if (action === 'save_custom_definition') {
            const name = String(body?.name || '').trim();
            const datasetKey = String(body?.datasetKey || body?.dataset_key || '').toLowerCase();
            if (!name || !ZYRON_CUSTOM_REPORT_DATASET_KEYS.has(datasetKey)) {
                return { data: { error: 'name y datasetKey valido requeridos' }, error: null };
            }
            const columnKeys = Array.isArray(body?.columnKeys)
                ? body.columnKeys
                : Array.isArray(body?.column_keys)
                  ? body.column_keys
                  : [];
            const filterJson =
                body?.filterJson && typeof body.filterJson === 'object'
                    ? body.filterJson
                    : body?.filter_json && typeof body.filter_json === 'object'
                      ? body.filter_json
                      : {};
            const id = body?.id || null;
            const row = {
                tenant_id: tenantId,
                name,
                dataset_key: datasetKey,
                column_keys: columnKeys,
                filter_json: filterJson,
                updated_at: new Date().toISOString()
            };
            if (id) {
                const { data: upd, error } = await dbUpdate({
                    table: 'custom_report_definitions',
                    values: row,
                    filters: [
                        { op: 'eq', column: 'id', value: id },
                        { op: 'eq', column: 'tenant_id', value: tenantId }
                    ]
                });
                if (error || !upd?.length) {
                    return { data: { error: error?.message || 'update failed' }, error: null };
                }
                return { data: { ok: true, definition: upd[0] }, error: null };
            }
            const { data: ins, error } = await dbInsert({
                table: 'custom_report_definitions',
                values: row
            });
            if (error) {
                return { data: { error: error.message || 'insert failed' }, error: null };
            }
            return { data: { ok: true, definition: ins?.[0] || row }, error: null };
        }

        if (action === 'delete_custom_definition') {
            const id = body?.id;
            if (!id) {
                return { data: { error: 'id required' }, error: null };
            }
            const { error } = await dbDelete({
                table: 'custom_report_definitions',
                filters: [
                    { op: 'eq', column: 'id', value: id },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ]
            });
            if (error) {
                return { data: { error: error.message }, error: null };
            }
            return { data: { ok: true }, error: null };
        }

        if (action === 'run_custom_definition') {
            const id = body?.id;
            if (!id) {
                return { data: { error: 'id required' }, error: null };
            }
            const { data: defs, error } = await dbSelect({
                table: 'custom_report_definitions',
                columns: 'id,tenant_id,name,dataset_key,column_keys,filter_json',
                filters: [
                    { op: 'eq', column: 'id', value: id },
                    { op: 'eq', column: 'tenant_id', value: tenantId }
                ],
                limit: 1
            });
            if (error || !defs?.length) {
                return { data: { error: 'Plantilla no encontrada' }, error: null };
            }
            const def = defs[0];
            let colsRaw = def.column_keys;
            if (typeof colsRaw === 'string') {
                try {
                    colsRaw = JSON.parse(colsRaw);
                } catch (_) {
                    colsRaw = [];
                }
            }
            if (!Array.isArray(colsRaw)) colsRaw = [];
            const dsKey = String(def.dataset_key || '').toLowerCase();
            if (!ZYRON_CUSTOM_REPORT_DATASET_KEYS.has(dsKey)) {
                return { data: { error: 'dataset no permitido' }, error: null };
            }
            const mergedBody = {
                dateFrom: def.filter_json?.dateFrom || body.dateFrom,
                dateTo: def.filter_json?.dateTo || body.dateTo
            };
            const range = reportsParseRange(mergedBody);
            const result = await reportsRunDataset(tenantId, dsKey, range);
            let rows = result.rows || [];
            const cols = colsRaw;
            if (cols.length && rows.length) {
                rows = rows.map((r) => {
                    const o = {};
                    for (const c of cols) {
                        if (Object.prototype.hasOwnProperty.call(r, c)) o[c] = r[c];
                    }
                    return Object.keys(o).length ? o : r;
                });
            }
            const format = String(body?.format || 'json').toLowerCase();
            if (format === 'csv') {
                if (!result.ok) {
                    return { data: { ok: false, error: result.error || 'run failed' }, error: null };
                }
                const headers = cols.length && rows[0] ? cols.filter((c) => Object.prototype.hasOwnProperty.call(rows[0], c)) : Object.keys(rows[0] || {});
                if (!headers.length) {
                    await reportsSafeLogExport(tenantId, 'custom:' + def.name, 'csv', { definitionId: id });
                    return { data: { ok: true, csv: '\uFEFF', filename: 'custom_vacio.csv', summary: result.summary }, error: null };
                }
                const csv = reportsRowsToCsv(headers, rows);
                await reportsSafeLogExport(tenantId, 'custom:' + def.name, 'csv', { definitionId: id });
                return {
                    data: {
                        ok: true,
                        csv,
                        filename: 'custom_' + String(def.name).replace(/\s+/g, '_') + '.csv',
                        summary: result.summary
                    },
                    error: null
                };
            }
            return {
                data: { ok: result.ok, rows, summary: result.summary, error: result.error, definition: def },
                error: null
            };
        }

        if (action === 'list_export_history') {
            const { data, error } = await dbSelect({
                table: 'report_exports',
                columns: 'id,tenant_id,report_type,format,meta,created_at,created_by',
                filters: [],
                order: { column: 'created_at', ascending: false },
                limit: 100
            });
            const msg = error?.message || '';
            if (error && /does not exist|relation/i.test(msg)) {
                return { data: { ok: true, rows: [] }, error: null };
            }
            if (error) {
                return { data: { ok: false, error: msg, rows: [] }, error: null };
            }
            return { data: { ok: true, rows: data || [] }, error: null };
        }

        return { data: { error: 'Unknown action' }, error: null };
    } catch (e) {
        return { data: { error: e?.message || String(e) }, error: null };
    }
};


/** Lecturas Pagos / CXC vía dbSelect (equivalente a manage-payments: list_payments, list_methods, list_ar, list_reminder_log, list_allocations). */
const fetchPaymentsListViaDb = async (tenantId) => {
    const { data, error } = await dbSelect({
        table: 'payments',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }],
        order: { column: 'id', ascending: false },
        limit: 120
    });
    if (error) return { data: { ok: false, error: error.message || String(error), rows: [] }, error: null };
    return { data: { ok: true, rows: data || [] }, error: null };
};

const fetchPaymentMethodsCatalogViaDb = async (tenantId) => {
    const { data, error } = await dbSelect({
        table: 'payment_methods_catalog',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }]
    });
    if (error) return { data: { ok: false, error: error.message || String(error), rows: [] }, error: null };
    const rows = (data || []).slice().sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    return { data: { ok: true, rows }, error: null };
};

const fetchAccountsReceivableViaDb = async (tenantId) => {
    const { data: invs, error } = await dbSelect({
        table: 'invoices',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }],
        order: { column: 'created_at', ascending: false },
        limit: 200
    });
    if (error) return { data: { ok: false, error: error.message || String(error), rows: [] }, error: null };
    const rows = (invs || [])
        .filter((inv) => {
            const st = String(inv.status || '').toLowerCase();
            if (st === 'draft' || st === 'cancelled' || st === 'void') return false;
            const bal = Number(inv.total || 0) - Number(inv.amount_paid || 0);
            return bal > 0.0001;
        })
        .map((inv) => ({
            ...inv,
            balance_due: Number(inv.total || 0) - Number(inv.amount_paid || 0)
        }));
    return { data: { ok: true, rows }, error: null };
};

const fetchPaymentReminderLogViaDb = async (tenantId) => {
    const { data, error } = await dbSelect({
        table: 'payment_reminder_log',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }],
        order: { column: 'created_at', ascending: false },
        limit: 80
    });
    if (error) return { data: { ok: false, error: error.message || String(error), rows: [] }, error: null };
    return { data: { ok: true, rows: data || [] }, error: null };
};

const fetchPaymentAllocationsViaDb = async (tenantId, paymentId) => {
    if (!paymentId) return { data: { ok: false, error: 'paymentId required', rows: [] }, error: null };
    const { data, error } = await dbSelect({
        table: 'payment_allocations',
        filters: [
            { op: 'eq', column: 'payment_id', value: paymentId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    if (error) return { data: { ok: false, error: error.message || String(error), rows: [] }, error: null };
    return { data: { ok: true, rows: data || [] }, error: null };
};

/** Recalcula amount_paid y status de factura desde payment_allocations (misma logica que manage-payments edge). */
const recalcInvoiceFinancialsLocal = async (tenantId, invoiceId) => {
    const { data: invRows, error: invErr } = await dbSelect({
        table: 'invoices',
        filters: [
            { op: 'eq', column: 'id', value: invoiceId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ],
        limit: 1
    });
    if (invErr || !invRows?.length) return;
    const inv = invRows[0];
    const st0 = String(inv.status || '').toLowerCase();
    if (st0 === 'draft' || st0 === 'cancelled' || st0 === 'void') return;
    const { data: allocs, error: alErr } = await dbSelect({
        table: 'payment_allocations',
        filters: [{ op: 'eq', column: 'invoice_id', value: invoiceId }]
    });
    if (alErr) return;
    const paid = (allocs || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const total = Number(inv.total || 0);
    let nextStatus = st0;
    if (paid >= total - 0.0001) nextStatus = 'paid';
    else if (paid > 0.0001) nextStatus = 'partial';
    else {
        const dueMs = inv.due_date ? new Date(inv.due_date).getTime() : null;
        if (dueMs != null && !Number.isNaN(dueMs) && dueMs < Date.now()) nextStatus = 'overdue';
        else nextStatus = 'pending';
    }
    await dbUpdate({
        table: 'invoices',
        values: { amount_paid: paid, status: nextStatus },
        filters: [
            { op: 'eq', column: 'id', value: invoiceId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
};

const paymentsSetInvoiceDueDateViaDb = async (tenantId, invoiceId, dueDate) => {
    if (!invoiceId) return { data: { error: 'invoiceId required' }, error: null };
    const patch = { due_date: dueDate || null };
    const r = await dbUpdate({
        table: 'invoices',
        values: patch,
        filters: [
            { op: 'eq', column: 'id', value: invoiceId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    if (r.error || !r.data?.length) return { data: { error: r.error?.message || 'update failed' }, error: null };
    await recalcInvoiceFinancialsLocal(tenantId, invoiceId);
    return { data: { ok: true, invoice: r.data[0] }, error: null };
};

const PAYMENT_METHOD_DEFAULTS = Object.freeze([
    { code: 'cash', label: 'Efectivo', sort_order: 10 },
    { code: 'card', label: 'Tarjeta', sort_order: 20 },
    { code: 'transfer', label: 'Transferencia', sort_order: 30 },
    { code: 'digital_wallet', label: 'Billetera digital', sort_order: 40 },
    { code: 'other', label: 'Otro', sort_order: 90 }
]);

const paymentsSeedMethodsViaDb = async (tenantId) => {
    for (const d of PAYMENT_METHOD_DEFAULTS) {
        const ins = await dbInsert({
            table: 'payment_methods_catalog',
            values: {
                tenant_id: tenantId,
                code: d.code,
                label: d.label,
                sort_order: d.sort_order,
                is_active: true
            }
        });
        if (ins.error && !/duplicate|unique/i.test(ins.error.message || '')) {
            return { data: { error: ins.error.message || 'seed failed' }, error: null };
        }
    }
    const { data: rows, error } = await dbSelect({
        table: 'payment_methods_catalog',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }]
    });
    if (error) return { data: { error: error.message, rows: [] }, error: null };
    const sorted = (rows || []).slice().sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    return { data: { ok: true, rows: sorted }, error: null };
};

const paymentsCreatePaymentViaDb = async (tenantId, body) => {
    const amount = Number(body.amount || 0);
    if (!(amount > 0)) return { data: { error: 'amount must be > 0' }, error: null };
    const code = String(body.paymentMethodCode || body.paymentMethod || 'cash').toLowerCase();
    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    let allocSum = 0;
    for (const a of allocations) allocSum += Number(a.amount || 0);
    if (allocSum - amount > 0.0001) {
        return { data: { error: 'La suma aplicada a facturas no puede superar el monto del pago' }, error: null };
    }
    const insertPayment = {
        tenant_id: tenantId,
        amount,
        status: String(body.status || 'completed').toLowerCase() === 'pending' ? 'pending' : 'completed',
        paid_at: body.paidAt || new Date().toISOString(),
        payment_method: code,
        payment_method_code: code,
        currency: String(body.currency || 'USD'),
        customer_id: body.customerId || null,
        reference: body.reference || null,
        notes: body.notes || null,
        gateway_provider: body.gatewayProvider || null,
        gateway_transaction_id: body.gatewayTransactionId || null,
        reconciliation_status: 'unmatched',
        unallocated_amount: Math.max(0, amount - allocSum)
    };
    let r = await dbInsert({ table: 'payments', values: insertPayment });
    let payRows = r.data;
    let payErr = r.error;
    if (payErr && /column .* does not exist/i.test(payErr.message || '')) {
        r = await dbInsert({
            table: 'payments',
            values: {
                tenant_id: tenantId,
                amount,
                status: insertPayment.status,
                paid_at: insertPayment.paid_at,
                payment_method: code
            }
        });
        payRows = r.data;
        payErr = r.error;
    }
    if (payErr || !payRows?.length) {
        return { data: { error: payErr?.message || 'payment insert failed' }, error: null };
    }
    const payment = Array.isArray(payRows) ? payRows[0] : payRows;
    const touched = new Set();
    for (const a of allocations) {
        const invId = a.invoiceId;
        const amt = Number(a.amount || 0);
        if (!invId || !(amt > 0)) continue;
        const invRes = await dbSelect({
            table: 'invoices',
            filters: [{ op: 'eq', column: 'id', value: invId }],
            limit: 1
        });
        const inv = invRes.data?.[0];
        if (!inv || String(inv.tenant_id) !== String(tenantId)) {
            await dbDelete({ table: 'payments', filters: [{ op: 'eq', column: 'id', value: payment.id }] });
            return { data: { error: 'Factura invalida para el tenant' }, error: null };
        }
        const st = String(inv.status || '').toLowerCase();
        if (st === 'draft') {
            await dbDelete({ table: 'payments', filters: [{ op: 'eq', column: 'id', value: payment.id }] });
            return { data: { error: 'No se puede aplicar pago a borrador' }, error: null };
        }
        const open = Number(inv.total || 0) - Number(inv.amount_paid || 0);
        if (amt - open > 0.0001) {
            await dbDelete({ table: 'payments', filters: [{ op: 'eq', column: 'id', value: payment.id }] });
            return { data: { error: `Monto excede saldo abierto en factura ${invId}` }, error: null };
        }
        const alIns = await dbInsert({
            table: 'payment_allocations',
            values: {
                tenant_id: tenantId,
                payment_id: payment.id,
                invoice_id: invId,
                amount: amt
            }
        });
        if (alIns.error) {
            await dbDelete({ table: 'payment_allocations', filters: [{ op: 'eq', column: 'payment_id', value: payment.id }] });
            await dbDelete({ table: 'payments', filters: [{ op: 'eq', column: 'id', value: payment.id }] });
            return { data: { error: alIns.error.message || 'allocation failed' }, error: null };
        }
        touched.add(invId);
    }
    for (const invId of touched) await recalcInvoiceFinancialsLocal(tenantId, invId);
    return { data: { ok: true, payment }, error: null };
};

const paymentsSetReconciliationViaDb = async (tenantId, paymentId, reconciliationStatus, matchedBankReference) => {
    if (!paymentId) return { data: { error: 'paymentId required' }, error: null };
    const patch = {
        reconciliation_status: String(reconciliationStatus || 'unmatched'),
        matched_bank_reference: matchedBankReference != null ? String(matchedBankReference) : null
    };
    const r = await dbUpdate({
        table: 'payments',
        values: patch,
        filters: [
            { op: 'eq', column: 'id', value: paymentId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    if (r.error || !r.data?.length) return { data: { error: r.error?.message || 'update failed' }, error: null };
    return { data: { ok: true, payment: r.data[0] }, error: null };
};

const paymentsRunRemindersViaDb = async (tenantId, horizonDaysRaw) => {
    const horizonDays = Math.min(30, Math.max(1, Number(horizonDaysRaw || 7)));
    const now = Date.now();
    const horizon = now + horizonDays * 86400000;
    const { data: invs, error } = await dbSelect({
        table: 'invoices',
        filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }],
        limit: 2000
    });
    if (error) return { data: { error: error.message, queued: 0, candidates: 0 }, error: null };
    const candidates = (invs || []).filter((inv) => {
        const st = String(inv.status || '').toLowerCase();
        if (st === 'draft' || st === 'paid' || st === 'cancelled' || st === 'void') return false;
        const bal = Number(inv.total || 0) - Number(inv.amount_paid || 0);
        if (bal <= 0.0001) return false;
        if (!inv.due_date) return false;
        const t = new Date(inv.due_date).getTime();
        if (Number.isNaN(t)) return false;
        return t <= horizon;
    });
    let queued = 0;
    for (const inv of candidates) {
        const ins = await dbInsert({
            table: 'payment_reminder_log',
            values: {
                tenant_id: tenantId,
                invoice_id: inv.id,
                kind: new Date(inv.due_date).getTime() < now ? 'overdue' : 'due_soon',
                channel: 'manual',
                meta: {
                    series: inv.series,
                    number: inv.number,
                    balance: Number(inv.total || 0) - Number(inv.amount_paid || 0)
                }
            }
        });
        if (!ins.error && (Array.isArray(ins.data) ? ins.data.length : ins.data)) queued += 1;
    }
    return { data: { ok: true, queued, candidates: candidates.length }, error: null };
};

const paymentsIngestGatewayEventViaDb = async (tenantId, provider, externalId, payloadObj) => {
    const providerStr = String(provider || 'stripe');
    const external = externalId ? String(externalId) : null;
    const payload = payloadObj && typeof payloadObj === 'object' ? payloadObj : {};
    const ins = await dbInsert({
        table: 'payment_gateway_events',
        values: {
            tenant_id: tenantId,
            provider: providerStr,
            external_id: external,
            payload,
            matched_payment_id: null
        }
    });
    const evRow = Array.isArray(ins.data) ? ins.data[0] : ins.data;
    if (ins.error || !evRow) {
        return { data: { error: ins.error?.message || 'gateway event insert failed' }, error: null };
    }
    const ev = evRow;
    let matchedPaymentId = null;
    if (external) {
        const { data: payMatch } = await dbSelect({
            table: 'payments',
            filters: [
                { op: 'eq', column: 'tenant_id', value: tenantId },
                { op: 'eq', column: 'gateway_transaction_id', value: external }
            ],
            limit: 1
        });
        if (payMatch?.length) {
            matchedPaymentId = payMatch[0].id;
            await dbUpdate({
                table: 'payment_gateway_events',
                values: { matched_payment_id: matchedPaymentId },
                filters: [{ op: 'eq', column: 'id', value: ev.id }]
            });
        }
    }
    return { data: { ok: true, event: ev, matchedPaymentId }, error: null };
};

const appendAuditLogSafe = async (tenantId, action, targetType, targetId, details) => {
    const actorId = state.appUser?.id;
    if (!actorId || !tenantId) return;
    await dbInsert({
        table: 'audit_logs',
        values: {
            tenant_id: tenantId,
            actor_user_id: actorId,
            action,
            target_type: targetType,
            target_id: targetId,
            details: details || {}
        }
    });
};

const appSettingJsonUpsertViaDb = async (tenantId, settingKey, nextObj, auditAction) => {
    const { data: rows, error: selErr } = await dbSelect({
        table: 'app_settings',
        filters: [
            { op: 'eq', column: 'tenant_id', value: tenantId },
            { op: 'eq', column: 'setting_key', value: settingKey }
        ],
        limit: 1
    });
    if (selErr) return { data: { error: selErr.message }, error: null };
    const existing = rows?.[0] || null;
    const jsonStr = JSON.stringify(nextObj || {});
    const now = new Date().toISOString();
    let err = null;
    if (existing?.id) {
        let r = await dbUpdate({
            table: 'app_settings',
            values: { setting_value: jsonStr, updated_at: now },
            filters: [{ op: 'eq', column: 'id', value: existing.id }]
        });
        if (r.error && /setting_value|column .* does not exist/i.test(r.error.message || '')) {
            r = await dbUpdate({
                table: 'app_settings',
                values: { value: jsonStr, updated_at: now },
                filters: [{ op: 'eq', column: 'id', value: existing.id }]
            });
        }
        err = r.error;
    } else {
        let r = await dbInsert({
            table: 'app_settings',
            values: { tenant_id: tenantId, setting_key: settingKey, setting_value: jsonStr, updated_at: now }
        });
        if (r.error && /setting_value|column .* does not exist/i.test(r.error.message || '')) {
            r = await dbInsert({
                table: 'app_settings',
                values: { tenant_id: tenantId, setting_key: settingKey, value: jsonStr, updated_at: now }
            });
        }
        err = r.error;
    }
    if (err) return { data: { error: err.message || 'app_settings write failed' }, error: null };
    await appendAuditLogSafe(tenantId, auditAction || 'app_setting_updated', 'app_settings', tenantId, {
        settingKey,
        keys: Object.keys(nextObj || {})
    });
    return { data: { ok: true, settings: nextObj }, error: null };
};

const fetchTenantPreferencesViaDb = async (tenantId) => {
    if (!tenantId) return { data: { ok: true, preferences: defaultTenantPreferencesObj() }, error: null };
    const { data: rows, error } = await dbSelect({
        table: 'app_settings',
        filters: [
            { op: 'eq', column: 'tenant_id', value: tenantId },
            { op: 'eq', column: 'setting_key', value: ZYRON_TENANT_PREFERENCES_KEY }
        ],
        limit: 1
    });
    if (error) return { data: { error: error.message, preferences: defaultTenantPreferencesObj() }, error: null };
    const rawVal = rows?.[0]?.setting_value ?? rows?.[0]?.value ?? '';
    const raw = typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal || {});
    return { data: { ok: true, preferences: parseTenantPreferencesRaw(raw) }, error: null };
};

const tenantPreferencesUpsertViaDb = async (tenantId, body) => {
    const prevRes = await fetchTenantPreferencesViaDb(tenantId);
    const prev = prevRes.data?.preferences || defaultTenantPreferencesObj();
    const next = { ...prev };
    if (body.defaultModule != null && ['panel', 'facturas', 'presupuestos', 'pagos', 'clientes', 'inventario', 'reportes'].includes(String(body.defaultModule))) {
        next.defaultModule = String(body.defaultModule);
    }
    if (body.interfaceDensity != null && ['comfortable', 'compact'].includes(String(body.interfaceDensity))) {
        next.interfaceDensity = String(body.interfaceDensity);
    }
    if (body.confirmBeforeIssue != null) next.confirmBeforeIssue = Boolean(body.confirmBeforeIssue);
    if (body.autoOpenDocumentPreview != null) next.autoOpenDocumentPreview = Boolean(body.autoOpenDocumentPreview);
    if (body.invoiceDueDays != null) next.invoiceDueDays = clampPreferenceDays(body.invoiceDueDays, 30);
    if (body.estimateExpiryDays != null) next.estimateExpiryDays = clampPreferenceDays(body.estimateExpiryDays, 15);
    return appSettingJsonUpsertViaDb(tenantId, ZYRON_TENANT_PREFERENCES_KEY, next, 'tenant_preferences_updated');
};

/** upsert_context: misma logica que manage-tenant-context edge (app_settings + auditoria). */
const tenantContextUpsertViaDb = async (tenantId, body) => {
    const { data: rows, error: selErr } = await dbSelect({
        table: 'app_settings',
        filters: [
            { op: 'eq', column: 'tenant_id', value: tenantId },
            { op: 'eq', column: 'setting_key', value: ZYRON_TENANT_CONTEXT_KEY }
        ],
        limit: 1
    });
    if (selErr) return { data: { error: selErr.message }, error: null };
    const existing = rows?.[0] || null;
    const rawVal = existing?.setting_value ?? existing?.value ?? '';
    const prev = parseTenantContextRaw(typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal || {}));
    const next = { ...prev };
    if (body.defaultCurrency != null) {
        const c = String(body.defaultCurrency).trim().toUpperCase();
        if (/^[A-Z]{3}$/.test(c)) next.defaultCurrency = c;
    }
    if (body.defaultLocale != null) {
        const l = String(body.defaultLocale).trim().toLowerCase();
        if (l === 'es') next.defaultLocale = l;
    }
    if (body.priceDisplayCurrency != null) {
        const c = body.priceDisplayCurrency === '' ? null : String(body.priceDisplayCurrency).trim().toUpperCase();
        if (c == null) next.priceDisplayCurrency = null;
        else if (/^[A-Z]{3}$/.test(c)) next.priceDisplayCurrency = c;
    }
    const jsonStr = JSON.stringify(next);
    const now = new Date().toISOString();
    let err = null;
    if (existing?.id) {
        let r = await dbUpdate({
            table: 'app_settings',
            values: { setting_value: jsonStr, updated_at: now },
            filters: [{ op: 'eq', column: 'id', value: existing.id }]
        });
        if (r.error && /setting_value|column .* does not exist/i.test(r.error.message || '')) {
            r = await dbUpdate({
                table: 'app_settings',
                values: { value: jsonStr, updated_at: now },
                filters: [{ op: 'eq', column: 'id', value: existing.id }]
            });
        }
        err = r.error;
    } else {
        let r = await dbInsert({
            table: 'app_settings',
            values: {
                tenant_id: tenantId,
                setting_key: ZYRON_TENANT_CONTEXT_KEY,
                setting_value: jsonStr,
                updated_at: now
            }
        });
        if (r.error && /setting_value|column .* does not exist/i.test(r.error.message || '')) {
            r = await dbInsert({
                table: 'app_settings',
                values: {
                    tenant_id: tenantId,
                    setting_key: ZYRON_TENANT_CONTEXT_KEY,
                    value: jsonStr,
                    updated_at: now
                }
            });
        }
        err = r.error;
    }
    if (err) return { data: { error: err.message || 'app_settings write failed' }, error: null };
    await appendAuditLogSafe(tenantId, 'tenant_context_updated', 'app_settings', tenantId, {
        defaultCurrency: next.defaultCurrency,
        defaultLocale: next.defaultLocale
    });
    return { data: { ok: true, context: next }, error: null };
};

const MAX_INVOICE_DOC_LOGO_CHARS = 480000;

/** upsert_settings branding factura: misma logica que manage-documents edge. */
const invoiceDocumentBrandingUpsertViaDb = async (tenantId, body) => {
    const { data: erows, error: eerr } = await dbSelect({
        table: 'app_settings',
        filters: [
            { op: 'eq', column: 'tenant_id', value: tenantId },
            { op: 'eq', column: 'setting_key', value: INVOICE_DOC_SETTINGS_KEY }
        ],
        limit: 1
    });
    if (eerr) return { data: { error: eerr.message }, error: null };
    const existing = erows?.[0] || null;
    const rawVal = existing?.setting_value ?? existing?.value ?? '';
    let parsed = {};
    if (rawVal && typeof rawVal === 'string') {
        try {
            parsed = JSON.parse(rawVal);
        } catch (_) {
            parsed = {};
        }
    } else if (rawVal && typeof rawVal === 'object') parsed = rawVal;
    const next = mergeInvoiceDocumentSettings(parsed);
    if (body.templateId != null) {
        const t = String(body.templateId).trim();
        if (['classic', 'minimal', 'compact'].includes(t)) next.templateId = t;
    }
    if (body.accentHex != null) {
        const h = String(body.accentHex).trim();
        if (/^#[0-9a-fA-F]{3,8}$/.test(h)) next.accentHex = h.slice(0, 9);
    }
    if (body.footerLegal != null) next.footerLegal = String(body.footerLegal).slice(0, 4000);
    if (body.companyDisplayName != null) next.companyDisplayName = String(body.companyDisplayName).slice(0, 200);
    if (body.showLineDiscounts != null) next.showLineDiscounts = Boolean(body.showLineDiscounts);
    if (body.logoDataUrl !== undefined) {
        const logo = body.logoDataUrl === null || body.logoDataUrl === '' ? '' : String(body.logoDataUrl);
        if (logo.length > MAX_INVOICE_DOC_LOGO_CHARS) {
            return {
                data: { error: 'Logo demasiado grande (max ~350KB en base64). Usa una imagen mas pequena.' },
                error: null
            };
        }
        if (logo && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(logo)) {
            return { data: { error: 'Logo debe ser data URL de imagen (png, jpeg, webp o gif).' }, error: null };
        }
        next.logoDataUrl = logo;
    }
    const jsonStr = JSON.stringify(next);
    const now = new Date().toISOString();
    let err = null;
    if (existing?.id) {
        let r = await dbUpdate({
            table: 'app_settings',
            values: { setting_value: jsonStr, updated_at: now },
            filters: [{ op: 'eq', column: 'id', value: existing.id }]
        });
        if (r.error && /setting_value|column .* does not exist/i.test(r.error.message || '')) {
            r = await dbUpdate({
                table: 'app_settings',
                values: { value: jsonStr, updated_at: now },
                filters: [{ op: 'eq', column: 'id', value: existing.id }]
            });
        }
        err = r.error;
    } else {
        let r = await dbInsert({
            table: 'app_settings',
            values: {
                tenant_id: tenantId,
                setting_key: INVOICE_DOC_SETTINGS_KEY,
                setting_value: jsonStr,
                updated_at: now
            }
        });
        if (r.error && /setting_value|column .* does not exist/i.test(r.error.message || '')) {
            r = await dbInsert({
                table: 'app_settings',
                values: {
                    tenant_id: tenantId,
                    setting_key: INVOICE_DOC_SETTINGS_KEY,
                    value: jsonStr,
                    updated_at: now
                }
            });
        }
        err = r.error;
    }
    if (err) return { data: { error: err.message || 'app_settings write failed' }, error: null };
    await appendAuditLogSafe(tenantId, 'document_branding_updated', 'app_settings', tenantId, { keys: Object.keys(next) });
    return { data: { ok: true, settings: next, templates: documentTemplateCatalog() }, error: null };
};

const invoiceSeriesUpsertViaDb = async (tenantId, body) => {
    const code = String(body.code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');
    if (!code) return { data: { error: 'code is required' }, error: null };
    const label = String(body.label || code).trim() || code;
    const padding = Math.min(12, Math.max(1, Number(body.padding || 6)));
    const isDefault = Boolean(body.isDefault);
    if (isDefault) {
        await dbUpdate({
            table: 'invoice_series',
            values: { is_default: false },
            filters: [{ op: 'eq', column: 'tenant_id', value: tenantId }]
        });
    }
    if (body.id) {
        const patch = { code, label, padding, is_default: isDefault };
        const r = await dbUpdate({
            table: 'invoice_series',
            values: patch,
            filters: [
                { op: 'eq', column: 'id', value: body.id },
                { op: 'eq', column: 'tenant_id', value: tenantId }
            ]
        });
        if (r.error || !r.data?.length) return { data: { error: r.error?.message || 'update failed' }, error: null };
        return { data: { ok: true, row: r.data[0] }, error: null };
    }
    const insert = {
        tenant_id: tenantId,
        code,
        label,
        next_number: Math.max(1, Number(body.nextNumber || 1)),
        padding,
        is_default: isDefault
    };
    const r = await dbInsert({ table: 'invoice_series', values: insert });
    if (r.error || !r.data?.length) return { data: { error: r.error?.message || 'insert failed' }, error: null };
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    return { data: { ok: true, row }, error: null };
};

const invoiceSeriesDeleteViaDb = async (tenantId, id) => {
    if (!id) return { data: { error: 'id is required' }, error: null };
    const r = await dbDelete({
        table: 'invoice_series',
        filters: [
            { op: 'eq', column: 'id', value: id },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    if (r.error) return { data: { error: r.error.message || 'delete failed' }, error: null };
    return { data: { ok: true }, error: null };
};

const invoiceRecurrenceCreateViaDb = async (tenantId, body) => {
    const name = String(body.name || '').trim();
    if (!name) return { data: { error: 'name is required' }, error: null };
    let templatePayload = body.templatePayload;
    if (templatePayload == null) templatePayload = {};
    if (typeof templatePayload === 'string') {
        try {
            templatePayload = JSON.parse(templatePayload);
        } catch (_) {
            templatePayload = { raw: templatePayload };
        }
    }
    const row = {
        tenant_id: tenantId,
        name,
        frequency: String(body.frequency || 'monthly'),
        day_of_month: body.dayOfMonth != null ? Number(body.dayOfMonth) : null,
        series: String(body.series || 'FAC').trim() || 'FAC',
        invoice_type: String(body.invoiceType || 'standard'),
        template_payload: templatePayload,
        is_active: body.isActive !== false
    };
    const r = await dbInsert({ table: 'invoice_recurrence_templates', values: row });
    if (r.error || !r.data?.length) return { data: { error: r.error?.message || 'create failed' }, error: null };
    const out = Array.isArray(r.data) ? r.data[0] : r.data;
    return { data: { ok: true, row: out }, error: null };
};

const invoiceRecurrenceUpdateViaDb = async (tenantId, body) => {
    const id = body.id;
    if (!id) return { data: { error: 'id is required' }, error: null };
    const patch = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.frequency != null) patch.frequency = String(body.frequency);
    if (body.dayOfMonth !== undefined) patch.day_of_month = body.dayOfMonth == null ? null : Number(body.dayOfMonth);
    if (body.series != null) patch.series = String(body.series).trim();
    if (body.invoiceType != null) patch.invoice_type = String(body.invoiceType);
    if (body.templatePayload !== undefined) {
        let tp = body.templatePayload;
        if (typeof tp === 'string') {
            try {
                tp = JSON.parse(tp);
            } catch (_) {
                tp = { raw: tp };
            }
        }
        patch.template_payload = tp;
    }
    if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive);
    const r = await dbUpdate({
        table: 'invoice_recurrence_templates',
        values: patch,
        filters: [
            { op: 'eq', column: 'id', value: id },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    if (r.error || !r.data?.length) return { data: { error: r.error?.message || 'update failed' }, error: null };
    return { data: { ok: true, row: r.data[0] }, error: null };
};

const invoiceRecurrenceDeleteViaDb = async (tenantId, id) => {
    if (!id) return { data: { error: 'id is required' }, error: null };
    const r = await dbDelete({
        table: 'invoice_recurrence_templates',
        filters: [
            { op: 'eq', column: 'id', value: id },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    if (r.error) return { data: { error: r.error.message || 'delete failed' }, error: null };
    return { data: { ok: true }, error: null };
};

/** Inventario avanzado (misma logica que manage-inventory edge): almacenes, stock por bodega, kardex, alertas, ajuste manual. */
const inventoryNumOr = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
};

const inventoryPickDefaultWarehouseId = async () => {
    const { data: d, error } = await dbSelect({
        table: 'warehouses',
        columns: 'id',
        filters: [{ op: 'eq', column: 'is_default', value: true }],
        limit: 1
    });
    if (!error && d?.[0]?.id) return d[0].id;
    const { data: a, error: e2 } = await dbSelect({
        table: 'warehouses',
        columns: 'id',
        order: { column: 'created_at', ascending: true },
        limit: 1
    });
    if (e2 || !a?.[0]?.id) return null;
    return a[0].id;
};

const inventoryBootstrapViaDb = async (tenantId) => {
    const { data: whs, error: whErr } = await dbSelect({
        table: 'warehouses',
        columns: 'id,is_default',
        limit: 2000
    });
    const whMsg = whErr?.message || '';
    if (whErr && /does not exist|relation/i.test(whMsg)) {
        return {
            data: { ok: false, error: 'Tablas de inventario no instaladas. Ejecuta inventory_module_advanced.sql.' },
            error: null
        };
    }
    if (whErr) return { data: { ok: false, error: whMsg }, error: null };
    let wid = (whs || []).find((w) => w.is_default)?.id || whs?.[0]?.id;
    if (!(whs || []).length) {
        const ins = await dbInsert({
            table: 'warehouses',
            values: {
                tenant_id: tenantId,
                code: 'principal',
                label: 'Principal',
                is_default: true,
                is_active: true
            }
        });
        const insErrMsg = ins.error?.message || '';
        const insRow = Array.isArray(ins.data) ? ins.data[0] : ins.data;
        if (ins.error && !/duplicate|unique/i.test(insErrMsg)) {
            return { data: { ok: false, error: insErrMsg }, error: null };
        }
        if (insRow?.id) wid = insRow.id;
        else {
            const { data: again } = await dbSelect({ table: 'warehouses', columns: 'id', limit: 1 });
            wid = again?.[0]?.id;
        }
    }
    if (!wid) return { data: { ok: true, defaultWarehouseId: null, backfilled: 0 }, error: null };
    const { data: prods, error: pErr } = await dbSelect({
        table: 'products',
        columns: 'id,stock,tracks_stock,item_kind',
        limit: 5000
    });
    if (pErr) return { data: { ok: false, error: pErr.message }, error: null };
    let backfilled = 0;
    for (const p of prods || []) {
        if (String(p.item_kind || '').toLowerCase() === 'service') continue;
        if (p.tracks_stock === false) continue;
        const qty = inventoryNumOr(p.stock, 0);
        const { data: ex } = await dbSelect({
            table: 'warehouse_stock',
            columns: 'warehouse_id',
            filters: [
                { op: 'eq', column: 'warehouse_id', value: wid },
                { op: 'eq', column: 'product_id', value: p.id }
            ],
            limit: 1
        });
        if (ex?.length) continue;
        if (qty === 0) continue;
        const { error: wsErr } = await dbInsert({
            table: 'warehouse_stock',
            values: { warehouse_id: wid, product_id: p.id, quantity: qty }
        });
        if (!wsErr) backfilled += 1;
    }
    return { data: { ok: true, defaultWarehouseId: wid, backfilled }, error: null };
};

const inventoryListWarehousesViaDb = async () => {
    const { data, error } = await dbSelect({
        table: 'warehouses',
        columns: '*',
        order: { column: 'label', ascending: true },
        limit: 2000
    });
    if (error) {
        return { data: { ok: true, rows: [], err: error.message }, error: null };
    }
    const rows = [...(data || [])].sort(
        (a, b) => (b.is_default === true) - (a.is_default === true) || String(a.label || '').localeCompare(String(b.label || ''))
    );
    return { data: { ok: true, rows }, error: null };
};

const inventoryUpsertWarehouseViaDb = async (tenantId, body) => {
    const code = String(body.code || '').trim().toLowerCase();
    const label = String(body.label || '').trim();
    if (!code || !label) return { data: { error: 'code and label required' }, error: null };
    const id = body.id || body.warehouseId || null;
    const isDefault = Boolean(body.isDefault ?? body.is_default);
    const isActive = body.isActive === false || body.is_active === false ? false : true;
    if (isDefault) {
        await dbUpdate({
            table: 'warehouses',
            values: { is_default: false },
            filters: []
        });
    }
    if (id) {
        const r = await dbUpdate({
            table: 'warehouses',
            values: { code, label, is_default: isDefault, is_active: isActive },
            filters: [
                { op: 'eq', column: 'id', value: id },
                { op: 'eq', column: 'tenant_id', value: tenantId }
            ]
        });
        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        if (r.error || !row) return { data: { error: r.error?.message || 'update failed' }, error: null };
        return { data: { ok: true, warehouse: row }, error: null };
    }
    const r = await dbInsert({
        table: 'warehouses',
        values: { tenant_id: tenantId, code, label, is_default: isDefault, is_active: isActive }
    });
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    if (r.error || !row) return { data: { error: r.error?.message || 'insert failed' }, error: null };
    return { data: { ok: true, warehouse: row }, error: null };
};

const inventoryDeleteWarehouseViaDb = async (tenantId, warehouseId) => {
    const wid = warehouseId;
    if (!wid) return { data: { error: 'warehouseId required' }, error: null };
    const { data: rows } = await dbSelect({
        table: 'warehouse_stock',
        columns: 'quantity',
        filters: [{ op: 'eq', column: 'warehouse_id', value: wid }]
    });
    const sum = (rows || []).reduce((s, r) => s + Math.abs(inventoryNumOr(r.quantity, 0)), 0);
    if (sum > 0.0001) {
        return {
            data: { error: 'El almacen tiene existencias; transfiere o ajusta a cero antes de eliminar.' },
            error: null
        };
    }
    const r = await dbDelete({
        table: 'warehouses',
        filters: [
            { op: 'eq', column: 'id', value: wid },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    if (r.error) return { data: { error: r.error.message }, error: null };
    return { data: { ok: true }, error: null };
};

const inventoryListStockByWarehouseViaDb = async (_tenantId, warehouseId) => {
    let warehouseIdResolved = warehouseId;
    if (!warehouseIdResolved) warehouseIdResolved = await inventoryPickDefaultWarehouseId();
    if (!warehouseIdResolved) {
        return {
            data: { ok: true, rows: [], err: 'Sin almacen. Usa bootstrap o crea un almacen.' },
            error: null
        };
    }
    const { data: prods, error: pErr } = await dbSelect({
        table: 'products',
        columns: 'id,sku,name,stock,min_stock,tracks_stock,item_kind',
        order: { column: 'sku', ascending: true },
        limit: 5000
    });
    if (pErr) return { data: { ok: false, error: pErr.message }, error: null };
    const { data: wsRows } = await dbSelect({
        table: 'warehouse_stock',
        columns: 'product_id,quantity',
        filters: [{ op: 'eq', column: 'warehouse_id', value: warehouseIdResolved }]
    });
    const wsMap = new Map((wsRows || []).map((r) => [r.product_id, inventoryNumOr(r.quantity, 0)]));
    const rows = (prods || [])
        .filter((p) => String(p.item_kind || '').toLowerCase() !== 'service' && p.tracks_stock !== false)
        .map((p) => {
            const wq = wsMap.has(p.id) ? wsMap.get(p.id) : inventoryNumOr(p.stock, 0);
            return {
                product_id: p.id,
                sku: p.sku,
                name: p.name,
                quantity_warehouse: wq,
                quantity_catalog: inventoryNumOr(p.stock, 0),
                min_stock: inventoryNumOr(p.min_stock, 0)
            };
        });
    return { data: { ok: true, warehouseId: warehouseIdResolved, rows }, error: null };
};

const inventoryListKardexViaDb = async (_tenantId, body) => {
    const limit = Math.min(500, Math.max(1, inventoryNumOr(body.limit, 100)));
    const filters = [];
    const wh = body.warehouseId || body.warehouse_id;
    if (wh) filters.push({ op: 'eq', column: 'warehouse_id', value: wh });
    const pid = body.productId || body.product_id;
    if (pid) filters.push({ op: 'eq', column: 'product_id', value: pid });
    const { data: krows, error } = await dbSelect({
        table: 'inventory_kardex',
        columns: '*',
        filters,
        order: { column: 'created_at', ascending: false },
        limit
    });
    if (error) return { data: { ok: true, rows: [], err: error.message }, error: null };
    const pids = [...new Set((krows || []).map((k) => k.product_id).filter(Boolean))];
    const whids = [...new Set((krows || []).map((k) => k.warehouse_id).filter(Boolean))];
    const prodMap = new Map();
    const whMap = new Map();
    if (pids.length) {
        const { data: pr } = await dbSelect({
            table: 'products',
            columns: 'id,sku,name',
            filters: [{ op: 'in', column: 'id', value: pids }],
            limit: 5000
        });
        for (const p of pr || []) prodMap.set(p.id, p);
    }
    if (whids.length) {
        const { data: w } = await dbSelect({
            table: 'warehouses',
            columns: 'id,label,code',
            filters: [{ op: 'in', column: 'id', value: whids }],
            limit: 500
        });
        for (const x of w || []) whMap.set(x.id, x);
    }
    const rows = (krows || []).map((k) => ({
        ...k,
        product: prodMap.get(k.product_id) || null,
        warehouse: k.warehouse_id ? whMap.get(k.warehouse_id) || null : null
    }));
    return { data: { ok: true, rows }, error: null };
};

const inventoryListLowStockViaDb = async (_tenantId, body) => {
    const warehouseId = body.warehouseId || null;
    const { data: prods } = await dbSelect({
        table: 'products',
        columns: 'id,sku,name,min_stock,stock,tracks_stock,item_kind',
        limit: 5000
    });
    const tracked = (prods || []).filter(
        (p) => String(p.item_kind || '').toLowerCase() !== 'service' && p.tracks_stock !== false && inventoryNumOr(p.min_stock, 0) > 0
    );
    if (!warehouseId) {
        const rows = tracked
            .filter((p) => inventoryNumOr(p.stock, 0) <= inventoryNumOr(p.min_stock, 0))
            .map((p) => ({
                product_id: p.id,
                sku: p.sku,
                name: p.name,
                quantity: inventoryNumOr(p.stock, 0),
                min_stock: inventoryNumOr(p.min_stock, 0),
                scope: 'total_catalogo'
            }));
        return { data: { ok: true, rows }, error: null };
    }
    const { data: wsRows } = await dbSelect({
        table: 'warehouse_stock',
        columns: 'product_id,quantity',
        filters: [{ op: 'eq', column: 'warehouse_id', value: warehouseId }]
    });
    const wsMap = new Map((wsRows || []).map((r) => [r.product_id, inventoryNumOr(r.quantity, 0)]));
    const rows = [];
    for (const p of tracked) {
        const qn = wsMap.has(p.id) ? wsMap.get(p.id) : inventoryNumOr(p.stock, 0);
        if (qn <= inventoryNumOr(p.min_stock, 0)) {
            rows.push({
                product_id: p.id,
                sku: p.sku,
                name: p.name,
                quantity: qn,
                min_stock: inventoryNumOr(p.min_stock, 0),
                warehouse_id: warehouseId,
                scope: 'almacen'
            });
        }
    }
    return { data: { ok: true, warehouseId, rows }, error: null };
};

const inventoryManualAdjustViaDb = async (tenantId, body) => {
    const warehouseId = body.warehouseId || body.warehouse_id;
    const productId = body.productId || body.product_id;
    const delta = inventoryNumOr(body.quantityDelta ?? body.quantity_delta, 0);
    const reason = String(body.reason || body.notes || '').trim() || 'Ajuste manual';
    if (!warehouseId || !productId || delta === 0) {
        return {
            data: { error: 'warehouseId, productId y quantityDelta distinto de cero son requeridos' },
            error: null
        };
    }
    const { data: whCheck } = await dbSelect({
        table: 'warehouses',
        columns: 'id',
        filters: [
            { op: 'eq', column: 'id', value: warehouseId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ],
        limit: 1
    });
    if (!whCheck?.length) return { data: { error: 'Almacen no encontrado' }, error: null };
    const { data: prodRows, error: prodErr } = await dbSelect({
        table: 'products',
        columns: 'id,stock,price,tracks_stock,item_kind',
        filters: [
            { op: 'eq', column: 'id', value: productId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ],
        limit: 1
    });
    if (prodErr || !prodRows?.length) return { data: { error: 'Producto no encontrado' }, error: null };
    const prod = prodRows[0];
    const track = prod && Object.prototype.hasOwnProperty.call(prod, 'tracks_stock') ? prod.tracks_stock !== false : true;
    const isService = String(prod?.item_kind || '').toLowerCase() === 'service';
    if (!track || isService) {
        return { data: { error: 'Este articulo no admite ajustes de inventario' }, error: null };
    }
    const curP = inventoryNumOr(prod.stock, 0);
    const nextP = Math.max(0, curP + delta);
    const { data: wsExist } = await dbSelect({
        table: 'warehouse_stock',
        columns: 'quantity',
        filters: [
            { op: 'eq', column: 'warehouse_id', value: warehouseId },
            { op: 'eq', column: 'product_id', value: productId }
        ],
        limit: 1
    });
    const curW = wsExist?.length ? inventoryNumOr(wsExist[0].quantity, 0) : curP;
    const nextW = Math.max(0, curW + delta);
    const nowIso = new Date().toISOString();
    if (wsExist?.length) {
        const uWs = await dbUpdate({
            table: 'warehouse_stock',
            values: { quantity: nextW, updated_at: nowIso },
            filters: [
                { op: 'eq', column: 'warehouse_id', value: warehouseId },
                { op: 'eq', column: 'product_id', value: productId }
            ]
        });
        if (uWs.error) return { data: { error: uWs.error.message || 'warehouse_stock failed' }, error: null };
    } else {
        const uWs = await dbInsert({
            table: 'warehouse_stock',
            values: { warehouse_id: warehouseId, product_id: productId, quantity: nextW, updated_at: nowIso }
        });
        if (uWs.error) return { data: { error: uWs.error.message || 'warehouse_stock failed' }, error: null };
    }
    const uP = await dbUpdate({
        table: 'products',
        values: { stock: nextP },
        filters: [
            { op: 'eq', column: 'id', value: productId },
            { op: 'eq', column: 'tenant_id', value: tenantId }
        ]
    });
    if (uP.error) return { data: { error: uP.error.message || 'products update failed' }, error: null };
    const actorId = state.appUser?.id || null;
    const kPayload = {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        product_id: productId,
        movement_type: 'adjustment',
        quantity: delta,
        unit_cost: inventoryNumOr(prod.price, 0),
        reference_type: 'manual',
        reference_id: null,
        notes: reason,
        created_by: actorId
    };
    let kIns = await dbInsert({ table: 'inventory_kardex', values: kPayload });
    if (kIns.error && /column .* does not exist/i.test(String(kIns.error.message || ''))) {
        const slim = {
            tenant_id: tenantId,
            product_id: productId,
            movement_type: 'adjustment',
            quantity: delta,
            unit_cost: inventoryNumOr(prod.price, 0),
            reference_type: 'manual',
            created_by: actorId
        };
        kIns = await dbInsert({ table: 'inventory_kardex', values: slim });
    }
    if (kIns.error) return { data: { error: String(kIns.error.message || kIns.error || 'kardex failed') }, error: null };
    return { data: { ok: true, productStock: nextP, warehouseStock: nextW }, error: null };
};

const fmtDocMoneyInvoice = (n, currency) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '-';
    const cur = currency ? String(currency).toUpperCase() : '';
    if (cur && /^[A-Z]{3}$/.test(cur)) {
        try {
            return new Intl.NumberFormat(getTenantNumberLocale(), {
                style: 'currency',
                currency: cur,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(x);
        } catch (_) {
            /* fall through */
        }
    }
    return `${x.toLocaleString(getTenantNumberLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ''}`;
};

const lineTotalFromRow = (ln) => {
    if (ln.line_total != null && Number.isFinite(Number(ln.line_total))) return Number(ln.line_total);
    const qty = Number(ln.quantity) || 0;
    const pu = Number(ln.unit_price) || 0;
    const trt = Number(ln.tax_rate) || 0;
    const disc = Number(ln.discount || 0) || 0;
    const gross = qty * pu;
    const afterDisc = gross * (1 - disc / 100);
    return afterDisc * (1 + trt / 100);
};

const buildInvoiceDocumentHtml = (ctx) => {
    const { invoice, lines, customer, tenant, branding, fiscalTaxLabel, isDraft } = ctx;
    const b = mergeInvoiceDocumentSettings(branding);
    const draftBanner = isDraft
        ? `<div style="margin-bottom:12px;padding:10px 12px;background:#fef3c7;color:#92400e;font-weight:700;text-align:center;border-radius:8px;border:1px solid #fcd34d">BORRADOR — Documento no emitido / sin valor fiscal.</div>`
        : '';
    const accent = b.accentHex || '#0f2744';
    const tpl = b.templateId || 'classic';
    const company =
        (b.companyDisplayName && String(b.companyDisplayName).trim()) ||
        tenant?.display_name ||
        tenant?.legal_name ||
        tenant?.slug ||
        'Empresa';
    const custName = customer?.name || customer?.email || 'Cliente';
    const custBits = [customer?.email, customer?.tax_id, customer?.address].filter(Boolean).map((x) => String(x));
    const docTitle =
        `${String(invoice.series || '').trim()}-${String(invoice.number || '').trim()}`.replace(/^-+|-+$/g, '') || 'Documento';
    const typeLabel =
        {
            standard: 'Factura',
            proforma: 'Proforma',
            estimate: 'Presupuesto',
            credit_note: 'Nota de credito',
            debit_note: 'Nota de debito'
        }[String(invoice.invoice_type || 'standard')] || 'Documento';
    const cur = invoice.currency || 'DOP';
    const border = tpl === 'minimal' ? 'none' : tpl === 'compact' ? '1px solid #ccc' : '1px solid #cbd5e1';
    const thPad = tpl === 'compact' ? '4px 6px' : tpl === 'minimal' ? '8px 0' : '8px 10px';
    const tdPad = tpl === 'compact' ? '3px 6px' : tpl === 'minimal' ? '6px 0' : '8px 10px';
    const fs = tpl === 'compact' ? 11 : tpl === 'minimal' ? 14 : 13;
    const taxHead = escapeHtml(String(fiscalTaxLabel || 'ITBIS'));

    const lineRows = (lines || [])
        .map((ln) => {
            const desc = escapeHtml(String(ln.description ?? ''));
            const qty = Number(ln.quantity);
            const pu = Number(ln.unit_price);
            const trt = Number(ln.tax_rate);
            const disc = Number(ln.discount || 0) || 0;
            const lt = lineTotalFromRow(ln);
            const discShow = b.showLineDiscounts ? `<td style="padding:${tdPad};border:${border};text-align:right">${disc ? `${disc}%` : '—'}</td>` : '';
            return `<tr>
                <td style="padding:${tdPad};border:${border}">${desc}</td>
                <td style="padding:${tdPad};border:${border};text-align:right">${Number.isFinite(qty) ? escapeHtml(String(qty)) : ''}</td>
                <td style="padding:${tdPad};border:${border};text-align:right">${fmtDocMoneyInvoice(pu, cur)}</td>
                <td style="padding:${tdPad};border:${border};text-align:right">${Number.isFinite(trt) ? escapeHtml(String(trt)) + '%' : ''}</td>
                ${discShow}
                <td style="padding:${tdPad};border:${border};text-align:right;font-weight:600">${fmtDocMoneyInvoice(lt, cur)}</td>
            </tr>`;
        })
        .join('');

    const discHead = b.showLineDiscounts
        ? `<th style="padding:${thPad};border:${border};text-align:right;background:${accent};color:#fff">Dto %</th>`
        : '';
    const colCount = b.showLineDiscounts ? 6 : 5;
    const labelSpan = colCount - 1;
    const logoSrc = b.logoDataUrl ? String(b.logoDataUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;') : '';
    const logoHtml = logoSrc
        ? `<img src="${logoSrc}" alt="Logo" style="max-height:56px;max-width:240px;object-fit:contain" />`
        : '';

    const ncfBlock = invoice.ncf
        ? `<tr><td colspan="${colCount}" style="padding:${tdPad};font-size:12px;border:${border}"><strong>Comprobante fiscal (NCF):</strong> ${escapeHtml(
              String(invoice.ncf)
          )}</td></tr>`
        : '';
    const wh =
        invoice.withholding_total != null && Number(invoice.withholding_total) > 0
            ? `<tr><td colspan="${labelSpan}" style="padding:${tdPad};text-align:right;border:${border}">Retenciones</td><td style="padding:${tdPad};border:${border};text-align:right;font-weight:600">${fmtDocMoneyInvoice(
                  invoice.withholding_total,
                  cur
              )}</td></tr>`
            : '';

    const footHtml = String(b.footerLegal || '')
        .trim()
        .split('\n')
        .map((ln) => escapeHtml(ln))
        .join('<br/>');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${escapeHtml(docTitle)}</title>
<style>
  @media print { .no-print { display: none !important; } }
  body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 22px; color: #0f172a; font-size: ${fs}px; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 3px solid ${accent}; }
  h1 { margin: 4px 0 0; font-size: ${tpl === 'minimal' ? '24px' : '19px'}; color: ${accent}; letter-spacing: -0.02em; }
  table { width: 100%; border-collapse: collapse; }
</style></head><body>
  ${draftBanner}
  <div class="doc-head">
    <div>${logoHtml}<h1>${escapeHtml(typeLabel)}</h1><div style="font-size:12px;opacity:.88">${escapeHtml(String(company))}</div></div>
    <div style="text-align:right;font-size:12px">
      <div style="font-size:22px;font-weight:800;color:${accent}">${escapeHtml(docTitle)}</div>
      <div>${escapeHtml(toDateString(invoice.created_at))}</div>
      <div>Estado: ${escapeHtml(String(invoice.status || ''))}</div>
    </div>
  </div>
  <div style="margin-bottom:16px">
    <div style="font-weight:700;margin-bottom:4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Cliente</div>
    <div style="font-weight:600">${escapeHtml(String(custName))}</div>
    ${custBits.map((t) => `<div style="font-size:12px;color:#475569">${escapeHtml(t)}</div>`).join('')}
  </div>
  <table>
    <thead><tr>
      <th style="padding:${thPad};border:${border};text-align:left;background:${accent};color:#fff">Descripcion</th>
      <th style="padding:${thPad};border:${border};text-align:right;background:${accent};color:#fff">Cant</th>
      <th style="padding:${thPad};border:${border};text-align:right;background:${accent};color:#fff">P.U.</th>
      <th style="padding:${thPad};border:${border};text-align:right;background:${accent};color:#fff">Tasa %</th>
      ${discHead}
      <th style="padding:${thPad};border:${border};text-align:right;background:${accent};color:#fff">Importe</th>
    </tr></thead>
    <tbody>${lineRows}</tbody>
    <tfoot>
      ${ncfBlock}
      <tr><td colspan="${labelSpan}" style="padding:${tdPad};text-align:right;border:${border}">Subtotal</td><td style="padding:${tdPad};border:${border};text-align:right">${fmtDocMoneyInvoice(
  invoice.subtotal,
  cur
      )}</td></tr>
      <tr><td colspan="${labelSpan}" style="padding:${tdPad};text-align:right;border:${border}">${taxHead} (total)</td><td style="padding:${tdPad};border:${border};text-align:right">${fmtDocMoneyInvoice(
  invoice.tax_total,
  cur
      )}</td></tr>
      ${wh}
      <tr><td colspan="${labelSpan}" style="padding:${tdPad};text-align:right;border:${border};font-weight:800;font-size:14px">Total</td><td style="padding:${tdPad};border:${border};text-align:right;font-weight:800;font-size:14px">${fmtDocMoneyInvoice(
  invoice.total,
  cur
      )}</td></tr>
    </tfoot>
  </table>
  ${invoice.notes ? `<div style="margin-top:14px;font-size:12px"><strong>Notas</strong><br/>${escapeHtml(String(invoice.notes)).replace(/\n/g, '<br/>')}</div>` : ''}
  ${footHtml ? `<div style="margin-top:18px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">${footHtml}</div>` : ''}
  <p class="no-print" style="margin-top:14px;font-size:11px;color:#64748b">Zyron — Para PDF use el cuadro de impresion del sistema (Guardar como PDF). Tambien puede descargar HTML desde la app.</p>
  <script>window.addEventListener("load",function(){try{window.focus();}catch(e){}});<\/script>
</body></html>`;
};

const openInvoiceDocumentPreview = async (html, autoPrint) => {
    if (!window.electronAPI?.openHtmlPreview) {
        window.alert('No se pudo abrir la vista previa del documento.');
        return;
    }

    const res = await safeCall(
        () => window.electronAPI.openHtmlPreview({ title: 'Vista previa de documento', html, autoPrint: Boolean(autoPrint) }),
        'desktop.openHtmlPreview'
    );
    const u = unwrapFnInvoke(res);
    if (u.err || u.data?.error) {
        window.alert(u.err || u.data?.error || 'No se pudo abrir la vista previa del documento.');
    }
};

const downloadInvoiceDocumentHtml = (filename, html) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename.replace(/[^\w.\-]+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
};

const exportInvoiceDocumentPdf = async (filename, html) => {
    if (window.electronAPI?.savePdfFromHtml) {
        const res = await safeCall(
            () => window.electronAPI.savePdfFromHtml({ filename: filename.replace(/\.html?$/i, '.pdf'), html }),
            'desktop.savePdfFromHtml'
        );
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) {
            window.alert(u.err || u.data?.error || 'No se pudo guardar el PDF.');
            return;
        }
        if (u.data?.ok && u.data?.path) window.alert(`PDF guardado en:\n${u.data.path}`);
        return;
    }
    openInvoiceDocumentPreview(html, true);
};

const renderFacturasModule = async () => {
    zyronLog('render:facturas:start', { tenantId: state.currentTenantId });
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader('Facturas', 'Necesitas seleccionar una empresa')}`;
        zyronLog('render:facturas:noTenant', {});
        return;
    }
    const tid = state.currentTenantId;
    const tab = state.facturasUi?.tab || 'list';

    const [
        hintsRes,
        docRes,
        { data: invoices },
        { data: customers },
        { data: products },
        { data: tenantRows },
        seriesListRes,
        recRes
    ] = await Promise.all([
        fetchTaxHintsViaDb(tid),
        fetchInvoiceDocSettingsViaDb(tid),
        dbSelect({
            table: 'invoices',
            filters: [
                { op: 'eq', column: 'tenant_id', value: tid },
                { op: 'neq', column: 'invoice_type', value: 'estimate' }
            ],
            order: { column: 'created_at', ascending: false },
            limit: 80
        }),
        dbSelect({
            table: 'customers',
            filters: [{ op: 'eq', column: 'tenant_id', value: tid }],
            order: { column: 'name', ascending: true },
            limit: 200
        }),
        dbSelect({
            table: 'products',
            filters: [{ op: 'eq', column: 'tenant_id', value: tid }],
            order: { column: 'name', ascending: true },
            limit: 200
        }),
        dbSelect({
            table: 'tenants',
            filters: [{ op: 'eq', column: 'id', value: tid }],
            limit: 1
        }),
        fetchInvoiceSeriesListViaDb(tid),
        fetchInvoiceRecurrenceListViaDb(tid)
    ]);
    const hintsU = unwrapFnInvoke(hintsRes);
    const fh = !hintsU.err && hintsU.data?.ok ? hintsU.data : { defaultTaxRate: 18, taxLabel: 'ITBIS' };
    const docU = unwrapFnInvoke(docRes);
    const docSettings = mergeInvoiceDocumentSettings(docU.data?.settings || {});
    const docTemplates = Array.isArray(docU.data?.templates) && docU.data.templates.length ? docU.data.templates : documentTemplateCatalog();
    const tenantRow = (tenantRows || [])[0] || {};
    const seriesUnwrapped = unwrapFnInvoke(seriesListRes);
    const seriesRows = seriesUnwrapped.err ? [] : seriesUnwrapped.data?.rows || [];
    const recUnwrapped = unwrapFnInvoke(recRes);
    const recurrenceRows = recUnwrapped.err ? [] : recUnwrapped.data?.rows || [];

    const customerById = new Map((customers || []).map((c) => [c.id, c]));
    const typeLabel = (t) =>
        ({
            standard: 'Factura',
            proforma: 'Proforma',
            estimate: 'Presupuesto',
            credit_note: 'N. credito',
            debit_note: 'N. debito'
        }[String(t || 'standard')] || t);

    const seriesCodes = new Set(['FAC', 'PRO', 'NCC', 'NDD', ...seriesRows.map((r) => r.code).filter(Boolean)]);
    const fallbackTax = Number.isFinite(Number(fh.defaultTaxRate)) ? Number(fh.defaultTaxRate) : 18;

    const invoiceShelfLineRowTemplate = (line = {}) => {
        const kind = line.lineKind || (line.productId ? 'product' : 'service');
        const defTx = Number(fh.defaultTaxRate);
        const rowFallbackTax = Number.isFinite(defTx) ? defTx : fallbackTax;
        const opts = (products || [])
            .map((p) => {
                const tx = p.tax_rate_default != null && p.tax_rate_default !== '' ? Number(p.tax_rate_default) : rowFallbackTax;
                const dc = p.discount_default != null && p.discount_default !== '' ? Number(p.discount_default) : 0;
                const ik = String(p.item_kind || 'product').toLowerCase();
                const st = ik === 'service' ? 'servicio' : `stock ${Number(p.stock ?? 0)}`;
                return `<option value="${p.id}" ${line.productId === p.id ? 'selected' : ''} data-price="${Number(p.price || 0)}" data-tax="${tx}" data-disc="${dc}" data-item-kind="${escapeHtml(
                    ik
                )}" data-label="${escapeHtml(p.name || p.sku || '')}">${escapeHtml(p.name || p.sku || p.id)} - ${escapeHtml(st)}</option>`;
            })
            .join('');
        return `<tr data-inv-line class="border border-outline-variant/25 bg-white align-top">
            <td colspan="7" class="p-0">
                <div class="grid min-w-[900px] grid-cols-[minmax(320px,1.4fr)_110px_140px_130px_130px_130px_52px] items-start">
                    <div class="border-r border-outline-variant/20 px-5 py-4">
                        <div class="flex gap-3">
                            <span class="material-symbols-outlined mt-2 cursor-move text-lg text-outline" aria-hidden="true">drag_indicator</span>
                            <div class="min-w-0 flex-1 space-y-2">
                                <div class="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr]">
                                    <select data-fld="kind" class="w-full rounded-md border border-outline-variant/45 bg-white px-2 py-2 text-xs">
                                        <option value="service" ${kind === 'service' ? 'selected' : ''}>Servicio</option>
                                        <option value="product" ${kind === 'product' ? 'selected' : ''}>Producto</option>
                                    </select>
                                    <select data-fld="product" data-product-cell class="w-full rounded-md border border-outline-variant/45 bg-white px-2 py-2 text-xs ${kind === 'product' ? '' : 'hidden'}"><option value="">Seleccionar item</option>${opts}</select>
                                </div>
                                <textarea data-fld="desc" rows="2" class="w-full resize-none rounded-md border border-outline-variant/45 px-3 py-2 text-sm" placeholder="Nombre o descripcion del item">${escapeHtml(
                                    line.description || ''
                                )}</textarea>
                            </div>
                        </div>
                    </div>
                    <div class="border-r border-outline-variant/20 px-5 py-4 text-right"><input data-fld="qty" type="number" step="0.01" class="w-full rounded-md border border-outline-variant/45 px-2 py-2 text-right text-sm" value="${Number(
                        line.quantity ?? 1
                    )}" /></div>
                    <div class="border-r border-outline-variant/20 px-5 py-4"><input data-fld="price" type="number" step="0.01" class="w-full rounded-md border border-outline-variant/45 px-2 py-2 text-right text-sm" value="${Number(
                        line.unitPrice ?? 0
                    )}" /></div>
                    <div class="border-r border-outline-variant/20 px-5 py-4"><input data-fld="tax" type="number" step="0.01" class="w-full rounded-md border border-outline-variant/45 px-2 py-2 text-right text-sm" value="${Number(
                        line.taxRate != null && line.taxRate !== '' ? line.taxRate : rowFallbackTax
                    )}" /></div>
                    <div class="border-r border-outline-variant/20 px-5 py-4"><input data-fld="disc" type="number" step="0.01" class="w-full rounded-md border border-outline-variant/45 px-2 py-2 text-right text-sm" value="${Number(
                        line.discount ?? 0
                    )}" /></div>
                    <div class="border-r border-outline-variant/20 px-5 py-4 text-right font-semibold" data-line-total>${fmtMoneyPanel(0)}</div>
                    <div class="flex items-center justify-center px-2 py-4"><button type="button" data-remove-line class="material-symbols-outlined text-error" title="Quitar linea">delete</button></div>
                </div>
            </td>
        </tr>`;
    };

    const tabBtn = (key, label) => {
        const on = tab === key;
        return `<button type="button" data-fact-tab="${key}" class="rounded-md px-3 py-1.5 text-sm ${
            on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
        }">${label}</button>`;
    };

    const invoiceListRows = (invoices || [])
        .map((invoice) => {
            const cust = invoice.customer_id ? customerById.get(invoice.customer_id) : null;
            const custLabel = cust ? escapeHtml(cust.name || cust.email || '') : '—';
            const doc = `${escapeHtml(invoice.series || '')}-${escapeHtml(invoice.number || '')}`;
            const st = String(invoice.status || '').toLowerCase();
            return `<tr class="border-b border-outline-variant/20" data-invoice-row="${invoice.id}">
                <td class="py-3 font-medium">${doc}</td>
                <td class="py-3 font-mono text-xs">${escapeHtml(invoice.ncf || '')}</td>
                <td class="py-3">${escapeHtml(typeLabel(invoice.invoice_type))}</td>
                <td class="py-3">${escapeHtml(invoice.status || '')}</td>
                <td class="py-3">${escapeHtml(String(invoice.total ?? ''))}</td>
                <td class="py-3 text-xs">${custLabel}</td>
                <td class="py-3 text-xs">${escapeHtml(toDateString(invoice.created_at))}</td>
                <td class="py-3 text-right space-x-1 whitespace-nowrap">
                    <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-inv-action="history" data-id="${
                        invoice.id
                    }">Historial</button>
                    ${
                        st === 'draft'
                            ? `<button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-inv-action="edit" data-id="${invoice.id}">Editar</button>
                    <button type="button" class="rounded border border-primary/50 px-2 py-1 text-xs text-primary" data-inv-action="issue" data-id="${invoice.id}">Emitir</button>`
                            : ''
                    }
                    <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-inv-action="dup" data-id="${
                        invoice.id
                    }">Duplicar</button>
                    <button type="button" class="rounded border border-primary/40 px-2 py-1 text-xs text-primary" data-inv-action="pdf" data-id="${
                        invoice.id
                    }" title="Imprimir o guardar como PDF">PDF</button>
                    <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-inv-action="doc-html" data-id="${
                        invoice.id
                    }" title="Descargar HTML del documento">HTML</button>
                    ${
                        st === 'draft' || st === 'pending'
                            ? `<button type="button" class="rounded border border-error/40 px-2 py-1 text-xs text-error" data-inv-action="del" data-id="${invoice.id}">Eliminar</button>`
                            : ''
                    }
                </td>
            </tr>`;
        })
        .join('');

    const seriesTableRows = (seriesRows || [])
        .map(
            (r) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2">${escapeHtml(r.code)}</td>
            <td class="py-2">${escapeHtml(r.label || '')}</td>
            <td class="py-2">${r.next_number}</td>
            <td class="py-2">${r.padding}</td>
            <td class="py-2">${r.is_default ? 'Si' : ''}</td>
            <td class="py-2 text-right"><button type="button" class="text-xs text-error" data-series-del="${r.id}">Eliminar</button></td>
        </tr>`
        )
        .join('');

    const recTableRows = (recurrenceRows || [])
        .map(
            (r) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2">${escapeHtml(r.name)}</td>
            <td class="py-2 text-xs">${escapeHtml(r.frequency)} / ${escapeHtml(r.series)}</td>
            <td class="py-2 text-xs">${r.is_active ? 'Activa' : 'Pausada'}</td>
            <td class="py-2 text-right space-x-1">
                <button type="button" class="text-xs" data-rec-toggle="${r.id}" data-active="${r.is_active ? '1' : '0'}">${
                r.is_active ? 'Pausar' : 'Activar'
            }</button>
                <button type="button" class="text-xs text-error" data-rec-del="${r.id}">Eliminar</button>
            </td>
        </tr>`
        )
        .join('');

    const listPanel = `
        <div class="mb-4 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 class="text-sm font-bold text-primary">Facturacion</h3>
                    <p class="mt-1 text-xs text-on-surface-variant">Crea una factura nueva desde aqui y luego completa las lineas, cliente y emision.</p>
                </div>
                <button type="button" id="factura-new-btn-top" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Crear factura</button>
            </div>
        </div>
        <p class="mb-3 text-xs text-on-surface-variant">Abre el editor desde el boton principal. Borradores BOR; al emitir queda lista para cobro.</p>
        <div id="facturas-table-wrap" class="overflow-x-auto">
            <table class="w-full min-w-[820px] text-left text-sm">
                <thead>
                    <tr class="border-b border-outline-variant/30">
                        <th class="py-2">Documento</th>
                        <th class="py-2">NCF</th>
                        <th class="py-2">Tipo</th>
                        <th class="py-2">Estado</th>
                        <th class="py-2">Total</th>
                        <th class="py-2">Cliente</th>
                        <th class="py-2">Fecha</th>
                        <th class="py-2 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody>${invoiceListRows || `<tr><td colspan="8" class="py-6 text-center text-on-surface-variant">Sin facturas</td></tr>`}</tbody>
            </table>
        </div>`;

    const seriesPanel = `
        <p class="mb-3 text-xs text-on-surface-variant">Define codigos de serie (FAC, PRO, etc.). La numeracion la incrementa la funcion zyron_next_invoice_number en base de datos.</p>
        <div class="mb-4 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
            <input id="series-code" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Codigo (FAC)" />
            <input id="series-label" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Etiqueta" />
            <input id="series-padding" type="number" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Padding" value="6" />
            <label class="flex items-center gap-2 text-xs"><input type="checkbox" id="series-default" /> Predeterminada</label>
        </div>
        <button type="button" id="series-save-btn" class="mb-4 rounded-md bg-primary px-3 py-2 text-sm text-white">Guardar serie</button>
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead>
                    <tr class="border-b border-outline-variant/30">
                        <th class="py-2">Codigo</th>
                        <th class="py-2">Etiqueta</th>
                        <th class="py-2">Siguiente</th>
                        <th class="py-2">Padding</th>
                        <th class="py-2">Defecto</th>
                        <th class="py-2"></th>
                    </tr>
                </thead>
                <tbody>${seriesTableRows || `<tr><td colspan="6" class="py-4 text-on-surface-variant">Sin series (se crean al emitir o aqui).</td></tr>`}</tbody>
            </table>
        </div>`;

    const recurrencePanel = `
        <p class="mb-3 text-xs text-on-surface-variant">Plantillas para facturas recurrentes. La ejecucion programada (cron) debe conectarse a estas filas en un despliegue posterior.</p>
        <div class="mb-4 grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
            <input id="rec-name" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Nombre plantilla" />
            <select id="rec-frequency" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm">
                <option value="weekly">Semanal</option>
                <option value="monthly" selected>Mensual</option>
                <option value="yearly">Anual</option>
            </select>
            <input id="rec-series" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Serie (FAC)" value="FAC" />
            <input id="rec-day" type="number" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Dia del mes (1-28)" min="1" max="28" />
            <textarea id="rec-payload" class="sm:col-span-2 rounded-md border border-outline-variant/40 px-2 py-2 font-mono text-xs" rows="3" placeholder='Payload JSON p.ej. {"items":[{"description":"Mantenimiento","quantity":1,"unitPrice":100,"taxRate":18}]}'></textarea>
        </div>
        <button type="button" id="rec-save-btn" class="mb-4 rounded-md bg-primary px-3 py-2 text-sm text-white">Crear plantilla</button>
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead>
                    <tr class="border-b border-outline-variant/30">
                        <th class="py-2">Nombre</th>
                        <th class="py-2">Frecuencia / serie</th>
                        <th class="py-2">Estado</th>
                        <th class="py-2 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody>${recTableRows || `<tr><td colspan="4" class="py-4 text-on-surface-variant">Sin plantillas</td></tr>`}</tbody>
            </table>
        </div>`;

    const tplCatalogForUi =
        docTemplates.length > 0
            ? docTemplates
            : [
                  { id: 'classic', label: 'Clasica', description: 'Tabla con marcos y barra de color en cabecera.' },
                  { id: 'minimal', label: 'Minimal', description: 'Tipografia clara, pocos bordes, aspecto editorial.' },
                  { id: 'compact', label: 'Compacta', description: 'Alta densidad para muchas lineas en una sola hoja.' }
              ];
    const logoPreviewAttr = docSettings.logoDataUrl
        ? String(docSettings.logoDataUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        : '';
    const documentosPanel = `
        <p class="mb-3 text-xs text-on-surface-variant">Plantillas de factura, logo y pie legal. El PDF se obtiene con <strong>Imprimir → Guardar como PDF</strong> desde la vista previa. Desde la lista use <strong>PDF</strong> o descargue <strong>HTML</strong>.</p>
        ${
            docU.err || docU.data?.ok === false
                ? `<div class="mb-3 rounded-md border border-amber-700/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">No se pudieron leer los ajustes de marca desde la base (sesion, red o permisos). La vista previa local sigue disponible; al guardar, Zyron persiste por IPC en <code class="rounded bg-white px-1">app_settings</code>.</div>`
                : ''
        }
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div class="space-y-4 rounded-lg border border-outline-variant/30 bg-surface-container-high/20 p-4">
                <h4 class="text-sm font-bold text-primary">Marca y pie</h4>
                <label class="block text-xs font-medium text-on-surface-variant">Logo (PNG, JPG, WebP; recomendado menor a 300 KB)
                    <input type="file" id="doc-logo-file" accept="image/png,image/jpeg,image/webp,image/gif" class="mt-1 block w-full text-sm" />
                </label>
                <input type="hidden" id="doc-logo-data" value="" />
                <input type="hidden" id="doc-logo-removed" value="" />
                <div id="doc-logo-preview" class="flex min-h-[52px] items-center justify-start rounded border border-dashed border-outline-variant/50 bg-surface-container-lowest p-2">
                    ${
                        logoPreviewAttr
                            ? `<img src="${logoPreviewAttr}" alt="Logo" class="max-h-16 max-w-[200px] object-contain" />`
                            : '<span class="text-xs text-on-surface-variant">Sin logo (opcional)</span>'
                    }
                </div>
                <button type="button" id="doc-logo-clear" class="text-xs font-semibold text-error">Quitar logo</button>
                <label class="block text-xs font-medium text-on-surface-variant">Color de acento
                    <input type="color" id="doc-accent" class="mt-1 h-10 w-full max-w-[120px] cursor-pointer rounded border border-outline-variant/40" value="${escapeHtml(docSettings.accentHex)}" />
                </label>
                <label class="block text-xs font-medium text-on-surface-variant">Nombre en documento (opcional)
                    <input type="text" id="doc-company-name" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" value="${escapeHtml(
                        docSettings.companyDisplayName
                    )}" placeholder="${escapeHtml(String(tenantRow.display_name || tenantRow.legal_name || 'Empresa'))}" />
                </label>
                <label class="block text-xs font-medium text-on-surface-variant">Pie legal / notas al pie
                    <textarea id="doc-footer" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" rows="4" placeholder="RNC, terminos de pago, etc.">${escapeHtml(
                        docSettings.footerLegal
                    )}</textarea>
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" id="doc-show-disc" class="h-4 w-4" ${docSettings.showLineDiscounts ? 'checked' : ''} />
                    <span>Mostrar columna descuento por linea</span>
                </label>
                <div class="flex flex-wrap gap-2">
                    <button type="button" id="doc-branding-save" class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar formato</button>
                    <button type="button" id="doc-preview-sample" class="rounded-md border border-outline-variant/50 px-4 py-2 text-sm">Vista previa</button>
                </div>
                <p id="doc-branding-status" class="hidden text-xs"></p>
            </div>
            <div class="rounded-lg border border-outline-variant/30 p-4">
                <h4 class="mb-3 text-sm font-bold text-primary">Plantillas</h4>
                <div class="space-y-2">${tplCatalogForUi
                    .map(
                        (t) => `
                    <label class="flex cursor-pointer gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-3 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20">
                        <input type="radio" name="doc-template" value="${escapeHtml(t.id)}" class="mt-1" ${docSettings.templateId === t.id ? 'checked' : ''} />
                        <div>
                            <div class="text-sm font-semibold text-on-surface">${escapeHtml(t.label)}</div>
                            <div class="text-xs text-on-surface-variant">${escapeHtml(t.description || '')}</div>
                        </div>
                    </label>`
                    )
                    .join('')}
                </div>
            </div>
        </div>`;

    const mainBody = tab === 'list' ? listPanel : tab === 'series' ? seriesPanel : recurrencePanel;

    dashboardContent.innerHTML = `
        ${renderModuleHeader('Facturas', 'Facturacion avanzada: borradores, tipos, NC/ND, series, plantillas recurrentes, formato PDF/HTML e historial')}
        <div class="rounded-xl bg-surface-container-low p-1" data-facturas-root>
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <div class="mb-4 flex flex-wrap gap-2">${tabBtn('list', 'Facturas')}${tabBtn('series', 'Series')}${tabBtn(
        'recurrence',
        'Recurrencia'
    )}</div>
                ${mainBody}
            </div>
        </div>
        <div id="factura-sheet" class="hidden bg-surface text-on-surface">
            <div class="w-full bg-surface py-5">
                <div class="sticky top-0 z-10 -mx-6 -mt-5 mb-6 border-b border-outline-variant/30 bg-surface-container-lowest px-6 py-4 shadow-sm">
                    <div class="mx-auto flex max-w-7xl items-start justify-between gap-2">
                        <div>
                            <div class="mb-1 text-xs text-on-surface-variant">Facturas / <span id="factura-sheet-sub"></span></div>
                            <h3 id="factura-sheet-title" class="text-2xl font-bold tracking-tight">Factura</h3>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" id="factura-sheet-close" class="rounded-md border border-outline-variant/50 bg-white px-4 py-2 text-sm font-semibold text-primary">Cerrar</button>
                            <button type="button" id="factura-save-draft-top" class="rounded-md border border-outline-variant/50 bg-white px-4 py-2 text-sm font-semibold text-primary">Guardar borrador</button>
                            <button type="button" id="factura-issue-btn-top" class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar factura</button>
                        </div>
                    </div>
                </div>
                <div class="mx-auto max-w-7xl">
                    <input type="hidden" id="factura-sheet-invoice-id" value="" />
                    <div class="mb-8 grid grid-cols-12 gap-8">
                        <div class="col-span-12 rounded-md border border-outline-variant/30 bg-white p-5 shadow-sm lg:col-span-5">
                            <label class="block text-sm font-semibold text-on-surface">Cliente
                                <select id="factura-customer" class="mt-2 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                                    <option value="">Seleccionar cliente</option>
                                    ${(customers || [])
                                        .map((c) => `<option value="${c.id}">${escapeHtml(c.name || c.email || c.id)}</option>`)
                                        .join('')}
                                </select>
                            </label>
                            <p class="mt-3 text-xs text-on-surface-variant">Se usara en el documento y la exportacion PDF.</p>
                        </div>
                        <div class="col-span-12 grid grid-cols-1 gap-4 rounded-md border border-outline-variant/30 bg-white p-5 shadow-sm sm:grid-cols-2 lg:col-span-7">
                            <label class="text-xs font-semibold text-on-surface-variant">Tipo
                                <select id="factura-inv-type" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm">
                                    <option value="standard">Factura</option>
                                    <option value="proforma">Proforma</option>
                                    <option value="credit_note">Nota de credito</option>
                                    <option value="debit_note">Nota de debito</option>
                                </select>
                            </label>
                            <label class="text-xs font-semibold text-on-surface-variant">Plantilla
                                <div class="mt-1 flex gap-2">
                                    <select id="factura-template" class="min-w-0 flex-1 rounded-md border border-outline-variant/40 px-2 py-2 text-sm">
                                        ${docTemplates.map((t) => `<option value="${escapeHtml(t.id)}" ${docSettings.templateId === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
                                    </select>
                                    <button type="button" id="factura-template-save" class="rounded-md border border-outline-variant/50 px-3 py-2 text-xs font-semibold text-primary">Cambiar</button>
                                </div>
                            </label>
                            <label class="text-xs font-semibold text-on-surface-variant">Fecha de factura
                                <input id="factura-date" type="date" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" />
                            </label>
                            <label class="text-xs font-semibold text-on-surface-variant">Fecha de vencimiento
                                <input id="factura-due-date" type="date" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" />
                            </label>
                            <label class="hidden text-xs font-semibold text-on-surface-variant sm:col-span-2" id="factura-parent-wrap">Documento padre (NC/ND)
                                <select id="factura-parent-id" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm">
                                    <option value="">Seleccionar documento</option>
                                    ${(invoices || [])
                                        .filter((inv) => {
                                            const s = String(inv.status || '').toLowerCase();
                                            const t = String(inv.invoice_type || 'standard');
                                            return (s === 'pending' || s === 'paid') && t !== 'credit_note' && t !== 'debit_note';
                                        })
                                        .map((inv) => `<option value="${inv.id}">${escapeHtml(inv.series)}-${escapeHtml(inv.number)} (${escapeHtml(inv.status)})</option>`)
                                        .join('')}
                                </select>
                            </label>
                        </div>
                    </div>
                    <div class="overflow-x-auto rounded-md border border-outline-variant/30 bg-white shadow-sm">
                        <table class="w-full min-w-[900px] text-left text-sm">
                            <thead>
                                <tr class="border-b border-outline-variant/30 text-on-surface-variant">
                                    <th class="px-5 py-3 text-left"><span class="pl-8">Items</span></th>
                                    <th class="px-5 py-3 text-right">Cantidad</th>
                                    <th class="px-5 py-3 text-right">Precio</th>
                                    <th class="px-5 py-3 text-right">${escapeHtml(fh.taxLabel || 'ITBIS')} %</th>
                                    <th class="px-5 py-3 text-right">Descuento %</th>
                                    <th class="px-5 py-3 text-right">Importe</th>
                                    <th class="px-2 py-3"></th>
                                </tr>
                            </thead>
                            <tbody id="facturas-lines-tbody"></tbody>
                        </table>
                        <button type="button" id="factura-add-line" class="flex w-full items-center justify-center gap-2 border-t border-outline-variant/30 px-6 py-3 text-sm font-semibold text-primary hover:bg-primary/5">
                            <span class="material-symbols-outlined text-lg" aria-hidden="true">add_circle</span>
                            Anadir nuevo item
                        </button>
                    </div>
                    <div class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
                        <div>
                            <label class="mb-2 block text-sm font-semibold text-on-surface">Notas</label>
                            <textarea id="factura-notes" class="min-h-[150px] w-full rounded-md border border-outline-variant/35 bg-white px-3 py-3 text-sm shadow-sm" placeholder="Notas visibles para el cliente"></textarea>
                        </div>
                        <div class="ml-auto w-full rounded-md border border-outline-variant/30 bg-white p-5 shadow-sm md:min-w-[390px] lg:max-w-md">
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-semibold uppercase text-on-surface-variant">Subtotal</span>
                                <span id="factura-subtotal" class="text-lg text-on-surface">${fmtMoneyPanel(0)}</span>
                            </div>
                            <div class="mt-3 flex items-center justify-between">
                                <span class="text-sm font-semibold uppercase text-on-surface-variant">${escapeHtml(fh.taxLabel || 'ITBIS')}</span>
                                <span id="factura-tax-total" class="text-lg text-on-surface">${fmtMoneyPanel(0)}</span>
                            </div>
                            <div class="mt-5 flex items-center justify-between border-t border-outline-variant/30 pt-4">
                                <span class="text-sm font-semibold uppercase text-on-surface-variant">Total importe:</span>
                                <span id="factura-grand-total" class="text-xl font-bold text-primary">${fmtMoneyPanel(0)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mt-6 flex flex-wrap justify-end gap-2">
                        <button type="button" id="factura-save-draft" class="rounded-md border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-primary">Guardar borrador</button>
                        <button type="button" id="factura-issue-btn" class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar factura</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="factura-history-backdrop" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
            <div class="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-5 shadow-lg">
                <div class="mb-3 flex justify-between">
                    <h3 class="text-lg font-semibold">Historial</h3>
                    <button type="button" id="factura-history-close" class="text-sm">Cerrar</button>
                </div>
                <div id="factura-history-body" class="space-y-2 text-xs font-mono"></div>
            </div>
        </div>`;

    const syncLineRowUi = (tr) => {
        if (!tr) return;
        const kind = tr.querySelector('[data-fld="kind"]')?.value || 'service';
        const cell = tr.querySelector('[data-product-cell]');
        if (cell) cell.classList.toggle('hidden', kind !== 'product');
    };

    const collectLines = () => {
        const rows = [...document.querySelectorAll('[data-inv-line]')];
        const out = [];
        for (const tr of rows) {
            const kind = tr.querySelector('[data-fld="kind"]')?.value || 'service';
            const productId = tr.querySelector('[data-fld="product"]')?.value || null;
            const description = tr.querySelector('[data-fld="desc"]')?.value?.trim() || '';
            const quantity = Number(tr.querySelector('[data-fld="qty"]')?.value || 0);
            const unitPrice = Number(tr.querySelector('[data-fld="price"]')?.value || 0);
            const taxRate = Number(tr.querySelector('[data-fld="tax"]')?.value || 0);
            const discount = Number(tr.querySelector('[data-fld="disc"]')?.value || 0);
            if (!description && !productId) continue;
            if (quantity <= 0) continue;
            const item = { description, quantity, unitPrice, taxRate, discount, lineKind: kind };
            if (kind === 'product' && productId) {
                item.productId = productId;
                const selEl = tr.querySelector('[data-fld="product"]');
                const opt = selEl?.selectedOptions?.[0];
                if (opt && !description) item.description = opt.getAttribute('data-label') || 'Producto';
            }
            out.push(item);
        }
        return out;
    };

    const refreshFacturaTotals = () => {
        let subtotal = 0;
        let taxTotal = 0;
        document.querySelectorAll('[data-inv-line]').forEach((tr) => {
            const qty = Number(tr.querySelector('[data-fld="qty"]')?.value || 0);
            const price = Number(tr.querySelector('[data-fld="price"]')?.value || 0);
            const tax = Number(tr.querySelector('[data-fld="tax"]')?.value || 0);
            const disc = Number(tr.querySelector('[data-fld="disc"]')?.value || 0);
            const base = Math.max(0, qty * price);
            const discounted = base * (1 - Math.max(0, disc) / 100);
            const lineTax = discounted * (Math.max(0, tax) / 100);
            const total = discounted + lineTax;
            subtotal += discounted;
            taxTotal += lineTax;
            const lineEl = tr.querySelector('[data-line-total]');
            if (lineEl) lineEl.textContent = fmtMoneyPanel(total);
        });
        const subEl = document.getElementById('factura-subtotal');
        const taxEl = document.getElementById('factura-tax-total');
        const totalEl = document.getElementById('factura-grand-total');
        if (subEl) subEl.textContent = fmtMoneyPanel(subtotal);
        if (taxEl) taxEl.textContent = fmtMoneyPanel(taxTotal);
        if (totalEl) totalEl.textContent = fmtMoneyPanel(subtotal + taxTotal);
    };

    const openSheet = (opts) => {
        const { mode, invoiceId, lines, invoiceType, parentId, customerId, notes } = opts;
        const sheet = document.getElementById('factura-sheet');
        const sub = document.getElementById('factura-sheet-sub');
        const title = document.getElementById('factura-sheet-title');
        document.getElementById('factura-sheet-invoice-id').value = invoiceId || '';
        title.textContent = mode === 'create' ? 'Nueva factura' : 'Editar borrador';
        sub.textContent = invoiceId ? `ID interno: ${invoiceId}` : 'Se creara como borrador (serie BOR).';
        document.getElementById('factura-inv-type').value = invoiceType || 'standard';
        document.getElementById('factura-parent-id').value = parentId || '';
        document.getElementById('factura-customer').value = customerId || '';
        document.getElementById('factura-notes').value = notes || '';
        const today = new Date().toISOString().slice(0, 10);
        const dueDays = clampPreferenceDays(state.tenantPreferences?.invoiceDueDays, 30);
        const due = new Date(Date.now() + dueDays * 86400000).toISOString().slice(0, 10);
        const dateEl = document.getElementById('factura-date');
        const dueEl = document.getElementById('factura-due-date');
        if (dateEl) dateEl.value = opts.invoiceDate || today;
        if (dueEl) dueEl.value = opts.dueDate || due;
        const tbody = document.getElementById('facturas-lines-tbody');
        const seed = lines?.length
            ? lines
            : [{ lineKind: 'service', description: 'Servicio', quantity: 1, unitPrice: 0, taxRate: fallbackTax, discount: 0 }];
        tbody.innerHTML = seed.map((l) => invoiceShelfLineRowTemplate(l)).join('');
        const fixProductSelect = (tr, pid) => {
            if (!pid || !tr) return;
            const sel = tr.querySelector('[data-fld="product"]');
            if (sel) sel.value = pid;
        };
        [...tbody.querySelectorAll('[data-inv-line]')].forEach((tr, i) => {
            syncLineRowUi(tr);
            const p = seed[i];
            if (p?.productId) fixProductSelect(tr, p.productId);
        });
        const invTypeEl = document.getElementById('factura-inv-type');
        const parentWrap = document.getElementById('factura-parent-wrap');
        const toggleParent = () => {
            const t = invTypeEl.value;
            parentWrap.classList.toggle('hidden', t !== 'credit_note' && t !== 'debit_note');
        };
        invTypeEl.onchange = toggleParent;
        toggleParent();
        refreshFacturaTotals();
        document.querySelector('[data-facturas-root]')?.classList.add('hidden');
        sheet.classList.remove('hidden');
    };

    const closeSheet = () => {
        const sheet = document.getElementById('factura-sheet');
        sheet.classList.add('hidden');
        document.querySelector('[data-facturas-root]')?.classList.remove('hidden');
    };

    document.querySelectorAll('[data-fact-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.facturasUi = { tab: btn.getAttribute('data-fact-tab') };
            renderFacturasModule();
        });
    });

    document.getElementById('factura-new-btn-top')?.addEventListener('click', () => {
        openSheet({
            mode: 'create',
            invoiceId: null,
            lines: [{ lineKind: 'service', description: '', quantity: 1, unitPrice: 0, taxRate: fallbackTax, discount: 0 }]
        });
    });
    if (state.facturasUi?.openComposer) {
        state.facturasUi = { ...state.facturasUi, openComposer: false };
        openSheet({
            mode: 'create',
            invoiceId: null,
            lines: [{ lineKind: 'service', description: '', quantity: 1, unitPrice: 0, taxRate: fallbackTax, discount: 0 }]
        });
    }
    document.getElementById('factura-sheet-close')?.addEventListener('click', closeSheet);
    document.getElementById('factura-save-draft-top')?.addEventListener('click', () => {
        document.getElementById('factura-save-draft')?.click();
    });
    document.getElementById('factura-issue-btn-top')?.addEventListener('click', () => {
        document.getElementById('factura-issue-btn')?.click();
    });
    document.getElementById('factura-template-save')?.addEventListener('click', async () => {
        const templateId = document.getElementById('factura-template')?.value || docSettings.templateId;
        await persistFacturaTemplateChoice(templateId);
        window.alert('Plantilla actualizada.');
    });
    document.getElementById('factura-add-line')?.addEventListener('click', () => {
        const tbody = document.getElementById('facturas-lines-tbody');
        tbody.insertAdjacentHTML('beforeend', invoiceShelfLineRowTemplate({}));
        const tr = tbody.lastElementChild;
        syncLineRowUi(tr);
        refreshFacturaTotals();
    });

    document.getElementById('facturas-lines-tbody')?.addEventListener('change', (e) => {
        const t = e.target;
        const tr = t.closest('[data-inv-line]');
        if (t.matches('[data-fld="kind"]')) syncLineRowUi(tr);
        if (t.matches('[data-fld="product"]')) {
            const opt = t.selectedOptions[0];
            const price = Number(opt?.getAttribute('data-price') || 0);
            const tax = Number(opt?.getAttribute('data-tax') ?? fallbackTax);
            const disc = Number(opt?.getAttribute('data-disc') ?? 0);
            const itemKind = String(opt?.getAttribute('data-item-kind') || 'product').toLowerCase();
            const label = opt?.getAttribute('data-label') || '';
            const desc = tr.querySelector('[data-fld="desc"]');
            if (desc && !desc.value.trim()) desc.value = label;
            const pr = tr.querySelector('[data-fld="price"]');
            if (pr && !Number(pr.value)) pr.value = String(price);
            const txEl = tr.querySelector('[data-fld="tax"]');
            if (txEl) txEl.value = String(Number.isFinite(tax) ? tax : fallbackTax);
            const dEl = tr.querySelector('[data-fld="disc"]');
            if (dEl) dEl.value = String(Number.isFinite(disc) ? disc : 0);
            const kindSel = tr.querySelector('[data-fld="kind"]');
            if (kindSel && itemKind === 'service') {
                kindSel.value = 'service';
                syncLineRowUi(tr);
            }
        }
        refreshFacturaTotals();
    });

    document.getElementById('facturas-lines-tbody')?.addEventListener('input', () => {
        refreshFacturaTotals();
    });

    document.getElementById('facturas-lines-tbody')?.addEventListener('click', (e) => {
        if (e.target.matches('[data-remove-line]')) {
            const tr = e.target.closest('[data-inv-line]');
            const tbody = document.getElementById('facturas-lines-tbody');
            if (tbody && tbody.querySelectorAll('[data-inv-line]').length > 1) tr.remove();
            refreshFacturaTotals();
        }
    });

    const readSheetMeta = () => ({
        invoiceType: document.getElementById('factura-inv-type').value,
        parentInvoiceId: document.getElementById('factura-parent-id').value || null,
        customerId: document.getElementById('factura-customer').value || null,
        notes: document.getElementById('factura-notes').value || '',
        series:
            document.getElementById('factura-inv-type').value === 'credit_note'
                ? 'NCC'
                : document.getElementById('factura-inv-type').value === 'debit_note'
                  ? 'NDD'
                  : document.getElementById('factura-inv-type').value === 'proforma'
                    ? 'PRO'
                    : 'FAC',
        templateId: document.getElementById('factura-template')?.value || docSettings.templateId,
        dueDate: document.getElementById('factura-due-date')?.value || null
    });
    const persistFacturaTemplateChoice = async (templateId) => {
        if (!templateId || templateId === docSettings.templateId) return;
        await invoiceDocumentBrandingUpsertViaDb(tid, { ...docSettings, templateId });
    };

    document.getElementById('factura-save-draft')?.addEventListener('click', async () => {
        const items = collectLines();
        if (!items.length) {
            window.alert('Anade al menos una linea valida (cantidad > 0).');
            return;
        }
        const meta = readSheetMeta();
        if ((meta.invoiceType === 'credit_note' || meta.invoiceType === 'debit_note') && !meta.parentInvoiceId) {
            window.alert('Selecciona el documento padre para NC/ND.');
            return;
        }
        if (state.tenantPreferences?.confirmBeforeIssue !== false && !window.confirm('Emitir esta factura?')) return;
        await persistFacturaTemplateChoice(meta.templateId);
        const iid = document.getElementById('factura-sheet-invoice-id').value.trim();
        if (!iid) {
            const res = await invokeFn('create-invoice-with-stock', {
                tenantId: tid,
                customerId: meta.customerId,
                items,
                notes: meta.notes,
                dueDate: meta.dueDate,
                isDraft: true,
                invoiceType: meta.invoiceType,
                parentInvoiceId: meta.parentInvoiceId
            });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) {
                window.alert(u.err || u.data?.error || 'No se pudo crear el borrador.');
                return;
            }
            document.getElementById('factura-sheet-invoice-id').value = u.data.invoice?.id || '';
            window.alert('Borrador guardado.');
        } else {
            const res = await invokeFn('update-invoice', {
                tenantId: tid,
                invoiceId: iid,
                action: 'save_draft',
                items,
                notes: meta.notes,
                dueDate: meta.dueDate,
                customerId: meta.customerId,
                invoiceType: meta.invoiceType,
                parentInvoiceId: meta.parentInvoiceId
            });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) {
                window.alert(u.err || u.data?.error || 'No se pudo actualizar.');
                return;
            }
            window.alert('Borrador actualizado.');
        }
        await renderFacturasModule();
    });

    document.getElementById('factura-issue-btn')?.addEventListener('click', async () => {
        const items = collectLines();
        if (!items.length) {
            window.alert('Anade al menos una linea valida.');
            return;
        }
        const meta = readSheetMeta();
        if ((meta.invoiceType === 'credit_note' || meta.invoiceType === 'debit_note') && !meta.parentInvoiceId) {
            window.alert('Selecciona el documento padre para NC/ND.');
            return;
        }
        await persistFacturaTemplateChoice(meta.templateId);
        const iid = document.getElementById('factura-sheet-invoice-id').value.trim();
        if (!iid) {
            const res = await invokeFn('create-invoice-with-stock', {
                tenantId: tid,
                customerId: meta.customerId,
                items,
                notes: meta.notes,
                dueDate: meta.dueDate,
                isDraft: false,
                series: meta.series,
                invoiceType: meta.invoiceType,
                parentInvoiceId: meta.parentInvoiceId
            });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) {
                window.alert(u.err || u.data?.error || 'No se pudo emitir.');
                return;
            }
            closeSheet();
            await renderFacturasModule();
            return;
        }
        const res = await invokeFn('update-invoice', {
            tenantId: tid,
            invoiceId: iid,
            action: 'issue',
            items,
            series: meta.series,
            notes: meta.notes,
            dueDate: meta.dueDate,
            customerId: meta.customerId,
            invoiceType: meta.invoiceType,
            parentInvoiceId: meta.parentInvoiceId
        });
        const u = unwrapFnInvoke(res);
        if (u.err || !u.data?.ok) {
            window.alert(u.err || u.data?.error || 'No se pudo emitir.');
            return;
        }
        closeSheet();
        await renderFacturasModule();
    });

    document.getElementById('facturas-table-wrap')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-inv-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-inv-action');
        if (act === 'history') {
            const { data: logs } = await dbSelect({
                table: 'audit_logs',
                filters: [
                    { op: 'eq', column: 'tenant_id', value: tid },
                    { op: 'eq', column: 'target_type', value: 'invoices' },
                    { op: 'eq', column: 'target_id', value: id }
                ],
                order: { column: 'created_at', ascending: false },
                limit: 40
            });
            const body = document.getElementById('factura-history-body');
            body.innerHTML = (logs || [])
                .map(
                    (l) =>
                        `<div class="rounded border border-outline-variant/30 p-2"><div class="font-semibold">${escapeHtml(
                            l.action || ''
                        )}</div><div class="text-on-surface-variant">${escapeHtml(toDateString(l.created_at))}</div><pre class="mt-1 whitespace-pre-wrap break-all">${escapeHtml(
                            JSON.stringify(l.details || {}, null, 0)
                        )}</pre></div>`
                )
                .join('') || '<p class="text-on-surface-variant">Sin registros.</p>';
            const bd = document.getElementById('factura-history-backdrop');
            bd.classList.remove('hidden');
            bd.classList.add('flex');
        }
        if (act === 'edit') {
            const inv = (invoices || []).find((x) => x.id === id);
            const { data: lineRows } = await dbSelect({
                table: 'invoice_items',
                filters: [{ op: 'eq', column: 'invoice_id', value: id }]
            });
            const lines = (lineRows || []).map((r) => ({
                lineKind: r.line_kind || (r.product_id ? 'product' : 'service'),
                productId: r.product_id,
                description: r.description,
                quantity: Number(r.quantity),
                unitPrice: Number(r.unit_price),
                taxRate: Number(r.tax_rate),
                discount: Number(r.discount || 0)
            }));
            openSheet({
                mode: 'edit',
                invoiceId: id,
                lines,
                invoiceType: inv?.invoice_type || 'standard',
                parentId: inv?.parent_invoice_id,
                customerId: inv?.customer_id,
                notes: inv?.notes || '',
                dueDate: inv?.due_date || ''
            });
        }
        if (act === 'issue') {
            const inv = (invoices || []).find((x) => x.id === id);
            const { data: lineRows } = await dbSelect({
                table: 'invoice_items',
                filters: [{ op: 'eq', column: 'invoice_id', value: id }]
            });
            const lines = (lineRows || []).map((r) => ({
                lineKind: r.line_kind || (r.product_id ? 'product' : 'service'),
                productId: r.product_id,
                description: r.description,
                quantity: Number(r.quantity),
                unitPrice: Number(r.unit_price),
                taxRate: Number(r.tax_rate),
                discount: Number(r.discount || 0)
            }));
            openSheet({
                mode: 'edit',
                invoiceId: id,
                lines,
                invoiceType: inv?.invoice_type || 'standard',
                parentId: inv?.parent_invoice_id,
                customerId: inv?.customer_id,
                notes: inv?.notes || '',
                dueDate: inv?.due_date || ''
            });
        }
        if (act === 'dup') {
            const res = await invokeFn('duplicate-invoice', { tenantId: tid, invoiceId: id });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'Duplicar fallo.');
            await renderFacturasModule();
        }
        if (act === 'del') {
            if (!window.confirm('Eliminar esta factura?')) return;
            const res = await invokeFn('delete-invoice', { tenantId: tid, invoiceId: id });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'Eliminar fallo.');
            await renderFacturasModule();
        }
        if (act === 'pdf' || act === 'doc-html') {
            const inv = (invoices || []).find((x) => x.id === id);
            if (!inv) return;
            const { data: lineRows } = await dbSelect({
                table: 'invoice_items',
                filters: [{ op: 'eq', column: 'invoice_id', value: id }]
            });
            const cust = inv.customer_id ? customerById.get(inv.customer_id) : null;
            const html = buildInvoiceDocumentHtml({
                invoice: inv,
                lines: lineRows || [],
                customer: cust,
                tenant: tenantRow,
                branding: docSettings,
                fiscalTaxLabel: fh.taxLabel,
                isDraft: String(inv.status || '').toLowerCase() === 'draft'
            });
            const fn = `factura-${String(inv.series || 'DOC')}-${String(inv.number || id)}.html`;
            if (act === 'pdf') await exportInvoiceDocumentPdf(fn.replace(/\.html?$/i, '.pdf'), html);
            else downloadInvoiceDocumentHtml(fn, html);
        }
    });

    document.getElementById('factura-history-close')?.addEventListener('click', () => {
        const bd = document.getElementById('factura-history-backdrop');
        bd.classList.add('hidden');
        bd.classList.remove('flex');
    });

    document.getElementById('series-save-btn')?.addEventListener('click', async () => {
        const code = document.getElementById('series-code')?.value?.trim();
        const label = document.getElementById('series-label')?.value?.trim();
        const padding = Number(document.getElementById('series-padding')?.value || 6);
        const isDefault = Boolean(document.getElementById('series-default')?.checked);
        const res = await invoiceSeriesUpsertViaDb(tid, {
            code,
            label: label || code,
            padding,
            isDefault
        });
        const u = unwrapFnInvoke(res);
        if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'No se pudo guardar la serie.');
        await renderFacturasModule();
    });

    document.querySelectorAll('[data-series-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const sid = btn.getAttribute('data-series-del');
            if (!window.confirm('Eliminar esta serie?')) return;
            const res = await invoiceSeriesDeleteViaDb(tid, sid);
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'No se pudo eliminar.');
            await renderFacturasModule();
        });
    });

    document.getElementById('rec-save-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('rec-name')?.value?.trim();
        let templatePayload = {};
        const raw = document.getElementById('rec-payload')?.value?.trim();
        if (raw) {
            try {
                templatePayload = JSON.parse(raw);
            } catch (_) {
                window.alert('Payload JSON invalido.');
                return;
            }
        }
        const res = await invoiceRecurrenceCreateViaDb(tid, {
            name,
            frequency: document.getElementById('rec-frequency')?.value || 'monthly',
            series: document.getElementById('rec-series')?.value || 'FAC',
            dayOfMonth: document.getElementById('rec-day')?.value
                ? Number(document.getElementById('rec-day').value)
                : null,
            templatePayload
        });
        const u = unwrapFnInvoke(res);
        if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'No se pudo crear la plantilla.');
        await renderFacturasModule();
    });

    document.querySelectorAll('[data-rec-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const rid = btn.getAttribute('data-rec-del');
            if (!window.confirm('Eliminar plantilla?')) return;
            const res = await invoiceRecurrenceDeleteViaDb(tid, rid);
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'No se pudo eliminar.');
            await renderFacturasModule();
        });
    });

    document.querySelectorAll('[data-rec-toggle]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const rid = btn.getAttribute('data-rec-toggle');
            const active = btn.getAttribute('data-active') === '1';
            const res = await invoiceRecurrenceUpdateViaDb(tid, {
                id: rid,
                isActive: !active
            });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'No se pudo actualizar.');
            await renderFacturasModule();
        });
    });

    if (tab === 'documentos') {
        const setDocStatus = (msg, isErr) => {
            const el = document.getElementById('doc-branding-status');
            if (!el) return;
            el.textContent = msg || '';
            el.classList.toggle('hidden', !msg);
            el.classList.toggle('text-error', Boolean(isErr));
            el.classList.toggle('text-primary', !isErr && Boolean(msg));
        };
        document.getElementById('doc-logo-file')?.addEventListener('change', (ev) => {
            const f = ev.target.files?.[0];
            const rm = document.getElementById('doc-logo-removed');
            if (rm) rm.value = '';
            if (!f) return;
            if (f.size > 380000) {
                window.alert('Imagen demasiado grande; usa una por debajo de ~300 KB.');
                ev.target.value = '';
                return;
            }
            const r = new FileReader();
            r.onload = () => {
                const data = typeof r.result === 'string' ? r.result : '';
                const hid = document.getElementById('doc-logo-data');
                if (hid) hid.value = data;
                const pv = document.getElementById('doc-logo-preview');
                if (pv) {
                    const safe = data.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                    pv.innerHTML = `<img src="${safe}" class="max-h-16 max-w-[200px] object-contain" alt="" />`;
                }
            };
            r.readAsDataURL(f);
        });
        document.getElementById('doc-logo-clear')?.addEventListener('click', () => {
            const hid = document.getElementById('doc-logo-data');
            if (hid) hid.value = '';
            const rm = document.getElementById('doc-logo-removed');
            if (rm) rm.value = '1';
            const fi = document.getElementById('doc-logo-file');
            if (fi) fi.value = '';
            const pv = document.getElementById('doc-logo-preview');
            if (pv) pv.innerHTML = '<span class="text-xs text-on-surface-variant">Logo se quitara al guardar.</span>';
        });
        document.getElementById('doc-branding-save')?.addEventListener('click', async () => {
            const tplEl = document.querySelector('input[name="doc-template"]:checked');
            const docPayload = {
                templateId: tplEl?.value || docSettings.templateId,
                accentHex: document.getElementById('doc-accent')?.value || docSettings.accentHex,
                footerLegal: document.getElementById('doc-footer')?.value || '',
                companyDisplayName: document.getElementById('doc-company-name')?.value || '',
                showLineDiscounts: Boolean(document.getElementById('doc-show-disc')?.checked)
            };
            if (document.getElementById('doc-logo-removed')?.value === '1') docPayload.logoDataUrl = null;
            else {
                const nd = document.getElementById('doc-logo-data')?.value?.trim();
                if (nd) docPayload.logoDataUrl = nd;
            }
            const res = await invoiceDocumentBrandingUpsertViaDb(tid, docPayload);
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) {
                setDocStatus(u.err || u.data?.error || 'Error al guardar', true);
                return;
            }
            setDocStatus('Guardado.', false);
            state.facturasUi = { ...state.facturasUi, tab: 'documentos' };
            await renderFacturasModule();
        });
        document.getElementById('doc-preview-sample')?.addEventListener('click', async () => {
            const inv = (invoices || [])[0];
            if (!inv) {
                window.alert('No hay facturas en la lista para previsualizar.');
                return;
            }
            const { data: lineRows } = await dbSelect({
                table: 'invoice_items',
                filters: [{ op: 'eq', column: 'invoice_id', value: inv.id }]
            });
            const cust = inv.customer_id ? customerById.get(inv.customer_id) : null;
            const tplEl = document.querySelector('input[name="doc-template"]:checked');
            const liveBranding = {
                ...docSettings,
                templateId: tplEl?.value || docSettings.templateId,
                accentHex: document.getElementById('doc-accent')?.value || docSettings.accentHex,
                footerLegal: document.getElementById('doc-footer')?.value || '',
                companyDisplayName: document.getElementById('doc-company-name')?.value || '',
                showLineDiscounts: Boolean(document.getElementById('doc-show-disc')?.checked),
                logoDataUrl: document.getElementById('doc-logo-data')?.value?.trim() || docSettings.logoDataUrl
            };
            if (document.getElementById('doc-logo-removed')?.value === '1') liveBranding.logoDataUrl = '';
            const html = buildInvoiceDocumentHtml({
                invoice: inv,
                lines: lineRows || [],
                customer: cust,
                tenant: tenantRow,
                branding: liveBranding,
                fiscalTaxLabel: fh.taxLabel,
                isDraft: String(inv.status || '').toLowerCase() === 'draft'
            });
            openInvoiceDocumentPreview(html, false);
        });
    }

    zyronLog('render:facturas:done', { invoiceCount: (invoices || []).length, tab });
};

const renderPresupuestosModule = async () => {
    zyronLog('render:presupuestos:start', { tenantId: state.currentTenantId });
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader('Presupuestos', 'Necesitas seleccionar una empresa')}`;
        return;
    }
    const tid = state.currentTenantId;
    const [hintsRes, docRes, { data: estimates }, { data: customers }, { data: products }, { data: tenantRows }] =
        await Promise.all([
            fetchTaxHintsViaDb(tid),
            fetchInvoiceDocSettingsViaDb(tid),
            dbSelect({
                table: 'invoices',
                filters: [
                    { op: 'eq', column: 'tenant_id', value: tid },
                    { op: 'eq', column: 'invoice_type', value: 'estimate' }
                ],
                order: { column: 'created_at', ascending: false },
                limit: 100
            }),
            dbSelect({
                table: 'customers',
                filters: [{ op: 'eq', column: 'tenant_id', value: tid }],
                order: { column: 'name', ascending: true },
                limit: 200
            }),
            dbSelect({
                table: 'products',
                filters: [{ op: 'eq', column: 'tenant_id', value: tid }],
                order: { column: 'name', ascending: true },
                limit: 200
            }),
            dbSelect({
                table: 'tenants',
                filters: [{ op: 'eq', column: 'id', value: tid }],
                limit: 1
            })
        ]);
    const hintsU = unwrapFnInvoke(hintsRes);
    const fh = !hintsU.err && hintsU.data?.ok ? hintsU.data : { defaultTaxRate: 18, taxLabel: 'ITBIS' };
    const fallbackTax = Number.isFinite(Number(fh.defaultTaxRate)) ? Number(fh.defaultTaxRate) : 18;
    const docU = unwrapFnInvoke(docRes);
    const docSettings = mergeInvoiceDocumentSettings(docU.data?.settings || {});
    const docTemplates = Array.isArray(docU.data?.templates) && docU.data.templates.length ? docU.data.templates : documentTemplateCatalog();
    const tenantRow = (tenantRows || [])[0] || {};
    const customerById = new Map((customers || []).map((c) => [c.id, c]));

    const estimateShelfLineRowTemplate = (line = {}) => {
        const kind = line.lineKind || (line.productId ? 'product' : 'service');
        const opts = (products || [])
            .map((p) => {
                const tax = p.tax_rate_default != null && p.tax_rate_default !== '' ? Number(p.tax_rate_default) : fallbackTax;
                const disc = p.discount_default != null && p.discount_default !== '' ? Number(p.discount_default) : 0;
                const itemKind = String(p.item_kind || 'product').toLowerCase();
                const st = itemKind === 'service' ? 'servicio' : `stock ${Number(p.stock ?? 0)}`;
                return `<option value="${p.id}" ${line.productId === p.id ? 'selected' : ''} data-price="${Number(p.price || 0)}" data-tax="${tax}" data-disc="${disc}" data-item-kind="${escapeHtml(
                    itemKind
                )}" data-label="${escapeHtml(p.name || p.sku || '')}">${escapeHtml(p.name || p.sku || p.id)} - ${escapeHtml(st)}</option>`;
            })
            .join('');
        return `<tr data-est-line class="border border-outline-variant/25 bg-white align-top">
            <td colspan="7" class="p-0">
                <div class="grid min-w-[900px] grid-cols-[minmax(320px,1.4fr)_110px_140px_130px_130px_130px_52px] items-start">
                    <div class="border-r border-outline-variant/20 px-5 py-4">
                        <div class="flex gap-3">
                            <span class="material-symbols-outlined mt-2 cursor-move text-lg text-outline" aria-hidden="true">drag_indicator</span>
                            <div class="min-w-0 flex-1 space-y-2">
                                <div class="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr]">
                                    <select data-fld="kind" class="w-full rounded-md border border-outline-variant/45 bg-white px-2 py-2 text-xs">
                                        <option value="service" ${kind === 'service' ? 'selected' : ''}>Servicio</option>
                                        <option value="product" ${kind === 'product' ? 'selected' : ''}>Producto</option>
                                    </select>
                                    <select data-fld="product" data-product-cell class="w-full rounded-md border border-outline-variant/45 bg-white px-2 py-2 text-xs ${kind === 'product' ? '' : 'hidden'}"><option value="">Seleccionar item</option>${opts}</select>
                                </div>
                                <textarea data-fld="desc" rows="2" class="w-full resize-none rounded-md border border-outline-variant/45 px-3 py-2 text-sm" placeholder="Nombre o descripcion del item">${escapeHtml(
                                    line.description || ''
                                )}</textarea>
                            </div>
                        </div>
                    </div>
                    <div class="border-r border-outline-variant/20 px-5 py-4 text-right"><input data-fld="qty" type="number" step="0.01" class="w-full rounded-md border border-outline-variant/45 px-2 py-2 text-right text-sm" value="${Number(
                        line.quantity ?? 1
                    )}" /></div>
                    <div class="border-r border-outline-variant/20 px-5 py-4"><input data-fld="price" type="number" step="0.01" class="w-full rounded-md border border-outline-variant/45 px-2 py-2 text-right text-sm" value="${Number(
                        line.unitPrice ?? 0
                    )}" /></div>
                    <div class="border-r border-outline-variant/20 px-5 py-4"><input data-fld="tax" type="number" step="0.01" class="w-full rounded-md border border-outline-variant/45 px-2 py-2 text-right text-sm" value="${Number(
                        line.taxRate != null && line.taxRate !== '' ? line.taxRate : fallbackTax
                    )}" /></div>
                    <div class="border-r border-outline-variant/20 px-5 py-4"><input data-fld="disc" type="number" step="0.01" class="w-full rounded-md border border-outline-variant/45 px-2 py-2 text-right text-sm" value="${Number(
                        line.discount ?? 0
                    )}" /></div>
                    <div class="border-r border-outline-variant/20 px-5 py-4 text-right font-semibold" data-est-line-total>${fmtMoneyPanel(0)}</div>
                    <div class="flex items-center justify-center px-2 py-4"><button type="button" data-remove-est-line class="material-symbols-outlined text-error" title="Quitar linea">delete</button></div>
                </div>
            </td>
        </tr>`;
    };

    const statusLabel = (status) =>
        ({
            draft: 'Borrador',
            pending: 'Enviado a revision',
            accepted: 'Aceptado',
            rejected: 'Rechazado',
            converted: 'Convertido'
        }[String(status || '').toLowerCase()] || status || '-');

    const estimateRows = (estimates || [])
        .map((est) => {
            const cust = est.customer_id ? customerById.get(est.customer_id) : null;
            const st = String(est.status || '').toLowerCase();
            const doc = `${escapeHtml(est.series || '')}-${escapeHtml(est.number || '')}`.replace(/^-|-$/g, '');
            const canEdit = st === 'draft';
            const canDecision = st === 'pending';
            const canConvert = st === 'accepted' || st === 'pending';
            return `<tr class="border-b border-outline-variant/20" data-est-row="${est.id}">
                <td class="py-3 font-mono text-xs">${doc || escapeHtml(est.id)}</td>
                <td class="py-3">${escapeHtml(statusLabel(st))}</td>
                <td class="py-3 font-semibold">${fmtMoneyPanel(est.total, est.currency)}</td>
                <td class="py-3 text-xs">${cust ? escapeHtml(cust.name || cust.email || '') : '-'}</td>
                <td class="py-3 text-xs">${escapeHtml(toDateString(est.created_at))}</td>
                <td class="py-3 text-right space-x-1 whitespace-nowrap">
                    <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-est-action="history" data-id="${est.id}">Historial</button>
                    ${
                        canEdit
                            ? `<button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-est-action="edit" data-id="${est.id}">Editar</button>
                               <button type="button" class="rounded border border-primary/50 px-2 py-1 text-xs text-primary" data-est-action="issue" data-id="${est.id}">Emitir</button>`
                            : ''
                    }
                    ${
                        canDecision
                            ? `<button type="button" class="rounded border border-primary/40 px-2 py-1 text-xs text-primary" data-est-action="accept" data-id="${est.id}">Aceptar</button>
                               <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-est-action="reject" data-id="${est.id}">Rechazar</button>`
                            : ''
                    }
                    ${
                        canConvert
                            ? `<button type="button" class="rounded border border-primary/50 px-2 py-1 text-xs text-primary" data-est-action="convert" data-id="${est.id}">Convertir</button>`
                            : ''
                    }
                    <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-est-action="dup" data-id="${est.id}">Duplicar</button>
                    <button type="button" class="rounded border border-primary/40 px-2 py-1 text-xs text-primary" data-est-action="pdf" data-id="${est.id}">PDF</button>
                    <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-est-action="html" data-id="${est.id}">HTML</button>
                    ${
                        st === 'draft' || st === 'pending' || st === 'rejected'
                            ? `<button type="button" class="rounded border border-error/40 px-2 py-1 text-xs text-error" data-est-action="del" data-id="${est.id}">Eliminar</button>`
                            : ''
                    }
                </td>
            </tr>`;
        })
        .join('');

    dashboardContent.innerHTML = `
        ${renderModuleHeader('Presupuestos', 'Crea, edita, aprueba, rechaza y convierte presupuestos a facturas. Sin envio de email.')}
        <div class="rounded-xl bg-surface-container-low p-1" data-presupuestos-root>
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <div class="mb-4 rounded-xl border border-outline-variant/25 bg-surface-container-low p-4">
                    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 class="text-sm font-bold text-primary">Presupuestos comerciales</h3>
                            <p class="mt-1 text-xs text-on-surface-variant">Trabaja propuestas con lineas, impuestos, cliente, PDF/HTML y conversion a factura borrador.</p>
                        </div>
                        <button type="button" id="estimate-new-btn-top" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Crear presupuesto</button>
                    </div>
                </div>
                <p class="mb-3 text-xs text-on-surface-variant">Emitir marca el presupuesto como pendiente. Aceptar/Rechazar actualiza estado; Convertir crea una factura borrador.</p>
                <div id="presupuestos-table-wrap" class="overflow-x-auto">
                    <table class="w-full min-w-[840px] text-left text-sm">
                        <thead>
                            <tr class="border-b border-outline-variant/30">
                                <th class="py-2">Documento</th>
                                <th class="py-2">Estado</th>
                                <th class="py-2">Total</th>
                                <th class="py-2">Cliente</th>
                                <th class="py-2">Fecha</th>
                                <th class="py-2 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>${estimateRows || `<tr><td colspan="6" class="py-6 text-center text-on-surface-variant">Sin presupuestos</td></tr>`}</tbody>
                    </table>
                </div>
            </div>
        </div>
        <div id="estimate-sheet" class="hidden bg-surface py-5 text-on-surface">
            <div class="mx-auto w-full max-w-7xl">
                <div class="mb-4 border-b border-outline-variant/30 bg-surface-container-lowest pb-4">
                <div class="mb-4 flex items-start justify-between gap-2">
                    <div>
                        <div class="mb-1 text-xs text-on-surface-variant">Presupuestos / <span id="estimate-sheet-sub"></span></div>
                        <h3 id="estimate-sheet-title" class="text-2xl font-bold tracking-tight">Presupuesto</h3>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" id="estimate-sheet-close" class="rounded-md border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-primary">Cerrar</button>
                        <button type="button" id="estimate-save-draft-top" class="rounded-md border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-primary">Guardar borrador</button>
                        <button type="button" id="estimate-issue-btn-top" class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar presupuesto</button>
                    </div>
                </div>
                </div>
                <input type="hidden" id="estimate-sheet-id" value="" />
                <div class="mb-8 grid grid-cols-12 gap-8">
                    <div class="col-span-12 rounded-md border border-outline-variant/30 bg-white p-5 shadow-sm lg:col-span-5">
                        <label class="block text-sm font-semibold text-on-surface">Cliente
                            <select id="estimate-customer" class="mt-2 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                                <option value="">Seleccionar cliente</option>
                                ${(customers || [])
                                    .map((c) => `<option value="${c.id}">${escapeHtml(c.name || c.email || c.id)}</option>`)
                                    .join('')}
                            </select>
                        </label>
                        <p class="mt-3 text-xs text-on-surface-variant">El presupuesto usa la misma metodologia que factura, pero no descuenta inventario.</p>
                    </div>
                    <div class="col-span-12 grid grid-cols-1 gap-4 rounded-md border border-outline-variant/30 bg-white p-5 shadow-sm sm:grid-cols-2 lg:col-span-7">
                        <label class="text-xs font-semibold text-on-surface-variant">Fecha del presupuesto
                            <input id="estimate-date" type="date" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" />
                        </label>
                        <label class="text-xs font-semibold text-on-surface-variant">Fecha de expiracion
                            <input id="estimate-expiry-date" type="date" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" />
                        </label>
                        <label class="text-xs font-semibold text-on-surface-variant sm:col-span-2">Plantilla
                            <div class="mt-1 flex gap-2">
                                <select id="estimate-template" class="min-w-0 flex-1 rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                                    ${docTemplates.map((t) => `<option value="${escapeHtml(t.id)}" ${docSettings.templateId === t.id ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}
                                </select>
                                <button type="button" id="estimate-template-save" class="rounded-md border border-outline-variant/50 px-3 py-2 text-xs font-semibold text-primary">Cambiar</button>
                            </div>
                        </label>
                    </div>
                </div>
                <div class="overflow-x-auto rounded-md border border-outline-variant/30 bg-white shadow-sm">
                    <table class="w-full min-w-[900px] text-left text-sm">
                        <thead>
                            <tr class="border-b border-outline-variant/30 text-on-surface-variant">
                                <th class="px-5 py-3 text-left"><span class="pl-8">Items</span></th>
                                <th class="px-5 py-3 text-right">Cantidad</th>
                                <th class="px-5 py-3 text-right">Precio</th>
                                <th class="px-5 py-3 text-right">${escapeHtml(fh.taxLabel || 'ITBIS')} %</th>
                                <th class="px-5 py-3 text-right">Descuento %</th>
                                <th class="px-5 py-3 text-right">Importe</th>
                                <th class="px-2 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="estimates-lines-tbody"></tbody>
                    </table>
                    <button type="button" id="estimate-add-line" class="flex w-full items-center justify-center gap-2 border-t border-outline-variant/30 px-6 py-3 text-sm font-semibold text-primary hover:bg-primary/5">
                        <span class="material-symbols-outlined text-lg" aria-hidden="true">add_circle</span>
                        Anadir nuevo item
                    </button>
                </div>
                <div class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
                    <div>
                        <label class="mb-2 block text-sm font-semibold text-on-surface">Notas</label>
                        <textarea id="estimate-notes" class="min-h-[150px] w-full rounded-md border border-outline-variant/35 bg-white px-3 py-3 text-sm shadow-sm" placeholder="Notas visibles para el cliente"></textarea>
                    </div>
                    <div class="ml-auto w-full rounded-md border border-outline-variant/30 bg-white p-5 shadow-sm md:min-w-[390px] lg:max-w-md">
                        <div class="flex items-center justify-between">
                            <span class="text-sm font-semibold uppercase text-on-surface-variant">Subtotal</span>
                            <span id="estimate-subtotal" class="text-lg text-on-surface">${fmtMoneyPanel(0)}</span>
                        </div>
                        <div class="mt-3 flex items-center justify-between">
                            <span class="text-sm font-semibold uppercase text-on-surface-variant">${escapeHtml(fh.taxLabel || 'ITBIS')}</span>
                            <span id="estimate-tax-total" class="text-lg text-on-surface">${fmtMoneyPanel(0)}</span>
                        </div>
                        <div class="mt-5 flex items-center justify-between border-t border-outline-variant/30 pt-4">
                            <span class="text-sm font-semibold uppercase text-on-surface-variant">Total importe:</span>
                            <span id="estimate-grand-total" class="text-xl font-bold text-primary">${fmtMoneyPanel(0)}</span>
                        </div>
                    </div>
                </div>
                <div class="mt-6 flex flex-wrap justify-end gap-2">
                    <button type="button" id="estimate-save-draft" class="rounded-md border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-primary">Guardar borrador</button>
                    <button type="button" id="estimate-issue-btn" class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar presupuesto</button>
                </div>
            </div>
        </div>
        <div id="estimate-history-backdrop" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-4">
            <div class="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-5 shadow-lg">
                <div class="mb-3 flex justify-between">
                    <h3 class="text-lg font-semibold">Historial</h3>
                    <button type="button" id="estimate-history-close" class="text-sm">Cerrar</button>
                </div>
                <div id="estimate-history-body" class="space-y-2 text-xs font-mono"></div>
            </div>
        </div>`;

    const syncLineRowUi = (tr) => {
        if (!tr) return;
        const kind = tr.querySelector('[data-fld="kind"]')?.value || 'service';
        tr.querySelector('[data-product-cell]')?.classList.toggle('hidden', kind !== 'product');
    };
    const collectLines = () => {
        const out = [];
        for (const tr of document.querySelectorAll('[data-est-line]')) {
            const kind = tr.querySelector('[data-fld="kind"]')?.value || 'service';
            const productId = tr.querySelector('[data-fld="product"]')?.value || null;
            const description = tr.querySelector('[data-fld="desc"]')?.value?.trim() || '';
            const quantity = Number(tr.querySelector('[data-fld="qty"]')?.value || 0);
            const unitPrice = Number(tr.querySelector('[data-fld="price"]')?.value || 0);
            const taxRate = Number(tr.querySelector('[data-fld="tax"]')?.value || 0);
            const discount = Number(tr.querySelector('[data-fld="disc"]')?.value || 0);
            if ((!description && !productId) || quantity <= 0) continue;
            const item = { description, quantity, unitPrice, taxRate, discount, lineKind: kind };
            if (kind === 'product' && productId) item.productId = productId;
            out.push(item);
        }
        return out;
    };
    const refreshEstimateTotals = () => {
        let subtotal = 0;
        let taxTotal = 0;
        document.querySelectorAll('[data-est-line]').forEach((tr) => {
            const qty = Number(tr.querySelector('[data-fld="qty"]')?.value || 0);
            const price = Number(tr.querySelector('[data-fld="price"]')?.value || 0);
            const tax = Number(tr.querySelector('[data-fld="tax"]')?.value || 0);
            const disc = Number(tr.querySelector('[data-fld="disc"]')?.value || 0);
            const base = Math.max(0, qty * price);
            const discounted = base * (1 - Math.max(0, disc) / 100);
            const lineTax = discounted * (Math.max(0, tax) / 100);
            const total = discounted + lineTax;
            subtotal += discounted;
            taxTotal += lineTax;
            const lineEl = tr.querySelector('[data-est-line-total]');
            if (lineEl) lineEl.textContent = fmtMoneyPanel(total);
        });
        const subEl = document.getElementById('estimate-subtotal');
        const taxEl = document.getElementById('estimate-tax-total');
        const totalEl = document.getElementById('estimate-grand-total');
        if (subEl) subEl.textContent = fmtMoneyPanel(subtotal);
        if (taxEl) taxEl.textContent = fmtMoneyPanel(taxTotal);
        if (totalEl) totalEl.textContent = fmtMoneyPanel(subtotal + taxTotal);
    };
    const openSheet = (opts) => {
        document.getElementById('estimate-sheet-id').value = opts.id || '';
        document.getElementById('estimate-sheet-title').textContent = opts.id ? 'Editar presupuesto' : 'Nuevo presupuesto';
        document.getElementById('estimate-sheet-sub').textContent = opts.id ? `ID interno: ${opts.id}` : 'Se creara como borrador (serie BOR).';
        document.getElementById('estimate-customer').value = opts.customerId || '';
        document.getElementById('estimate-notes').value = opts.notes || '';
        const today = new Date().toISOString().slice(0, 10);
        const expiryDays = clampPreferenceDays(state.tenantPreferences?.estimateExpiryDays, 15);
        const expiry = new Date(Date.now() + expiryDays * 86400000).toISOString().slice(0, 10);
        const dateEl = document.getElementById('estimate-date');
        const expiryEl = document.getElementById('estimate-expiry-date');
        if (dateEl) dateEl.value = opts.estimateDate || today;
        if (expiryEl) expiryEl.value = opts.expiryDate || expiry;
        const tbody = document.getElementById('estimates-lines-tbody');
        const seed = opts.lines?.length
            ? opts.lines
            : [{ lineKind: 'service', description: '', quantity: 1, unitPrice: 0, taxRate: fallbackTax, discount: 0 }];
        tbody.innerHTML = seed.map((l) => estimateShelfLineRowTemplate(l)).join('');
        [...tbody.querySelectorAll('[data-est-line]')].forEach((tr, i) => {
            syncLineRowUi(tr);
            if (seed[i]?.productId) {
                const sel = tr.querySelector('[data-fld="product"]');
                if (sel) sel.value = seed[i].productId;
            }
        });
        refreshEstimateTotals();
        document.querySelector('[data-presupuestos-root]')?.classList.add('hidden');
        const sheet = document.getElementById('estimate-sheet');
        sheet.classList.remove('hidden');
    };
    const closeSheet = () => {
        const sheet = document.getElementById('estimate-sheet');
        sheet.classList.add('hidden');
        document.querySelector('[data-presupuestos-root]')?.classList.remove('hidden');
    };
    const loadEstimateLines = async (id) => {
        const { data: lineRows } = await dbSelect({
            table: 'invoice_items',
            filters: [{ op: 'eq', column: 'invoice_id', value: id }]
        });
        return (lineRows || []).map((r) => ({
            lineKind: r.line_kind || (r.product_id ? 'product' : 'service'),
            productId: r.product_id,
            description: r.description,
            quantity: Number(r.quantity),
            unitPrice: Number(r.unit_price),
            taxRate: Number(r.tax_rate),
            discount: Number(r.discount || 0)
        }));
    };
    const saveOrIssue = async (issue) => {
        const items = collectLines();
        if (!items.length) {
            window.alert('Anade al menos una linea valida.');
            return;
        }
        if (issue && state.tenantPreferences?.confirmBeforeIssue !== false && !window.confirm('Emitir este presupuesto?')) return;
        const id = document.getElementById('estimate-sheet-id').value.trim();
        const payload = {
            tenantId: tid,
            customerId: document.getElementById('estimate-customer').value || null,
            items,
            notes: document.getElementById('estimate-notes').value || '',
            dueDate: document.getElementById('estimate-expiry-date')?.value || null,
            templateId: document.getElementById('estimate-template')?.value || docSettings.templateId,
            invoiceType: 'estimate'
        };
        if (payload.templateId && payload.templateId !== docSettings.templateId) {
            await invoiceDocumentBrandingUpsertViaDb(tid, { ...docSettings, templateId: payload.templateId });
        }
        const res = !id
            ? await invokeFn('create-invoice-with-stock', {
                  ...payload,
                  isDraft: !issue,
                  series: 'COT'
              })
            : await invokeFn('update-invoice', {
                  ...payload,
                  invoiceId: id,
                  action: issue ? 'issue' : 'save_draft',
                  series: 'COT'
              });
        const u = unwrapFnInvoke(res);
        if (u.err || !u.data?.ok) {
            window.alert(u.err || u.data?.error || 'No se pudo guardar el presupuesto.');
            return;
        }
        if (issue) closeSheet();
        else window.alert(id ? 'Borrador actualizado.' : 'Borrador guardado.');
        await renderPresupuestosModule();
    };

    document.getElementById('estimate-new-btn-top')?.addEventListener('click', () => openSheet({}));
    if (state.presupuestosUi?.openComposer) {
        state.presupuestosUi = { ...state.presupuestosUi, openComposer: false };
        openSheet({});
    }
    document.getElementById('estimate-sheet-close')?.addEventListener('click', closeSheet);
    document.getElementById('estimate-save-draft-top')?.addEventListener('click', () => {
        document.getElementById('estimate-save-draft')?.click();
    });
    document.getElementById('estimate-issue-btn-top')?.addEventListener('click', () => {
        document.getElementById('estimate-issue-btn')?.click();
    });
    document.getElementById('estimate-template-save')?.addEventListener('click', async () => {
        const templateId = document.getElementById('estimate-template')?.value || docSettings.templateId;
        if (templateId && templateId !== docSettings.templateId) {
            await invoiceDocumentBrandingUpsertViaDb(tid, { ...docSettings, templateId });
        }
        window.alert('Plantilla actualizada.');
    });
    document.getElementById('estimate-add-line')?.addEventListener('click', () => {
        const tbody = document.getElementById('estimates-lines-tbody');
        tbody.insertAdjacentHTML('beforeend', estimateShelfLineRowTemplate({}));
        syncLineRowUi(tbody.lastElementChild);
        refreshEstimateTotals();
    });
    document.getElementById('estimates-lines-tbody')?.addEventListener('change', (e) => {
        const t = e.target;
        const tr = t.closest('[data-est-line]');
        if (t.matches('[data-fld="kind"]')) syncLineRowUi(tr);
        if (t.matches('[data-fld="product"]')) {
            const opt = t.selectedOptions[0];
            const desc = tr.querySelector('[data-fld="desc"]');
            if (desc && !desc.value.trim()) desc.value = opt?.getAttribute('data-label') || '';
            const price = tr.querySelector('[data-fld="price"]');
            if (price && !Number(price.value)) price.value = String(Number(opt?.getAttribute('data-price') || 0));
            const tax = tr.querySelector('[data-fld="tax"]');
            if (tax) tax.value = String(Number(opt?.getAttribute('data-tax') || fallbackTax));
            const disc = tr.querySelector('[data-fld="disc"]');
            if (disc) disc.value = String(Number(opt?.getAttribute('data-disc') || 0));
            const itemKind = String(opt?.getAttribute('data-item-kind') || 'product').toLowerCase();
            if (itemKind === 'service') {
                const kindSel = tr.querySelector('[data-fld="kind"]');
                if (kindSel) kindSel.value = 'service';
                syncLineRowUi(tr);
            }
        }
        refreshEstimateTotals();
    });
    document.getElementById('estimates-lines-tbody')?.addEventListener('input', () => {
        refreshEstimateTotals();
    });
    document.getElementById('estimates-lines-tbody')?.addEventListener('click', (e) => {
        if (!e.target.matches('[data-remove-est-line]')) return;
        const tbody = document.getElementById('estimates-lines-tbody');
        if (tbody.querySelectorAll('[data-est-line]').length > 1) e.target.closest('[data-est-line]')?.remove();
        refreshEstimateTotals();
    });
    document.getElementById('estimate-save-draft')?.addEventListener('click', () => saveOrIssue(false));
    document.getElementById('estimate-issue-btn')?.addEventListener('click', () => saveOrIssue(true));

    document.getElementById('presupuestos-table-wrap')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-est-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-est-action');
        const est = (estimates || []).find((x) => x.id === id);
        if (!est) return;
        if (act === 'history') {
            const { data: logs } = await dbSelect({
                table: 'audit_logs',
                filters: [
                    { op: 'eq', column: 'tenant_id', value: tid },
                    { op: 'eq', column: 'target_type', value: 'invoices' },
                    { op: 'eq', column: 'target_id', value: id }
                ],
                order: { column: 'created_at', ascending: false },
                limit: 40
            });
            document.getElementById('estimate-history-body').innerHTML =
                (logs || [])
                    .map(
                        (l) =>
                            `<div class="rounded border border-outline-variant/30 p-2"><div class="font-semibold">${escapeHtml(
                                l.action || ''
                            )}</div><div class="text-on-surface-variant">${escapeHtml(toDateString(l.created_at))}</div><pre class="mt-1 whitespace-pre-wrap break-all">${escapeHtml(
                                JSON.stringify(l.details || {}, null, 0)
                            )}</pre></div>`
                    )
                    .join('') || '<p class="text-on-surface-variant">Sin registros.</p>';
            const bd = document.getElementById('estimate-history-backdrop');
            bd.classList.remove('hidden');
            bd.classList.add('flex');
        }
        if (act === 'edit' || act === 'issue') {
            openSheet({
                id,
                lines: await loadEstimateLines(id),
                customerId: est.customer_id,
                notes: est.notes || '',
                expiryDate: est.due_date || ''
            });
        }
        if (act === 'accept' || act === 'reject') {
            const status = act === 'accept' ? 'accepted' : 'rejected';
            const { error } = await dbUpdate({
                table: 'invoices',
                values: { status, updated_at: new Date().toISOString() },
                filters: [
                    { op: 'eq', column: 'tenant_id', value: tid },
                    { op: 'eq', column: 'id', value: id }
                ]
            });
            if (error) window.alert(error.message || 'No se pudo cambiar el estado.');
            await renderPresupuestosModule();
        }
        if (act === 'convert') {
            const lines = await loadEstimateLines(id);
            const res = await invokeFn('create-invoice-with-stock', {
                tenantId: tid,
                customerId: est.customer_id,
                items: lines,
                notes: `Convertida desde presupuesto ${est.series || ''}-${est.number || ''}\n${est.notes || ''}`.trim(),
                isDraft: true,
                invoiceType: 'standard'
            });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) {
                window.alert(u.err || u.data?.error || 'No se pudo convertir.');
                return;
            }
            await dbUpdate({
                table: 'invoices',
                values: { status: 'converted', updated_at: new Date().toISOString() },
                filters: [
                    { op: 'eq', column: 'tenant_id', value: tid },
                    { op: 'eq', column: 'id', value: id }
                ]
            });
            window.alert('Presupuesto convertido a factura borrador.');
            await renderPresupuestosModule();
        }
        if (act === 'dup') {
            const res = await invokeFn('duplicate-invoice', { tenantId: tid, invoiceId: id });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'Duplicar fallo.');
            await renderPresupuestosModule();
        }
        if (act === 'del') {
            if (!window.confirm('Eliminar este presupuesto?')) return;
            const res = await invokeFn('delete-invoice', { tenantId: tid, invoiceId: id });
            const u = unwrapFnInvoke(res);
            if (u.err || !u.data?.ok) window.alert(u.err || u.data?.error || 'Eliminar fallo.');
            await renderPresupuestosModule();
        }
        if (act === 'pdf' || act === 'html') {
            const { data: lineRows } = await dbSelect({
                table: 'invoice_items',
                filters: [{ op: 'eq', column: 'invoice_id', value: id }]
            });
            const html = buildInvoiceDocumentHtml({
                invoice: est,
                lines: lineRows || [],
                customer: est.customer_id ? customerById.get(est.customer_id) : null,
                tenant: tenantRow,
                branding: docSettings,
                fiscalTaxLabel: fh.taxLabel,
                isDraft: String(est.status || '').toLowerCase() === 'draft'
            });
            const fn = `presupuesto-${String(est.series || 'COT')}-${String(est.number || id)}.html`;
            if (act === 'pdf') await exportInvoiceDocumentPdf(fn.replace(/\.html?$/i, '.pdf'), html);
            else downloadInvoiceDocumentHtml(fn, html);
        }
    });
    document.getElementById('estimate-history-close')?.addEventListener('click', () => {
        const bd = document.getElementById('estimate-history-backdrop');
        bd.classList.add('hidden');
        bd.classList.remove('flex');
    });
    zyronLog('render:presupuestos:done', { estimateCount: (estimates || []).length });
};

const renderPagosModule = async () => {
    zyronLog('render:pagos:start', { tenantId: state.currentTenantId });
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader('Pagos y cobros', 'Necesitas seleccionar una empresa')}`;
        zyronLog('render:pagos:noTenant', {});
        return;
    }
    const tid = state.currentTenantId;
    const cur = state.tenantContext?.priceDisplayCurrency || state.tenantContext?.defaultCurrency || 'DOP';
    const tab = state.pagosUi?.tab || 'payments';

    const [pRes, mRes, arRes, logRes] = await Promise.all([
        fetchPaymentsListViaDb(tid),
        fetchPaymentMethodsCatalogViaDb(tid),
        fetchAccountsReceivableViaDb(tid),
        fetchPaymentReminderLogViaDb(tid)
    ]);
    const payU = unwrapFnInvoke(pRes);
    const metU = unwrapFnInvoke(mRes);
    const arU = unwrapFnInvoke(arRes);
    const logU = unwrapFnInvoke(logRes);
    const payRows = payU.err || !payU.data?.ok ? [] : payU.data.rows || [];
    const methodRows = metU.err || !metU.data?.ok ? [] : metU.data.rows || [];
    const arRows = arU.err || !arU.data?.ok ? [] : arU.data.rows || [];
    const reminderRows = logU.err || !logU.data?.ok ? [] : logU.data.rows || [];
    const fnErrBanner =
        payU.err || metU.err || arU.err || logU.err
            ? `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">Pagos / CXC: ${escapeHtml(
                  payU.err || metU.err || arU.err || logU.err || 'error'
              )}. Comprueba tablas payments, payment_methods_catalog, invoices, payment_reminder_log y SQL payments_module_advanced.</div>`
            : '';

    const tabBtn = (key, label) => {
        const on = tab === key;
        return `<button type="button" data-pagos-tab="${key}" class="rounded-md px-3 py-1.5 text-sm ${
            on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
        }">${label}</button>`;
    };

    const money = (n) => {
        const x = Number(n);
        return Number.isFinite(x) ? x.toFixed(2) : '-';
    };

    const paymentsTable = (payRows || [])
        .map(
            (r) => `<tr class="border-b border-outline-variant/20" data-payment-row="${escapeHtml(r.id)}">
            <td class="py-2 font-mono text-xs">${escapeHtml(String(r.id).slice(0, 8))}…</td>
            <td class="py-2">${escapeHtml(r.payment_method_code || r.payment_method || '')}</td>
            <td class="py-2">${money(r.amount)} ${escapeHtml(r.currency || '')}</td>
            <td class="py-2">${escapeHtml(r.status || '')}</td>
            <td class="py-2 text-xs">${escapeHtml(r.reconciliation_status || '')}</td>
            <td class="py-2 text-xs">${escapeHtml(toDateString(r.paid_at))}</td>
            <td class="py-2 text-right">
                <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-pay-alloc="${escapeHtml(
                    r.id
                )}">Aplicaciones</button>
            </td>
        </tr>`
        )
        .join('');

    const recoRows = (payRows || [])
        .map(
            (r) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2 font-mono text-xs">${escapeHtml(String(r.id).slice(0, 8))}…</td>
            <td class="py-2">${money(r.amount)}</td>
            <td class="py-2">
                <select data-reco-pay="${escapeHtml(r.id)}" data-reco-field="status" class="rounded border border-outline-variant/40 px-1 py-1 text-xs">
                    ${['unmatched', 'matched', 'disputed', 'ignored']
                        .map(
                            (s) =>
                                `<option value="${s}" ${String(r.reconciliation_status || 'unmatched') === s ? 'selected' : ''}>${s}</option>`
                        )
                        .join('')}
                </select>
            </td>
            <td class="py-2"><input type="text" data-reco-pay="${escapeHtml(r.id)}" data-reco-field="ref" class="w-full max-w-[200px] rounded border border-outline-variant/40 px-2 py-1 text-xs" value="${escapeHtml(
                r.matched_bank_reference || ''
            )}" placeholder="Ref. banco" /></td>
            <td class="py-2 text-right"><button type="button" class="rounded bg-primary px-2 py-1 text-xs text-white" data-reco-save="${escapeHtml(
                r.id
            )}">Guardar</button></td>
        </tr>`
        )
        .join('');

    const methodOpts = (methodRows || [])
        .filter((m) => m.is_active !== false)
        .map((m) => `<option value="${escapeHtml(m.code)}">${escapeHtml(m.label || m.code)}</option>`)
        .join('');

    const invoiceOpts = (arRows || [])
        .map((inv) => {
            const doc = `${inv.series || ""}-${inv.number || ""}`.replace(/^-|-$/g, '') || String(inv.id).slice(0, 8);
            const bal = Number(inv.balance_due || 0);
            return `<option value="${escapeHtml(inv.id)}" data-balance="${escapeHtml(bal)}" data-currency="${escapeHtml(inv.currency || cur || 'DOP')}" data-customer-id="${escapeHtml(inv.customer_id || '')}">${escapeHtml(doc)} ? saldo ${money(bal)} ${escapeHtml(inv.currency || cur || 'DOP')}</option>`;
        })
        .join('');

    const arTable = (arRows || [])
        .map(
            (inv) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2 font-mono text-xs">${escapeHtml(String(inv.id).slice(0, 8))}…</td>
            <td class="py-2">${escapeHtml(`${inv.series || ''}-${inv.number || ''}`)}</td>
            <td class="py-2">${money(inv.total)}</td>
            <td class="py-2">${money(inv.amount_paid)}</td>
            <td class="py-2 font-medium">${money(inv.balance_due)}</td>
            <td class="py-2">${escapeHtml(inv.status || '')}</td>
            <td class="py-2 text-xs">${escapeHtml(inv.due_date ? toDateString(inv.due_date) : '—')}</td>
            <td class="py-2">
                <input type="date" class="rounded border border-outline-variant/40 px-1 py-1 text-xs" data-due-inv="${escapeHtml(inv.id)}" value="${
                inv.due_date ? String(inv.due_date).slice(0, 10) : ''
            }" />
                <button type="button" class="ml-1 rounded border border-primary/50 px-2 py-1 text-xs text-primary" data-due-save="${escapeHtml(
                    inv.id
                )}">Vencimiento</button>
            </td>
        </tr>`
        )
        .join('');

    const methodsTable = (methodRows || [])
        .map(
            (m) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2">${escapeHtml(m.code)}</td>
            <td class="py-2">${escapeHtml(m.label || '')}</td>
            <td class="py-2">${m.sort_order}</td>
            <td class="py-2">${m.is_active ? 'Si' : 'No'}</td>
        </tr>`
        )
        .join('');

    const logTable = (reminderRows || [])
        .map(
            (row) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2 text-xs">${escapeHtml(toDateString(row.created_at))}</td>
            <td class="py-2 text-xs font-mono">${escapeHtml(String(row.invoice_id || '').slice(0, 8))}…</td>
            <td class="py-2">${escapeHtml(row.kind || '')}</td>
            <td class="py-2">${escapeHtml(row.channel || '')}</td>
        </tr>`
        )
        .join('');

    const paymentsPanel = `
        <div class="overflow-x-auto">
            <table class="w-full min-w-[640px] text-left text-sm">
                <thead>
                    <tr class="border-b border-outline-variant/30">
                        <th class="py-2">Id</th>
                        <th class="py-2">Metodo</th>
                        <th class="py-2">Monto</th>
                        <th class="py-2">Estado</th>
                        <th class="py-2">Conciliacion</th>
                        <th class="py-2">Fecha</th>
                        <th class="py-2 text-right"></th>
                    </tr>
                </thead>
                <tbody>${
                    paymentsTable ||
                    `<tr><td colspan="7" class="py-6 text-center text-on-surface-variant">Sin pagos registrados</td></tr>`
                }</tbody>
            </table>
        </div>
        <pre id="pagos-alloc-pre" class="mt-3 hidden max-h-48 overflow-auto rounded-md bg-surface-container-high p-3 font-mono text-xs"></pre>`;

    const registerPanel = `
        <p class="mb-3 text-xs text-on-surface-variant">Como InvoiceShelf: elegis la factura abierta, el sistema toma su saldo y registra la aplicacion del pago contra esa factura. Nada de JSON a mano: eso era deuda tecnica, no producto.</p>
        <div class="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="block text-sm sm:col-span-2">
                <span class="font-medium">Factura</span>
                <select id="pay-reg-invoice" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                    <option value="">Pago sin aplicar / anticipo</option>
                    ${invoiceOpts}
                </select>
            </label>
            <label class="block text-sm">
                <span class="font-medium">Monto</span>
                <input id="pay-reg-amount" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" placeholder="0.00" />
            </label>
            <label class="block text-sm">
                <span class="font-medium">Metodo</span>
                <select id="pay-reg-method" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                    ${methodOpts || '<option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option>'}
                </select>
            </label>
            <label class="block text-sm">
                <span class="font-medium">Moneda</span>
                <input id="pay-reg-currency" maxlength="3" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm uppercase" value="${escapeHtml(cur || 'DOP')}" />
            </label>
            <label class="block text-sm">
                <span class="font-medium">Estado pago</span>
                <select id="pay-reg-status" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                    <option value="completed">Completado</option>
                    <option value="pending">Pendiente</option>
                </select>
            </label>
            <label class="block text-sm sm:col-span-2">
                <span class="font-medium">Referencia / notas</span>
                <div class="mt-1 flex flex-col gap-2 sm:flex-row">
                    <input id="pay-reg-reference" class="w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" placeholder="Referencia" />
                    <input id="pay-reg-notes" class="w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" placeholder="Notas" />
                </div>
            </label>
            <label class="block text-sm">
                <span class="font-medium">Pasarela (opcional)</span>
                <input id="pay-reg-gw-prov" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" placeholder="stripe" />
            </label>
            <label class="block text-sm">
                <span class="font-medium">Id transaccion pasarela</span>
                <input id="pay-reg-gw-tx" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" placeholder="pi_..." />
            </label>
        </div>
        <button type="button" id="pay-reg-submit" class="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-white">Registrar pago</button>`;

    const cxcPanel = `
        <p class="mb-3 text-xs text-on-surface-variant">Facturas con saldo abierto. Asigna vencimiento para estados <strong>overdue</strong> y recordatorios.</p>
        <div class="overflow-x-auto">
            <table class="w-full min-w-[800px] text-left text-sm">
                <thead>
                    <tr class="border-b border-outline-variant/30">
                        <th class="py-2">Id</th>
                        <th class="py-2">Documento</th>
                        <th class="py-2">Total</th>
                        <th class="py-2">Cobrado</th>
                        <th class="py-2">Saldo</th>
                        <th class="py-2">Estado</th>
                        <th class="py-2">Vence</th>
                        <th class="py-2">Acciones</th>
                    </tr>
                </thead>
                <tbody>${arTable || `<tr><td colspan="8" class="py-6 text-center text-on-surface-variant">Sin cuentas por cobrar</td></tr>`}</tbody>
            </table>
        </div>`;

    const toolsPanel = `
        <div class="mb-6 space-y-3 rounded-lg border border-outline-variant/30 p-4">
            <h4 class="text-sm font-semibold text-primary">Catalogo de metodos</h4>
            <button type="button" id="pay-seed-methods" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Inicializar metodos (efectivo, tarjeta, transferencia…)</button>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr class="border-b border-outline-variant/30"><th class="py-2">Codigo</th><th class="py-2">Etiqueta</th><th class="py-2">Orden</th><th class="py-2">Activo</th></tr></thead>
                    <tbody>${methodsTable || `<tr><td colspan="4" class="py-3 text-on-surface-variant">Sin filas (usa Inicializar)</td></tr>`}</tbody>
                </table>
            </div>
        </div>
        <div class="mb-6 space-y-3 rounded-lg border border-outline-variant/30 p-4">
            <h4 class="text-sm font-semibold text-primary">Conciliacion</h4>
            <div class="overflow-x-auto">
                <table class="w-full min-w-[560px] text-left text-sm">
                    <thead><tr class="border-b border-outline-variant/30"><th class="py-2">Pago</th><th class="py-2">Monto</th><th class="py-2">Estado</th><th class="py-2">Ref. banco</th><th class="py-2"></th></tr></thead>
                    <tbody>${recoRows || `<tr><td colspan="5" class="py-3 text-on-surface-variant">Sin pagos</td></tr>`}</tbody>
                </table>
            </div>
        </div>
        <div class="mb-6 space-y-3 rounded-lg border border-outline-variant/30 p-4">
            <h4 class="text-sm font-semibold text-primary">Evento pasarela (prueba)</h4>
            <p class="text-xs text-on-surface-variant">Registra un webhook simulado; si coincide <code class="rounded bg-surface-container px-1">gateway_transaction_id</code> en un pago, enlaza el evento.</p>
            <div class="grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                <input id="gw-provider" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" value="stripe" />
                <input id="gw-ext-id" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="external id" />
                <textarea id="gw-payload" class="sm:col-span-2 rounded-md border border-outline-variant/40 px-2 py-2 font-mono text-xs" rows="3">{}</textarea>
            </div>
            <button type="button" id="gw-ingest-btn" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Ingerir evento</button>
        </div>
        <div class="space-y-3 rounded-lg border border-outline-variant/30 p-4">
            <h4 class="text-sm font-semibold text-primary">Recordatorios (manual)</h4>
            <div class="flex flex-wrap items-end gap-2">
                <label class="text-sm">Dias horizonte <input id="pay-rem-horizon" type="number" min="1" max="30" value="7" class="ml-1 w-16 rounded border border-outline-variant/40 px-2 py-1 text-sm" /></label>
                <button type="button" id="pay-rem-run" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Generar log</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr class="border-b border-outline-variant/30"><th class="py-2">Fecha</th><th class="py-2">Factura</th><th class="py-2">Tipo</th><th class="py-2">Canal</th></tr></thead>
                    <tbody>${logTable || `<tr><td colspan="4" class="py-3 text-on-surface-variant">Sin entradas</td></tr>`}</tbody>
                </table>
            </div>
        </div>`;

    const mainBody = tab === 'register' ? registerPanel : tab === 'cxc' ? cxcPanel : tab === 'tools' ? toolsPanel : paymentsPanel;

    dashboardContent.innerHTML = `
        ${renderModuleHeader(
            'Pagos y cobros',
            'Pagos y cobros: lecturas y mutaciones contra la base (InsForge) desde el cliente; sin edge manage-payments.'
        )}
        ${fnErrBanner}
        <div class="rounded-xl bg-surface-container-low p-1" data-pagos-root>
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <div class="mb-4 flex flex-wrap gap-2">${tabBtn('payments', 'Pagos')}${tabBtn('register', 'Registrar')}${tabBtn(
        'cxc',
        'Cuentas por cobrar'
    )}${tabBtn('tools', 'Metodos / conciliacion / pasarela')}</div>
                ${mainBody}
            </div>
        </div>`;

    dashboardContent.querySelectorAll('[data-pagos-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.pagosUi = { tab: btn.getAttribute('data-pagos-tab') };
            void renderPagosModule();
        });
    });

    const showAlloc = async (paymentId) => {
        const pre = document.getElementById('pagos-alloc-pre');
        if (!pre || !paymentId) return;
        pre.classList.remove('hidden');
        pre.textContent = 'Cargando…';
        const res = await fetchPaymentAllocationsViaDb(tid, paymentId);
        const u = unwrapFnInvoke(res);
        if (u.err || !u.data?.ok) pre.textContent = u.err || u.data?.error || 'Error';
        else pre.textContent = JSON.stringify(u.data.rows || [], null, 2);
    };

    dashboardContent.querySelectorAll('[data-pay-alloc]').forEach((btn) => {
        btn.addEventListener('click', () => showAlloc(btn.getAttribute('data-pay-alloc')));
    });

    document.getElementById('pay-reg-invoice')?.addEventListener('change', (ev) => {
        const opt = ev.target?.selectedOptions?.[0];
        const bal = Number(opt?.getAttribute('data-balance') || 0);
        const curOpt = opt?.getAttribute('data-currency') || cur || 'DOP';
        if (bal > 0) document.getElementById('pay-reg-amount').value = String(bal.toFixed(2));
        document.getElementById('pay-reg-currency').value = curOpt;
    });

    document.getElementById('pay-reg-submit')?.addEventListener('click', async () => {
        const amount = Number(document.getElementById('pay-reg-amount')?.value || 0);
        if (!(amount > 0)) {
            window.alert('Indica un monto mayor a cero.');
            return;
        }
        const invSel = document.getElementById('pay-reg-invoice');
        const selectedInvoiceId = invSel?.value || null;
        const selectedOpt = invSel?.selectedOptions?.[0];
        const allocations = selectedInvoiceId ? [{ invoiceId: selectedInvoiceId, amount }] : [];
        const res = await paymentsCreatePaymentViaDb(tid, {
            amount,
            customerId: selectedOpt?.getAttribute('data-customer-id') || null,
            paymentMethodCode: document.getElementById('pay-reg-method')?.value || 'cash',
            currency: document.getElementById('pay-reg-currency')?.value || cur || 'DOP',
            status: document.getElementById('pay-reg-status')?.value || 'completed',
            reference: document.getElementById('pay-reg-reference')?.value?.trim() || null,
            notes: document.getElementById('pay-reg-notes')?.value?.trim() || null,
            gatewayProvider: document.getElementById('pay-reg-gw-prov')?.value?.trim() || null,
            gatewayTransactionId: document.getElementById('pay-reg-gw-tx')?.value?.trim() || null,
            allocations
        });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else {
            window.alert('Pago registrado.');
            await renderPagosModule();
        }
    });

    dashboardContent.querySelectorAll('[data-due-save]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const invId = btn.getAttribute('data-due-save');
            const input = btn.closest('tr')?.querySelector('[data-due-inv]');
            const v = input?.value?.trim();
            const dueDate = v ? new Date(`${v}T12:00:00`).toISOString() : null;
            const res = await paymentsSetInvoiceDueDateViaDb(tid, invId, dueDate);
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else await renderPagosModule();
        });
    });

    document.getElementById('pay-seed-methods')?.addEventListener('click', async () => {
        const res = await paymentsSeedMethodsViaDb(tid);
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else await renderPagosModule();
    });

    dashboardContent.querySelectorAll('[data-reco-save]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const pid = btn.getAttribute('data-reco-save');
            const row = btn.closest('tr');
            const st = row?.querySelector('[data-reco-field="status"]')?.value;
            const ref = row?.querySelector('[data-reco-field="ref"]')?.value?.trim() || null;
            const res = await paymentsSetReconciliationViaDb(tid, pid, st, ref);
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else await renderPagosModule();
        });
    });

    document.getElementById('gw-ingest-btn')?.addEventListener('click', async () => {
        let payload = {};
        const raw = document.getElementById('gw-payload')?.value?.trim();
        if (raw) {
            try {
                payload = JSON.parse(raw);
            } catch (_) {
                window.alert('Payload JSON invalido.');
                return;
            }
        }
        const res = await paymentsIngestGatewayEventViaDb(
            tid,
            document.getElementById('gw-provider')?.value?.trim() || 'stripe',
            document.getElementById('gw-ext-id')?.value?.trim() || null,
            payload
        );
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else window.alert(`Evento OK. Pago enlazado: ${u.data.matchedPaymentId || 'ninguno'}`);
    });

    document.getElementById('pay-rem-run')?.addEventListener('click', async () => {
        const horizonDays = Number(document.getElementById('pay-rem-horizon')?.value || 7);
        const res = await paymentsRunRemindersViaDb(tid, horizonDays);
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else {
            window.alert(`Registros creados: ${u.data.queued ?? 0} (candidatos ${u.data.candidates ?? 0})`);
            await renderPagosModule();
        }
    });

    zyronLog('render:pagos:done', { tab, payCount: payRows.length, arCount: arRows.length });
};

const renderClientesModule = async () => {
    zyronLog('render:clientes:start', { tenantId: state.currentTenantId });
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader('Clientes', 'Necesitas seleccionar una empresa')}`;
        return;
    }
    const tid = state.currentTenantId;
    const ui = state.clientesUi || {};
    const tab = ui.tab || 'list';
    const q = ui.q ?? '';
    const segmentId = ui.segmentId ?? '';
    const includeInactive = Boolean(ui.includeInactive);
    const sheet = ui.sheet || null;
    const editId = ui.editId || null;
    const historyCustomerId = ui.historyCustomerId || null;

    const [listRes, segRes] = await Promise.all([
        customersManageViaDb({
            tenantId: tid,
            action: 'list_customers',
            q: q || undefined,
            segmentId: segmentId || undefined,
            includeInactive
        }),
        fetchCustomerSegmentsListViaDb(tid)
    ]);
    const listU = unwrapFnInvoke(listRes);
    const segU = unwrapFnInvoke(segRes);
    const customers = listU.err || !listU.data?.ok ? [] : listU.data.rows || [];
    const segments = segU.err || !segU.data?.ok ? [] : segU.data.rows || [];
    const fnErr =
        listU.err || segU.err
            ? `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">Clientes: ${escapeHtml(
                  listU.err || segU.err || 'error'
              )}. Ejecuta SQL customers_module_advanced y revisa permisos RLS.</div>`
            : '';

    let editCustomer = null;
    let editSegmentIds = [];
    if (sheet === 'form' && editId) {
        const gRes = await customersManageViaDb({ tenantId: tid, action: 'get_customer', customerId: editId });
        const gU = unwrapFnInvoke(gRes);
        if (!gU.err && gU.data?.ok) {
            editCustomer = gU.data.customer;
            editSegmentIds = gU.data.segmentIds || [];
        }
    }

    let histInvoices = [];
    let histItems = {};
    let histName = '';
    if (sheet === 'history' && historyCustomerId) {
        const hRes = await customersManageViaDb({
            tenantId: tid,
            action: 'purchase_history',
            customerId: historyCustomerId,
            limit: 50
        });
        const hU = unwrapFnInvoke(hRes);
        if (!hU.err && hU.data?.ok) {
            histInvoices = hU.data.invoices || [];
            histItems = hU.data.itemsByInvoice || {};
        }
        histName = customers.find((c) => c.id === historyCustomerId)?.name || editCustomer?.name || '';
    }

    const money = (n) => {
        const x = Number(n);
        return Number.isFinite(x) ? x.toFixed(2) : '-';
    };

    const segChips = (segs) =>
        (segs || [])
            .map(
                (s) =>
                    `<span class="mr-1 inline-block rounded-full px-2 py-0.5 text-xs text-white" style="background:${escapeHtml(
                        s.color || '#5c5c5c'
                    )}">${escapeHtml(s.label || s.code)}</span>`
            )
            .join('') || '—';

    const segmentFilterOpts = `<option value="">Todos los segmentos</option>${segments
        .map((s) => `<option value="${escapeHtml(s.id)}" ${segmentId === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`)
        .join('')}`;

    const custRows = (customers || [])
        .map(
            (c) => `<tr class="border-b border-outline-variant/20 ${c.is_active === false ? 'opacity-60' : ''}">
            <td class="py-2 font-medium">${escapeHtml(c.name || '')}</td>
            <td class="py-2 text-xs">${escapeHtml(c.email || '—')}</td>
            <td class="py-2 text-xs">${escapeHtml(c.phone || '—')}</td>
            <td class="py-2 text-right">${money(c.open_balance)}</td>
            <td class="py-2 text-right">${c.credit_available == null ? '—' : money(c.credit_available)}</td>
            <td class="py-2 text-right">${c.credit_limit == null || c.credit_limit === '' ? '—' : money(c.credit_limit)}</td>
            <td class="py-2">${segChips(c.segments)}</td>
            <td class="py-2 text-right whitespace-nowrap">
                <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-cli-history="${escapeHtml(
                    c.id
                )}">Historial</button>
                <button type="button" class="rounded border border-primary/40 px-2 py-1 text-xs text-primary" data-cli-edit="${escapeHtml(
                    c.id
                )}">Editar</button>
                <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-cli-toggle="${escapeHtml(
                    c.id
                )}" data-active="${c.is_active === false ? '0' : '1'}">${c.is_active === false ? 'Activar' : 'Desactivar'}</button>
            </td>
        </tr>`
        )
        .join('');

    const segRows = (segments || [])
        .map(
            (s) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2">${escapeHtml(s.code)}</td>
            <td class="py-2">${escapeHtml(s.label)}</td>
            <td class="py-2 w-8 rounded border" style="background:${escapeHtml(s.color || '#ccc')}"></td>
            <td class="py-2 text-right"><button type="button" class="text-xs text-error" data-seg-del="${escapeHtml(s.id)}">Eliminar</button></td>
        </tr>`
        )
        .join('');

    const tabBtn = (key, label) => {
        const on = tab === key;
        return `<button type="button" data-cli-tab="${key}" class="rounded-md px-3 py-1.5 text-sm ${
            on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
        }">${label}</button>`;
    };

    const listPanel = `
        <div class="mb-4 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 class="text-sm font-bold text-primary">Gestion de clientes</h3>
                    <p class="mt-1 text-xs text-on-surface-variant">Registra un cliente nuevo aqui y luego podras facturarle, editarlo o revisar su historial.</p>
                </div>
                <button type="button" id="cli-new-btn-top" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Agregar cliente</button>
            </div>
        </div>
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <input id="cli-filter-q" type="search" class="max-w-md flex-1 rounded-md border border-outline-variant/40 px-3 py-2 text-sm" placeholder="Buscar nombre, correo, telefono, RNC…" value="${escapeHtml(
                q
            )}" />
            <select id="cli-filter-seg" class="rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${segmentFilterOpts}</select>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="cli-filter-inactive" ${includeInactive ? 'checked' : ''} /> Incluir inactivos</label>
            <button type="button" id="cli-filter-apply" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Filtrar</button>
            <button type="button" id="cli-export-btn" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Exportar CSV</button>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-[900px] text-left text-sm">
                <thead>
                    <tr class="border-b border-outline-variant/30">
                        <th class="py-2">Cliente</th>
                        <th class="py-2">Correo</th>
                        <th class="py-2">Telefono</th>
                        <th class="py-2 text-right">Saldo abierto</th>
                        <th class="py-2 text-right">Credito disponible</th>
                        <th class="py-2 text-right">Limite credito</th>
                        <th class="py-2">Segmentos</th>
                        <th class="py-2 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody>${
                    custRows ||
                    `<tr><td colspan="8" class="py-8 text-center text-on-surface-variant">Sin clientes o sin coincidencias</td></tr>`
                }</tbody>
            </table>
        </div>`;

    const segmentsPanel = `
        <p class="mb-3 text-xs text-on-surface-variant">Segmentos para campanas y filtros. Asigna varios por cliente al editar.</p>
        <button type="button" id="cli-seg-seed" class="mb-4 rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Inicializar segmentos sugeridos</button>
        <div class="mb-4 grid max-w-xl grid-cols-2 gap-2">
            <input id="cli-seg-code" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="codigo (ej. retail)" />
            <input id="cli-seg-label" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Etiqueta" />
            <input id="cli-seg-color" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="#hex color" />
            <button type="button" id="cli-seg-add" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Agregar segmento</button>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead><tr class="border-b border-outline-variant/30"><th class="py-2">Codigo</th><th class="py-2">Etiqueta</th><th class="py-2">Color</th><th class="py-2"></th></tr></thead>
                <tbody>${segRows || `<tr><td colspan="4" class="py-4 text-on-surface-variant">Sin segmentos</td></tr>`}</tbody>
            </table>
        </div>`;

    const formTitle = editId ? 'Editar cliente' : 'Nuevo cliente';
    const fc = editCustomer || {};
    const segChecks = (segments || [])
        .map((s) => {
            const on = editSegmentIds.includes(s.id);
            return `<label class="flex items-center gap-2 text-sm"><input type="checkbox" class="h-4 w-4" data-cli-seg-cb value="${escapeHtml(
                s.id
            )}" ${on ? 'checked' : ''} />${escapeHtml(s.label)}</label>`;
        })
        .join('');

    const formPanel = `
        <form id="cli-form" class="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="sm:col-span-2 block text-sm font-medium">Nombre *
                <input name="name" required class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                    fc.name || ''
                )}" />
            </label>
            <label class="block text-sm">Correo<input name="email" type="email" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.email || ''
            )}" /></label>
            <label class="block text-sm">Telefono<input name="phone" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.phone || ''
            )}" /></label>
            <label class="block text-sm">RNC / ID fiscal<input name="tax_id" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.tax_id || ''
            )}" /></label>
            <label class="block text-sm">Limite de credito<input name="credit_limit" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.credit_limit != null && fc.credit_limit !== '' ? String(fc.credit_limit) : ''
            )}" placeholder="Vacío = sin tope en UI" /></label>
            <label class="sm:col-span-2 block text-sm">Direccion<textarea name="address" rows="2" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${escapeHtml(
                fc.address || ''
            )}</textarea></label>
            <label class="block text-sm">Ciudad<input name="city" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.city || ''
            )}" /></label>
            <label class="block text-sm">Pais<input name="country" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.country || ''
            )}" /></label>
            <label class="sm:col-span-2 block text-sm">Notas internas<textarea name="internal_notes" rows="2" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${escapeHtml(
                fc.internal_notes || ''
            )}</textarea></label>
            <div class="sm:col-span-2 rounded-lg border border-outline-variant/30 p-3">
                <p class="mb-2 text-xs font-medium text-on-surface-variant">Segmentacion</p>
                <div class="flex flex-wrap gap-2">${segChecks || '<span class="text-xs text-on-surface-variant">Crea segmentos en la pestaña Segmentos.</span>'}</div>
            </div>
            <div class="sm:col-span-2 flex gap-2">
                <button type="submit" class="rounded-md bg-primary px-4 py-2 text-sm text-white">${editId ? 'Guardar' : 'Registrar'}</button>
                <button type="button" id="cli-form-cancel" class="rounded-md border border-outline-variant/50 px-4 py-2 text-sm">Cerrar</button>
            </div>
        </form>`;

    const histRows = (histInvoices || [])
        .map((inv) => {
            const lines = histItems[inv.id] || histItems[String(inv.id)] || [];
            const lineTxt = lines
                .slice(0, 6)
                .map((l) => `${escapeHtml(l.description || '')} x${l.quantity} (${money(l.line_total)})`)
                .join('; ');
            const more = lines.length > 6 ? ` (+${lines.length - 6})` : '';
            return `<tr class="border-b border-outline-variant/20 align-top">
                <td class="py-2 text-xs">${escapeHtml(toDateString(inv.created_at))}</td>
                <td class="py-2">${escapeHtml(`${inv.series || ''}-${inv.number || ''}`)}</td>
                <td class="py-2">${escapeHtml(inv.invoice_type || '')}</td>
                <td class="py-2">${escapeHtml(inv.status || '')}</td>
                <td class="py-2 text-right">${money(inv.total)}</td>
                <td class="py-2 text-xs max-w-md">${lineTxt}${more}</td>
            </tr>`;
        })
        .join('');

    const historyPanel = `
        <p class="mb-3 text-sm text-on-surface-variant">Compras y documentos: <strong>${escapeHtml(histName || 'Cliente')}</strong></p>
        <div class="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table class="w-full min-w-[720px] text-left text-sm">
                <thead>
                    <tr class="border-b border-outline-variant/30">
                        <th class="py-2">Fecha</th><th class="py-2">Documento</th><th class="py-2">Tipo</th><th class="py-2">Estado</th><th class="py-2 text-right">Total</th><th class="py-2">Lineas (resumen)</th>
                    </tr>
                </thead>
                <tbody>${
                    histRows ||
                    `<tr><td colspan="6" class="py-6 text-center text-on-surface-variant">Sin facturas vinculadas</td></tr>`
                }</tbody>
            </table>
        </div>`;

    const mainBody = tab === 'segments' ? segmentsPanel : listPanel;

    const sheetHtml =
        sheet === 'form'
            ? `<div id="cli-sheet" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-lg">
                    <h3 class="mb-4 text-lg font-semibold">${formTitle}</h3>
                    ${editId && !editCustomer ? '<p class="text-sm text-error">No se pudo cargar el cliente.</p>' : formPanel}
                </div></div>`
            : sheet === 'history'
              ? `<div id="cli-sheet" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div class="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-lg">
                    <div class="mb-4 flex justify-between gap-2">
                        <h3 class="text-lg font-semibold">Historial de compras</h3>
                        <button type="button" id="cli-sheet-close" class="rounded-md border px-3 py-1 text-sm">Cerrar</button>
                    </div>
                    ${historyPanel}
                </div></div>`
              : '';

    dashboardContent.innerHTML = `
        ${renderModuleHeader(
            'Clientes',
            'Registro, edicion, historial de facturas, segmentos, credito disponible y exportacion CSV.'
        )}
        ${fnErr}
        <div class="rounded-xl bg-surface-container-low p-1" data-clientes-root>
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <div class="mb-4 flex flex-wrap gap-2">${tabBtn('list', 'Clientes')}${tabBtn('segments', 'Segmentos')}</div>
                ${mainBody}
            </div>
        </div>
        ${sheetHtml}`;

    const closeSheet = () => {
        state.clientesUi = { ...state.clientesUi, sheet: null, editId: null, historyCustomerId: null };
        void renderClientesModule();
    };

    dashboardContent.querySelectorAll('[data-cli-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.clientesUi = { ...state.clientesUi, tab: btn.getAttribute('data-cli-tab') };
            void renderClientesModule();
        });
    });

    document.getElementById('cli-filter-apply')?.addEventListener('click', () => {
        state.clientesUi = {
            ...state.clientesUi,
            q: document.getElementById('cli-filter-q')?.value?.trim() || '',
            segmentId: document.getElementById('cli-filter-seg')?.value?.trim() || '',
            includeInactive: Boolean(document.getElementById('cli-filter-inactive')?.checked)
        };
        void renderClientesModule();
    });

    document.getElementById('cli-new-btn-top')?.addEventListener('click', () => {
        state.clientesUi = { ...state.clientesUi, sheet: 'form', editId: null };
        void renderClientesModule();
    });

    dashboardContent.querySelectorAll('[data-cli-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.clientesUi = { ...state.clientesUi, sheet: 'form', editId: btn.getAttribute('data-cli-edit') };
            void renderClientesModule();
        });
    });

    dashboardContent.querySelectorAll('[data-cli-history]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.clientesUi = {
                ...state.clientesUi,
                sheet: 'history',
                historyCustomerId: btn.getAttribute('data-cli-history')
            };
            void renderClientesModule();
        });
    });

    dashboardContent.querySelectorAll('[data-cli-toggle]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-cli-toggle');
            const active = btn.getAttribute('data-active') === '1';
            const res = await customersManageViaDb({
                tenantId: tid,
                action: 'set_customer_active',
                customerId: id,
                isActive: !active
            });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else await renderClientesModule();
        });
    });

    document.getElementById('cli-export-btn')?.addEventListener('click', async () => {
        const res = await customersManageViaDb({ tenantId: tid, action: 'export_customers', format: 'csv' });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error || !u.data?.csv) {
            window.alert(u.err || u.data?.error || 'Export fallo');
            return;
        }
        const blob = new Blob([u.data.csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = u.data.filename || 'clientes.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    });

    document.getElementById('cli-seg-seed')?.addEventListener('click', async () => {
        const res = await customersManageViaDb({ tenantId: tid, action: 'seed_segments' });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else await renderClientesModule();
    });

    document.getElementById('cli-seg-add')?.addEventListener('click', async () => {
        const code = document.getElementById('cli-seg-code')?.value?.trim();
        const label = document.getElementById('cli-seg-label')?.value?.trim();
        const color = document.getElementById('cli-seg-color')?.value?.trim() || null;
        const res = await customersManageViaDb({ tenantId: tid, action: 'upsert_segment', code, label, color });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else await renderClientesModule();
    });

    dashboardContent.querySelectorAll('[data-seg-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!window.confirm('Eliminar segmento?')) return;
            const res = await customersManageViaDb({
                tenantId: tid,
                action: 'delete_segment',
                segmentId: btn.getAttribute('data-seg-del')
            });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else await renderClientesModule();
        });
    });

    document.getElementById('cli-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const formEl = ev.target;
        const fd = new FormData(formEl);
        const segmentIds = Array.from(formEl.querySelectorAll('[data-cli-seg-cb]:checked')).map((x) => x.value);
        const payload = {
            tenantId: tid,
            name: fd.get('name'),
            email: fd.get('email') || null,
            phone: fd.get('phone') || null,
            tax_id: fd.get('tax_id') || null,
            address: fd.get('address') || null,
            city: fd.get('city') || null,
            country: fd.get('country') || null,
            internal_notes: fd.get('internal_notes') || null,
            credit_limit: fd.get('credit_limit') === '' ? null : fd.get('credit_limit'),
            segmentIds
        };
        let res;
        if (editId) {
            res = await customersManageViaDb({ ...payload, action: 'update_customer', customerId: editId });
        } else {
            res = await customersManageViaDb({ ...payload, action: 'create_customer' });
        }
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else {
            closeSheet();
        }
    });

    document.getElementById('cli-form-cancel')?.addEventListener('click', closeSheet);
    document.getElementById('cli-sheet-close')?.addEventListener('click', closeSheet);
    document.getElementById('cli-sheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'cli-sheet') closeSheet();
    });

    zyronLog('render:clientes:done', { tab, count: customers.length });
};

const renderInventarioModule = async () => {
    zyronLog('render:inventario:start', { tenantId: state.currentTenantId });
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader('Inventario', 'Necesitas seleccionar una empresa')}`;
        return;
    }
    const tid = state.currentTenantId;
    const ui = state.inventarioUi || {};
    const tab = ui.tab || 'list';
    const q = ui.q ?? '';
    const categoryId = ui.categoryId ?? '';
    const itemKind = ui.itemKind ?? '';
    const includeInactive = Boolean(ui.includeInactive);
    const sheet = ui.sheet || null;
    const editId = ui.editId || null;
    const section = ui.section || 'catalog';
    const invWarehouseId = ui.invWarehouseId || '';
    const kardexWarehouseId = ui.kardexWarehouseId || '';
    const kardexProductId = ui.kardexProductId || '';

    if (section !== 'catalog') {
        const secBtn = (key, label) => {
            const on = section === key;
            return `<button type="button" data-inv-section="${key}" class="rounded-md px-3 py-1.5 text-sm ${
                on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
            }">${label}</button>`;
        };
        const bootRes = await inventoryBootstrapViaDb(tid);
        const bootU = unwrapFnInvoke(bootRes);
        let invErr = '';
        if (bootU.err) invErr = `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">${escapeHtml(bootU.err)}</div>`;
        else if (bootU.data && bootU.data.ok === false && bootU.data.error) {
            invErr = `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">${escapeHtml(
                bootU.data.error
            )}</div>`;
        }
        const whRes = await inventoryListWarehousesViaDb();
        const whU = unwrapFnInvoke(whRes);
        const warehouses = !whU.err && whU.data?.ok ? whU.data.rows || [] : [];
        if (whU.err || whU.data?.err) {
            invErr += `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">Inventario: ${escapeHtml(
                whU.err || whU.data?.err || 'error'
            )}. Ejecuta inventory_module_advanced.sql en InsForge y revisa permisos RLS.</div>`;
        }
        const defWh = warehouses.find((w) => w.is_default) || warehouses[0];
        const stockWhId = invWarehouseId || defWh?.id || '';
        const alertWhId = invWarehouseId ? invWarehouseId : null;

        let bodyHtml = '';
        if (section === 'warehouses') {
            const rowsWh = (warehouses || [])
                .map(
                    (w) => `<tr class="border-b border-outline-variant/20">
                <td class="py-2 font-mono text-xs">${escapeHtml(w.code || '')}</td>
                <td class="py-2">${escapeHtml(w.label || '')}</td>
                <td class="py-2 text-center text-xs">${w.is_default ? 'Si' : '—'}</td>
                <td class="py-2 text-center text-xs">${w.is_active === false ? 'No' : 'Si'}</td>
                <td class="py-2 text-right">
                    <button type="button" class="text-xs text-error" data-inv-wh-del="${escapeHtml(w.id)}">Eliminar</button>
                </td>
            </tr>`
                )
                .join('');
            bodyHtml = `
                <p class="mb-3 text-sm text-on-surface-variant">Crea bodegas; la predeterminada recibe salidas de factura y sincronia con el catalogo.</p>
                <div class="mb-4 grid max-w-xl grid-cols-2 gap-2">
                    <input id="inv-wh-code" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="codigo (ej. sur)" />
                    <input id="inv-wh-label" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Nombre visible" />
                    <label class="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" id="inv-wh-default" /> Marcar como almacen predeterminado</label>
                    <button type="button" id="inv-wh-add" class="col-span-2 rounded-md bg-primary px-3 py-2 text-sm text-white">Guardar almacen</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead><tr class="border-b border-outline-variant/30"><th class="py-2">Codigo</th><th class="py-2">Nombre</th><th class="py-2">Predet.</th><th class="py-2">Activo</th><th></th></tr></thead>
                        <tbody>${rowsWh || `<tr><td colspan="5" class="py-6 text-on-surface-variant">Sin almacenes</td></tr>`}</tbody>
                    </table>
                </div>`;
        } else if (section === 'stock') {
            let stU = { err: null, data: { ok: true, rows: [] } };
            if (stockWhId) {
                const stRes = await inventoryListStockByWarehouseViaDb(tid, stockWhId);
                stU = unwrapFnInvoke(stRes);
            }
            const stRows = !stU.err && stU.data?.ok ? stU.data.rows || [] : [];
            if (stU.err || stU.data?.err) {
                invErr += `<div class="text-xs text-error">${escapeHtml(stU.err || stU.data?.err || '')}</div>`;
            }
            const whOpts = (warehouses || [])
                .map((w) => `<option value="${escapeHtml(w.id)}" ${stockWhId === w.id ? 'selected' : ''}>${escapeHtml(w.label || w.code)}</option>`)
                .join('');
            const stTable = (stRows || [])
                .map(
                    (r) => `<tr class="border-b border-outline-variant/20">
                <td class="py-2 font-mono text-xs">${escapeHtml(r.sku || '')}</td>
                <td class="py-2">${escapeHtml(r.name || '')}</td>
                <td class="py-2 text-right">${Number(r.quantity_warehouse).toFixed(2)}</td>
                <td class="py-2 text-right text-on-surface-variant">${Number(r.quantity_catalog).toFixed(2)}</td>
                <td class="py-2 text-right">${Number(r.min_stock).toFixed(2)}</td>
            </tr>`
                )
                .join('');
            bodyHtml = `
                <p class="mb-3 text-sm text-on-surface-variant">Existencias por bodega (sin fila en almacen se muestra el stock del catalogo como referencia).</p>
                <div class="mb-4 flex flex-wrap items-center gap-2">
                    <label class="text-sm">Almacen<select id="inv-stock-wh" class="ml-1 rounded-md border border-outline-variant/40 px-2 py-2 text-sm">${whOpts}</select></label>
                    <button type="button" id="inv-stock-apply" class="rounded-md border px-3 py-2 text-sm">Actualizar vista</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full min-w-[640px] text-left text-sm">
                        <thead><tr class="border-b border-outline-variant/30"><th class="py-2">SKU</th><th class="py-2">Producto</th><th class="py-2 text-right">Cant. almacen</th><th class="py-2 text-right">Stock catalogo</th><th class="py-2 text-right">Minimo</th></tr></thead>
                        <tbody>${
                            stTable ||
                            `<tr><td colspan="5" class="py-8 text-center text-on-surface-variant">Sin datos o elige un almacen.</td></tr>`
                        }</tbody>
                    </table>
                </div>`;
        } else if (section === 'kardex') {
            const kdPayload = { tenantId: tid, action: 'list_kardex', limit: 150 };
            if (kardexWarehouseId) kdPayload.warehouseId = kardexWarehouseId;
            if (kardexProductId.trim()) kdPayload.productId = kardexProductId.trim();
            const kdRes = await inventoryListKardexViaDb(tid, kdPayload);
            const kdU = unwrapFnInvoke(kdRes);
            const kdRows = !kdU.err && kdU.data?.ok ? kdU.data.rows || [] : [];
            if (kdU.err || kdU.data?.err) invErr += `<div class="text-xs text-error">${escapeHtml(kdU.err || kdU.data?.err || '')}</div>`;
            const whOptsK = `<option value="">Todos</option>${(warehouses || [])
                .map(
                    (w) =>
                        `<option value="${escapeHtml(w.id)}" ${kardexWarehouseId === w.id ? 'selected' : ''}>${escapeHtml(w.label || w.code)}</option>`
                )
                .join('')}`;
            const kdTable = (kdRows || [])
                .map((r) => {
                    const dt = r.created_at ? new Date(r.created_at).toLocaleString() : '';
                    const pl = r.product || {};
                    const wl = r.warehouse || {};
                    return `<tr class="border-b border-outline-variant/20">
                    <td class="py-2 whitespace-nowrap text-xs">${escapeHtml(dt)}</td>
                    <td class="py-2 text-xs">${escapeHtml(r.movement_type || '')}</td>
                    <td class="py-2 text-right font-mono text-xs">${escapeHtml(String(r.quantity ?? ''))}</td>
                    <td class="py-2 text-xs">${escapeHtml(pl.sku || '')} ${escapeHtml(pl.name || '')}</td>
                    <td class="py-2 text-xs">${escapeHtml(wl.label || wl.code || '—')}</td>
                    <td class="py-2 text-xs">${escapeHtml(r.reference_type || '')}</td>
                    <td class="py-2 max-w-[180px] truncate text-xs" title="${escapeHtml(r.notes || '')}">${escapeHtml(r.notes || '')}</td>
                </tr>`;
                })
                .join('');
            bodyHtml = `
                <p class="mb-3 text-sm text-on-surface-variant">Movimientos contables de inventario (facturas, anulaciones, ajustes manuales).</p>
                <div class="mb-4 flex flex-wrap items-end gap-2">
                    <label class="text-sm">Almacen<select id="inv-kd-wh" class="ml-1 rounded-md border border-outline-variant/40 px-2 py-2 text-sm">${whOptsK}</select></label>
                    <label class="text-sm">Producto UUID<input id="inv-kd-pid" class="ml-1 w-64 rounded-md border border-outline-variant/40 px-2 py-2 font-mono text-xs" value="${escapeHtml(
                        kardexProductId
                    )}" placeholder="opcional" /></label>
                    <button type="button" id="inv-kd-apply" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Filtrar</button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full min-w-[900px] text-left text-sm">
                        <thead><tr class="border-b border-outline-variant/30"><th class="py-2">Fecha</th><th class="py-2">Tipo</th><th class="py-2 text-right">Cant.</th><th class="py-2">Producto</th><th class="py-2">Almacen</th><th class="py-2">Ref.</th><th class="py-2">Notas</th></tr></thead>
                        <tbody>${kdTable || `<tr><td colspan="7" class="py-8 text-center text-on-surface-variant">Sin movimientos.</td></tr>`}</tbody>
                    </table>
                </div>`;
        } else if (section === 'alerts') {
            const alPayload = { tenantId: tid, action: 'list_low_stock' };
            if (alertWhId) alPayload.warehouseId = alertWhId;
            const alRes = await inventoryListLowStockViaDb(tid, alPayload);
            const alU = unwrapFnInvoke(alRes);
            const alRows = !alU.err && alU.data?.ok ? alU.data.rows || [] : [];
            if (alU.err) invErr += `<div class="text-xs text-error">${escapeHtml(alU.err)}</div>`;
            const whOptsA = `<option value="">Total catalogo (minimo)</option>${(warehouses || [])
                .map(
                    (w) =>
                        `<option value="${escapeHtml(w.id)}" ${String(invWarehouseId || '') === String(w.id) ? 'selected' : ''}>${escapeHtml(
                            w.label || w.code
                        )}</option>`
                )
                .join('')}`;
            const alTable = (alRows || [])
                .map(
                    (r) => `<tr class="border-b border-outline-variant/20">
                <td class="py-2 font-mono text-xs">${escapeHtml(r.sku || '')}</td>
                <td class="py-2">${escapeHtml(r.name || '')}</td>
                <td class="py-2 text-right font-semibold text-error">${Number(r.quantity).toFixed(2)}</td>
                <td class="py-2 text-right">${Number(r.min_stock).toFixed(2)}</td>
                <td class="py-2 text-xs">${escapeHtml(r.scope || '')}</td>
            </tr>`
                )
                .join('');
            bodyHtml = `
                <p class="mb-3 text-sm text-on-surface-variant">Articulos con minimo de alerta configurado en catalogo y existencia por debajo o igual.</p>
                <div class="mb-4 flex flex-wrap items-center gap-2">
                    <label class="text-sm">Ambito<select id="inv-al-wh" class="ml-1 rounded-md border border-outline-variant/40 px-2 py-2 text-sm">${whOptsA}</select></label>
                    <button type="button" id="inv-al-apply" class="rounded-md border px-3 py-2 text-sm">Actualizar</button>
                </div>
                <table class="w-full text-left text-sm">
                    <thead><tr class="border-b border-outline-variant/30"><th class="py-2">SKU</th><th class="py-2">Nombre</th><th class="py-2 text-right">Cantidad</th><th class="py-2 text-right">Minimo</th><th class="py-2">Ambito</th></tr></thead>
                    <tbody>${alTable || `<tr><td colspan="5" class="py-8 text-center text-on-surface-variant">Sin alertas.</td></tr>`}</tbody>
                </table>`;
        } else if (section === 'adjust') {
            const catListRes = await productsManageViaDb({
                tenantId: tid,
                action: 'list_catalog',
                itemKind: 'product',
                includeInactive: false
            });
            const catListU = unwrapFnInvoke(catListRes);
            const prods = !catListU.err && catListU.data?.ok ? catListU.data.rows || [] : [];
            const prodOpts = (prods || [])
                .filter((p) => String(p.item_kind || '').toLowerCase() !== 'service' && p.tracks_stock !== false)
                .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.sku || '')} — ${escapeHtml(p.name || '')}</option>`)
                .join('');
            const whOptsAd = (warehouses || [])
                .map((w) => `<option value="${escapeHtml(w.id)}" ${stockWhId === w.id ? 'selected' : ''}>${escapeHtml(w.label || w.code)}</option>`)
                .join('');
            bodyHtml = `
                <p class="mb-3 text-sm text-on-surface-variant">Suma o resta unidades en un almacen; se actualiza el stock del catalogo y queda traza en kardex (tipo adjustment).</p>
                <form id="inv-adj-form" class="grid max-w-lg grid-cols-1 gap-3">
                    <label class="text-sm">Almacen<select name="warehouseId" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${whOptsAd}</select></label>
                    <label class="text-sm">Producto<select name="productId" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${prodOpts}</select></label>
                    <label class="text-sm">Cantidad (+ entrada, - salida)<input name="delta" type="number" step="0.01" required class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="0" /></label>
                    <label class="text-sm">Motivo<textarea name="reason" rows="2" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" required></textarea></label>
                    <button type="submit" class="rounded-md bg-primary px-4 py-2 text-sm text-white">Registrar ajuste</button>
                </form>`;
        }

        dashboardContent.innerHTML = `
            ${renderModuleHeader(
                'Inventario',
                'Almacenes, existencias por bodega, kardex, alertas por minimo y ajustes manuales. El catalogo y facturacion siguen en la pestana Catalogo.'
            )}
            <div class="mb-3 flex flex-wrap gap-2">${secBtn('catalog', 'Catalogo')}${secBtn('warehouses', 'Almacenes')}${secBtn('stock', 'Stock por almacen')}${secBtn(
            'kardex',
            'Kardex'
        )}${secBtn('alerts', 'Alertas')}${secBtn('adjust', 'Ajuste manual')}</div>
            ${invErr}
            <div class="rounded-xl bg-surface-container-low p-1" data-inventario-root>
                <div class="rounded-lg bg-surface-container-lowest p-5">${bodyHtml}</div>
            </div>`;

        dashboardContent.querySelectorAll('[data-inv-section]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.inventarioUi = { ...state.inventarioUi, section: btn.getAttribute('data-inv-section') };
                void renderInventarioModule();
            });
        });
        document.getElementById('inv-stock-wh')?.addEventListener('change', (e) => {
            state.inventarioUi = { ...state.inventarioUi, invWarehouseId: e.target.value };
        });
        document.getElementById('inv-stock-apply')?.addEventListener('click', () => {
            const v = document.getElementById('inv-stock-wh')?.value || '';
            state.inventarioUi = { ...state.inventarioUi, invWarehouseId: v, section: 'stock' };
            void renderInventarioModule();
        });
        document.getElementById('inv-kd-apply')?.addEventListener('click', () => {
            state.inventarioUi = {
                ...state.inventarioUi,
                kardexWarehouseId: document.getElementById('inv-kd-wh')?.value || '',
                kardexProductId: document.getElementById('inv-kd-pid')?.value?.trim() || '',
                section: 'kardex'
            };
            void renderInventarioModule();
        });
        document.getElementById('inv-al-apply')?.addEventListener('click', () => {
            state.inventarioUi = {
                ...state.inventarioUi,
                invWarehouseId: document.getElementById('inv-al-wh')?.value || '',
                section: 'alerts'
            };
            void renderInventarioModule();
        });
        document.getElementById('inv-wh-add')?.addEventListener('click', async () => {
            const code = document.getElementById('inv-wh-code')?.value?.trim();
            const label = document.getElementById('inv-wh-label')?.value?.trim();
            const isDefault = Boolean(document.getElementById('inv-wh-default')?.checked);
            const res = await inventoryUpsertWarehouseViaDb(tid, { code, label, isDefault });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else void renderInventarioModule();
        });
        dashboardContent.querySelectorAll('[data-inv-wh-del]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!window.confirm('Eliminar almacen vacio?')) return;
                const res = await inventoryDeleteWarehouseViaDb(tid, btn.getAttribute('data-inv-wh-del'));
                const u = unwrapFnInvoke(res);
                if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
                else void renderInventarioModule();
            });
        });
        document.getElementById('inv-adj-form')?.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const fd = new FormData(ev.target);
            const res = await inventoryManualAdjustViaDb(tid, {
                warehouseId: fd.get('warehouseId'),
                productId: fd.get('productId'),
                quantityDelta: fd.get('delta'),
                reason: fd.get('reason')
            });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else {
                window.alert('Ajuste registrado.');
                void renderInventarioModule();
            }
        });
        zyronLog('render:inventario:ops:done', { section });
        return;
    }

    const [catRes, listRes, unitRes] = await Promise.all([
        productsManageViaDb({ tenantId: tid, action: 'list_categories' }),
        productsManageViaDb({
            tenantId: tid,
            action: 'list_catalog',
            q: q || undefined,
            categoryId: categoryId || undefined,
            itemKind: itemKind || undefined,
            includeInactive
        }),
        productsManageViaDb({ tenantId: tid, action: 'list_units' })
    ]);
    const catU = unwrapFnInvoke(catRes);
    const listU = unwrapFnInvoke(listRes);
    const unitU = unwrapFnInvoke(unitRes);
    const categories = catU.err || !catU.data?.ok ? [] : catU.data.rows || [];
    const rows = listU.err || !listU.data?.ok ? [] : listU.data.rows || [];
    const units = unitU.err || !unitU.data?.ok ? [] : unitU.data.rows || [];
    const fnErr =
        listU.err || catU.err || unitU.err
            ? `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">Catalogo: ${escapeHtml(
                  listU.err || catU.err || unitU.err || 'error'
              )}. SQL products_module_advanced y permisos RLS.</div>`
            : '';

    let editRow = null;
    if (sheet === 'form' && editId) {
        const gRes = await productsManageViaDb({ tenantId: tid, action: 'get_product', productId: editId });
        const gU = unwrapFnInvoke(gRes);
        if (!gU.err && gU.data?.ok) editRow = gU.data.product;
    }

    const money = (n) => {
        const x = Number(n);
        return Number.isFinite(x) ? x.toFixed(2) : '-';
    };
    const tabBtn = (key, label) => {
        const on = tab === key;
        return `<button type="button" data-inv-tab="${key}" class="rounded-md px-3 py-1.5 text-sm ${
            on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
        }">${label}</button>`;
    };

    const catOpts = `<option value="">Todas</option>${categories
        .map((c) => `<option value="${escapeHtml(c.id)}" ${categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`)
        .join('')}`;

    const prodRows = (rows || [])
        .map(
            (p) => `<tr class="border-b border-outline-variant/20 ${p.is_active === false ? 'opacity-60' : ''}">
            <td class="py-2 font-mono text-xs">${escapeHtml(p.sku || '')}</td>
            <td class="py-2">${escapeHtml(p.name || '')}</td>
            <td class="py-2 text-xs">${escapeHtml(p.item_kind != null ? String(p.item_kind) : 'product')}</td>
            <td class="py-2 text-right">${money(p.price)}</td>
            <td class="py-2 text-right">${p.cost_price != null && p.cost_price !== '' ? money(p.cost_price) : '—'}</td>
            <td class="py-2 text-right">${String(p.item_kind || '').toLowerCase() === 'service' ? '—' : money(p.stock)}</td>
            <td class="py-2 text-center text-xs">${p.tracks_stock === false ? 'No' : 'Si'}</td>
            <td class="py-2 text-right text-xs">${p.tax_rate_default != null && p.tax_rate_default !== '' ? money(p.tax_rate_default) : '—'}</td>
            <td class="py-2 text-right text-xs">${money(p.discount_default ?? 0)}</td>
            <td class="py-2 text-xs">${escapeHtml(p.category?.label || '—')}</td>
            <td class="py-2 text-xs">${escapeHtml(p.unit?.label || p.unit?.code || '—')}</td>
            <td class="py-2 text-right whitespace-nowrap">
                <button type="button" class="rounded border border-outline-variant/40 px-2 py-1 text-xs" data-inv-edit="${escapeHtml(p.id)}">Editar</button>
                <button type="button" class="rounded border px-2 py-1 text-xs" data-inv-toggle="${escapeHtml(p.id)}" data-active="${
                    p.is_active === false ? '0' : '1'
                }">${p.is_active === false ? 'Activar' : 'Desactivar'}</button>
            </td>
        </tr>`
        )
        .join('');

    const listPanel = `
        <div class="mb-4 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 class="text-sm font-bold text-primary">Catalogo</h3>
                    <p class="mt-1 text-xs text-on-surface-variant">Agrega productos o servicios desde aqui para usarlos despues en facturas e inventario.</p>
                </div>
                <button type="button" id="inv-new-btn-top" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Agregar producto o servicio</button>
            </div>
        </div>
        <div class="mb-4 flex flex-col flex-wrap gap-2 sm:flex-row sm:items-end">
            <input id="inv-filter-q" type="search" class="max-w-md flex-1 rounded-md border border-outline-variant/40 px-3 py-2 text-sm" placeholder="SKU o nombre…" value="${escapeHtml(
                q
            )}" />
            <select id="inv-filter-cat" class="rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${catOpts}</select>
            <select id="inv-filter-kind" class="rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                <option value="" ${!itemKind ? 'selected' : ''}>Todos los tipos</option>
                <option value="product" ${itemKind === 'product' ? 'selected' : ''}>Producto</option>
                <option value="service" ${itemKind === 'service' ? 'selected' : ''}>Servicio</option>
            </select>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="inv-filter-inactive" ${includeInactive ? 'checked' : ''} /> Inactivos</label>
            <button type="button" id="inv-filter-apply" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Filtrar</button>
            <button type="button" id="inv-new-btn" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Agregar producto o servicio</button>
            <button type="button" id="inv-export-btn" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Exportar CSV</button>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full min-w-[1100px] text-left text-sm">
                <thead>
                    <tr class="border-b border-outline-variant/30">
                        <th class="py-2">SKU</th><th class="py-2">Nombre</th><th class="py-2">Tipo</th>
                        <th class="py-2 text-right">Precio</th><th class="py-2 text-right">Costo</th><th class="py-2 text-right">Stock</th>
                        <th class="py-2">Stock auto</th><th class="py-2 text-right">IVA %</th><th class="py-2 text-right">Desc.</th>
                        <th class="py-2">Categoria</th><th class="py-2">Unidad</th><th class="py-2 text-right"></th>
                    </tr>
                </thead>
                <tbody>${
                    prodRows ||
                    `<tr><td colspan="12" class="py-8 text-center text-on-surface-variant">Sin filas. Crea categorias/unidades y articulos.</td></tr>`
                }</tbody>
            </table>
        </div>`;

    const catTable = (categories || [])
        .map(
            (c) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2">${escapeHtml(c.code)}</td>
            <td class="py-2">${escapeHtml(c.label)}</td>
            <td class="py-2 text-right"><button type="button" class="text-xs text-error" data-inv-cat-del="${escapeHtml(c.id)}">Eliminar</button></td>
        </tr>`
        )
        .join('');

    const catPanel = `
        <button type="button" id="inv-cat-seed" class="mb-3 rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Categorias sugeridas</button>
        <div class="mb-4 grid max-w-lg grid-cols-2 gap-2">
            <input id="inv-cat-code" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="codigo" />
            <input id="inv-cat-label" class="rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Etiqueta" />
            <button type="button" id="inv-cat-add" class="col-span-2 rounded-md bg-primary px-3 py-2 text-sm text-white">Agregar categoria</button>
        </div>
        <table class="w-full text-left text-sm"><thead><tr class="border-b border-outline-variant/30"><th class="py-2">Codigo</th><th class="py-2">Etiqueta</th><th></th></tr></thead>
        <tbody>${catTable || `<tr><td colspan="3" class="py-4 text-on-surface-variant">Sin categorias</td></tr>`}</tbody></table>`;

    const unitTable = (units || [])
        .map(
            (u) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2">${escapeHtml(u.code)}</td>
            <td class="py-2">${escapeHtml(u.label)}</td>
            <td class="py-2">${escapeHtml(u.symbol || '')}</td>
            <td class="py-2 text-right"><button type="button" class="text-xs text-error" data-inv-unit-del="${escapeHtml(u.id)}">Eliminar</button></td>
        </tr>`
        )
        .join('');

    const unitPanel = `
        <button type="button" id="inv-unit-seed" class="mb-3 rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Unidades sugeridas (u, kg, h…)</button>
        <table class="w-full text-left text-sm"><thead><tr class="border-b border-outline-variant/30"><th class="py-2">Codigo</th><th class="py-2">Etiqueta</th><th class="py-2">Simbolo</th><th></th></tr></thead>
        <tbody>${unitTable || `<tr><td colspan="4" class="py-4 text-on-surface-variant">Sin unidades</td></tr>`}</tbody></table>`;

    const fc = editRow || {};
    const catSel = (categories || [])
        .map((c) => `<option value="${escapeHtml(c.id)}" ${String(fc.category_id) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.label)}</option>`)
        .join('');
    const unitSel = (units || [])
        .map((u) => `<option value="${escapeHtml(u.id)}" ${String(fc.unit_id) === String(u.id) ? 'selected' : ''}>${escapeHtml(u.label)} (${escapeHtml(u.code)})</option>`)
        .join('');
    const formPanel = `
        <form id="inv-form" class="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="block text-sm">SKU *<input name="sku" required class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.sku || ''
            )}" /></label>
            <label class="block text-sm">Nombre *<input name="name" required class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.name || ''
            )}" /></label>
            <label class="sm:col-span-2 block text-sm">Descripcion<textarea name="description" rows="2" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${escapeHtml(
                fc.description || ''
            )}</textarea></label>
            <label class="block text-sm">Tipo
                <select name="item_kind" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                    <option value="product" ${String(fc.item_kind || 'product').toLowerCase() !== 'service' ? 'selected' : ''}>Producto (inventario)</option>
                    <option value="service" ${String(fc.item_kind || '').toLowerCase() === 'service' ? 'selected' : ''}>Servicio</option>
                </select>
            </label>
            <label class="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="tracks_stock" ${fc.tracks_stock === false ? '' : 'checked'} /> Llevar stock automatico (facturas emitidas)</label>
            <label class="block text-sm">Precio venta<input name="price" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.price != null ? String(fc.price) : '0'
            )}" /></label>
            <label class="block text-sm">Costo<input name="cost_price" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.cost_price != null && fc.cost_price !== '' ? String(fc.cost_price) : ''
            )}" /></label>
            <label class="block text-sm">Stock actual<input name="stock" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.stock != null ? String(fc.stock) : '0'
            )}" /></label>
            <label class="block text-sm">Stock minimo alerta<input name="min_stock" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.min_stock != null ? String(fc.min_stock) : '0'
            )}" /></label>
            <label class="block text-sm">IVA % sugerido en factura<input name="tax_rate_default" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.tax_rate_default != null && fc.tax_rate_default !== '' ? String(fc.tax_rate_default) : '18'
            )}" /></label>
            <label class="block text-sm">Descuento fijo sugerido<input name="discount_default" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
                fc.discount_default != null && fc.discount_default !== '' ? String(fc.discount_default) : '0'
            )}" /></label>
            <label class="block text-sm">Categoria<select name="category_id" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm"><option value="">—</option>${catSel}</select></label>
            <label class="block text-sm">Unidad<select name="unit_id" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm"><option value="">—</option>${unitSel}</select></label>
            <div class="sm:col-span-2 flex gap-2">
                <button type="submit" class="rounded-md bg-primary px-4 py-2 text-sm text-white">${editId ? 'Guardar' : 'Crear'}</button>
                <button type="button" id="inv-form-cancel" class="rounded-md border px-4 py-2 text-sm">Cerrar</button>
            </div>
        </form>`;

    const mainBody = tab === 'categories' ? catPanel : tab === 'units' ? unitPanel : listPanel;
    const sheetHtml =
        sheet === 'form'
            ? `<div id="inv-sheet" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-lg">
                    <h3 class="mb-4 text-lg font-semibold">${editId ? 'Editar articulo' : 'Nuevo producto o servicio'}</h3>
                    ${editId && !editRow ? '<p class="text-sm text-error">No se pudo cargar.</p>' : formPanel}
                </div></div>`
            : '';

    const secBtnTop = (key, label) => {
        const on = section === key;
        return `<button type="button" data-inv-section="${key}" class="rounded-md px-3 py-1.5 text-sm ${
            on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
        }">${label}</button>`;
    };

    dashboardContent.innerHTML = `
        ${renderModuleHeader(
            'Inventario',
            'Catalogo de articulos, categorias y unidades. Almacenes, stock por bodega, kardex, alertas por minimo y ajustes en las demas pestanas.'
        )}
        <div class="mb-3 flex flex-wrap gap-2">${secBtnTop('catalog', 'Catalogo')}${secBtnTop('warehouses', 'Almacenes')}${secBtnTop(
        'stock',
        'Stock por almacen'
    )}${secBtnTop('kardex', 'Kardex')}${secBtnTop('alerts', 'Alertas')}${secBtnTop('adjust', 'Ajuste manual')}</div>
        ${fnErr}
        <div class="rounded-xl bg-surface-container-low p-1" data-inventario-root>
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <div class="mb-4 flex flex-wrap gap-2">${tabBtn('list', 'Articulos')}${tabBtn('categories', 'Categorias')}${tabBtn(
        'units',
        'Unidades'
    )}</div>
                ${mainBody}
            </div>
        </div>
        ${sheetHtml}`;

    const closeSheet = () => {
        state.inventarioUi = { ...state.inventarioUi, sheet: null, editId: null };
        void renderInventarioModule();
    };

    dashboardContent.querySelectorAll('[data-inv-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.inventarioUi = { ...state.inventarioUi, tab: btn.getAttribute('data-inv-tab') };
            void renderInventarioModule();
        });
    });

    dashboardContent.querySelectorAll('[data-inv-section]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.inventarioUi = { ...state.inventarioUi, section: btn.getAttribute('data-inv-section') };
            void renderInventarioModule();
        });
    });

    document.getElementById('inv-filter-apply')?.addEventListener('click', () => {
        state.inventarioUi = {
            ...state.inventarioUi,
            q: document.getElementById('inv-filter-q')?.value?.trim() || '',
            categoryId: document.getElementById('inv-filter-cat')?.value?.trim() || '',
            itemKind: document.getElementById('inv-filter-kind')?.value?.trim() || '',
            includeInactive: Boolean(document.getElementById('inv-filter-inactive')?.checked)
        };
        void renderInventarioModule();
    });

    document.getElementById('inv-new-btn')?.addEventListener('click', () => {
        state.inventarioUi = { ...state.inventarioUi, sheet: 'form', editId: null };
        void renderInventarioModule();
    });
    document.getElementById('inv-new-btn-top')?.addEventListener('click', () => {
        state.inventarioUi = { ...state.inventarioUi, sheet: 'form', editId: null };
        void renderInventarioModule();
    });

    dashboardContent.querySelectorAll('[data-inv-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.inventarioUi = { ...state.inventarioUi, sheet: 'form', editId: btn.getAttribute('data-inv-edit') };
            void renderInventarioModule();
        });
    });

    dashboardContent.querySelectorAll('[data-inv-toggle]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-inv-toggle');
            const active = btn.getAttribute('data-active') === '1';
            const res = await productsManageViaDb({
                tenantId: tid,
                action: 'update_product',
                productId: id,
                isActive: !active
            });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else await renderInventarioModule();
        });
    });

    document.getElementById('inv-export-btn')?.addEventListener('click', async () => {
        const res = await productsManageViaDb({ tenantId: tid, action: 'export_catalog' });
        const u = unwrapFnInvoke(res);
        if (u.err || !u.data?.csv) {
            window.alert(u.err || u.data?.error || 'Export fallo');
            return;
        }
        const blob = new Blob([u.data.csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = u.data.filename || 'catalogo.csv';
        a.click();
        URL.revokeObjectURL(a.href);
    });

    document.getElementById('inv-cat-seed')?.addEventListener('click', async () => {
        const res = await productsManageViaDb({ tenantId: tid, action: 'seed_categories' });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else await renderInventarioModule();
    });

    document.getElementById('inv-cat-add')?.addEventListener('click', async () => {
        const code = document.getElementById('inv-cat-code')?.value?.trim();
        const label = document.getElementById('inv-cat-label')?.value?.trim();
        const res = await productsManageViaDb({ tenantId: tid, action: 'upsert_category', code, label });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else await renderInventarioModule();
    });

    dashboardContent.querySelectorAll('[data-inv-cat-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!window.confirm('Eliminar categoria?')) return;
            const res = await productsManageViaDb({ tenantId: tid, action: 'delete_category', categoryId: btn.getAttribute('data-inv-cat-del') });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else await renderInventarioModule();
        });
    });

    document.getElementById('inv-unit-seed')?.addEventListener('click', async () => {
        const res = await productsManageViaDb({ tenantId: tid, action: 'seed_units' });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else await renderInventarioModule();
    });

    dashboardContent.querySelectorAll('[data-inv-unit-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!window.confirm('Eliminar unidad?')) return;
            const res = await productsManageViaDb({ tenantId: tid, action: 'delete_unit', unitId: btn.getAttribute('data-inv-unit-del') });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else await renderInventarioModule();
        });
    });

    document.getElementById('inv-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const itemKind = String(fd.get('item_kind') || 'product').toLowerCase() === 'service' ? 'service' : 'product';
        const tracksStock = ev.target.querySelector('[name="tracks_stock"]')?.checked !== false;
        const payload = {
            tenantId: tid,
            sku: fd.get('sku'),
            name: fd.get('name'),
            description: fd.get('description') || null,
            itemKind,
            tracks_stock: itemKind === 'service' ? false : tracksStock,
            price: fd.get('price'),
            cost_price: fd.get('cost_price') === '' ? null : fd.get('cost_price'),
            stock: fd.get('stock'),
            min_stock: fd.get('min_stock'),
            tax_rate_default: fd.get('tax_rate_default'),
            discount_default: fd.get('discount_default'),
            category_id: fd.get('category_id') || null,
            unit_id: fd.get('unit_id') || null
        };
        let res;
        if (editId) res = await productsManageViaDb({ ...payload, action: 'update_product', productId: editId });
        else res = await productsManageViaDb({ ...payload, action: 'create_product' });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else closeSheet();
    });

    document.getElementById('inv-form-cancel')?.addEventListener('click', closeSheet);
    document.getElementById('inv-sheet')?.addEventListener('click', (e) => {
        if (e.target.id === 'inv-sheet') closeSheet();
    });

    zyronLog('render:inventario:done', { tab, count: rows.length });
};

const renderFiscalModule = async (opts = {}) => {
    const target = opts.mount || dashboardContent;
    const embedded = Boolean(opts.embedded);
    zyronLog('render:fiscal:start', { tenantId: state.currentTenantId, embedded });
    if (!state.currentTenantId) {
        target.innerHTML = `${renderModuleHeader('Fiscal', 'Necesitas una empresa activa')}`;
        return;
    }
    const tid = state.currentTenantId;
    const tab = state.fiscalUi?.tab || 'general';
    const tabBtn = (key, label) => {
        const on = tab === key;
        return `<button type="button" data-fisc-tab="${key}" class="rounded-md px-3 py-1.5 text-sm ${
            on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
        }">${label}</button>`;
    };
    const [setRes, ratesRes, ncfRes] = await Promise.all([
        taxComplianceManageViaDb({ tenantId: tid, action: 'get_settings' }),
        taxComplianceManageViaDb({ tenantId: tid, action: 'list_tax_rates' }),
        taxComplianceManageViaDb({ tenantId: tid, action: 'list_ncf_sequences' })
    ]);
    const setU = unwrapFnInvoke(setRes);
    const ratesU = unwrapFnInvoke(ratesRes);
    const ncfU = unwrapFnInvoke(ncfRes);
    const settings = setU.data?.settings || null;
    const fk = (k, def) => (settings && settings[k] != null ? settings[k] : def);
    let errBanner = '';
    if (setU.data?.missingSql) {
        errBanner =
            '<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">Ejecuta tax_compliance_module.sql y revisa permisos RLS (fiscal vía IPC).</div>';
    } else if (setU.err) errBanner = `<div class="mb-3 text-xs text-error">${escapeHtml(setU.err)}</div>`;
    let body = '';
    if (tab === 'general') {
        body = `<form id="fisc-set-form" class="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
<label class="text-sm sm:col-span-2">Razon social<input name="company_legal_name" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
            fk('company_legal_name', '')
        )}" /></label>
<label class="text-sm">RNC<input name="company_rnc" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
            fk('company_rnc', '')
        )}" /></label>
<label class="text-sm">Pais ISO2<input name="country_code" maxlength="2" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
            String(fk('country_code', 'DO') || 'DO')
        )}" /></label>
<label class="text-sm">Etiqueta impuesto<input name="tax_label" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
            fk('tax_label', 'ITBIS')
        )}" /></label>
<label class="text-sm">Tasa por defecto %<input name="default_tax_rate" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
            String(fk('default_tax_rate', 18))
        )}" /></label>
<label class="flex items-center gap-2 text-sm pt-6 sm:col-span-2"><input type="checkbox" name="prices_tax_inclusive" ${
            fk('prices_tax_inclusive', false) ? 'checked' : ''
        } /> Precios con impuesto incluido (base calculada)</label>
<label class="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="ncf_enabled" ${
            fk('ncf_enabled', false) ? 'checked' : ''
        } /> Asignar NCF al emitir (configura secuencias en pestana NCF)</label>
<label class="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="electronic_invoicing_requested" ${
            fk('electronic_invoicing_requested', false) ? 'checked' : ''
        } /> Marcar facturas para flujo e-CF / electronico (pendiente de integracion)</label>
<label class="text-sm">Retencion ISR % sobre subtotal<input name="withholding_isr_on_subtotal_pct" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
            String(fk('withholding_isr_on_subtotal_pct', 0))
        )}" /></label>
<label class="text-sm">Retencion ITBIS % sobre impuesto total<input name="withholding_itbis_on_tax_pct" type="number" step="0.01" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(
            String(fk('withholding_itbis_on_tax_pct', 0))
        )}" /></label>
<label class="text-sm sm:col-span-2">Notas fiscales<textarea name="fiscal_notes" rows="2" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${escapeHtml(
            fk('fiscal_notes', '') || ''
        )}</textarea></label>
<button type="submit" class="sm:col-span-2 rounded-md bg-primary px-4 py-2 text-sm text-white">Guardar</button></form>`;
    } else if (tab === 'tasas') {
        const rows = !ratesU.err && ratesU.data?.ok ? ratesU.data.rows || [] : [];
        if (ratesU.err) errBanner += `<div class="text-xs text-error">${escapeHtml(ratesU.err)}</div>`;
        const tbl = rows
            .map(
                (r) =>
                    `<tr class="border-b border-outline-variant/20"><td class="py-2 font-mono text-xs">${escapeHtml(r.code)}</td><td class="py-2">${escapeHtml(
                        r.label
                    )}</td><td class="py-2 text-right">${escapeHtml(String(r.rate_percent))}</td><td class="py-2">${r.is_default ? 'Si' : ''}</td><td class="py-2 text-right"><button type="button" class="text-xs text-error" data-fisc-del-rate="${escapeHtml(
                        r.id
                    )}">Eliminar</button></td></tr>`
            )
            .join('');
        body = `<button type="button" id="fisc-seed-rates" class="mb-3 rounded-md border px-3 py-2 text-sm">Tasas RD (18/16/0)</button>
<div class="mb-4 grid max-w-lg grid-cols-2 gap-2"><input id="fisc-rate-code" class="rounded-md border px-2 py-2 text-sm" placeholder="codigo" />
<input id="fisc-rate-label" class="rounded-md border px-2 py-2 text-sm" placeholder="Etiqueta" />
<input id="fisc-rate-pct" type="number" class="rounded-md border px-2 py-2 text-sm" placeholder="%" />
<label class="flex items-center gap-2 text-xs"><input type="checkbox" id="fisc-rate-def" /> Predet.</label>
<button type="button" id="fisc-rate-add" class="col-span-2 rounded-md bg-primary px-3 py-2 text-sm text-white">Agregar</button></div>
<table class="w-full text-left text-sm"><thead><tr class="border-b"><th>Codigo</th><th>Etiqueta</th><th class="text-right">%</th><th>Def.</th><th></th></tr></thead><tbody>${
            tbl || '<tr><td colspan="5" class="py-6 text-on-surface-variant">Sin tasas</td></tr>'
        }</tbody></table>`;
    } else if (tab === 'ncf') {
        const nrows = !ncfU.err && ncfU.data?.ok ? ncfU.data.rows || [] : [];
        if (ncfU.err) errBanner += `<div class="text-xs text-error">${escapeHtml(ncfU.err)}</div>`;
        const tbl = nrows
            .map(
                (r) =>
                    `<tr class="border-b border-outline-variant/20"><td class="py-2">${escapeHtml(r.ncf_type)}</td><td class="py-2 font-mono text-xs">${escapeHtml(
                        r.invoice_series_match
                    )}</td><td class="py-2 font-mono">${escapeHtml(r.prefix)}</td><td class="py-2 text-right">${escapeHtml(String(r.correlative_width))} / ${escapeHtml(
                        String(r.next_correlative)
                    )}</td><td class="py-2 text-right"><button type="button" class="text-xs text-error" data-fisc-del-ncf="${escapeHtml(r.id)}">Eliminar</button></td></tr>`
            )
            .join('');
        body = `<p class="mb-3 text-sm text-on-surface-variant">Serie Zyron (FAC) = prefijo NCF (ej. B02) + correlativo de ancho fijo.</p>
<div class="mb-4 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3"><input id="fisc-ncf-type" class="rounded-md border px-2 py-2 text-sm" placeholder="Tipo B02" />
<input id="fisc-ncf-ser" class="rounded-md border px-2 py-2 text-sm" placeholder="Serie FAC" />
<input id="fisc-ncf-pre" class="rounded-md border px-2 py-2 text-sm" placeholder="Prefijo B02" />
<input id="fisc-ncf-w" type="number" class="rounded-md border px-2 py-2 text-sm" value="8" />
<input id="fisc-ncf-next" type="number" class="rounded-md border px-2 py-2 text-sm" value="1" />
<button type="button" id="fisc-ncf-add" class="rounded-md bg-primary px-3 py-2 text-sm text-white sm:col-span-3">Guardar</button></div>
<p class="mb-2 text-xs">Preview: <span id="fisc-ncf-prev">—</span> <button type="button" id="fisc-ncf-prev-btn" class="text-xs underline">Ver</button></p>
<table class="w-full text-left text-sm"><thead><tr class="border-b"><th>Tipo</th><th>Serie</th><th>Prefijo</th><th>Ancho/Sig.</th><th></th></tr></thead><tbody>${
            tbl || '<tr><td colspan="5" class="py-6 text-on-surface-variant">Sin secuencias</td></tr>'
        }</tbody></table>`;
    } else {
        body =
            '<ul class="list-disc space-y-2 pl-5 text-sm text-on-surface-variant max-w-3xl"><li>Obtener rangos NCF y e-CF ante DGII o autoridad competente.</li><li>Zyron no envia datos a la DGII salvo integraciones externas que configures.</li><li>Conserva XML/PDF oficiales y libros segun normativa.</li></ul>' +
            '<label class="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" id="fisc-ack" /> Confirmo revision con asesoria contable.</label>' +
            '<button type="button" id="fisc-ack-save" class="mt-3 rounded-md border px-3 py-2 text-sm">Registrar</button>';
    }
    target.innerHTML = `${
        embedded
            ? ''
            : renderModuleHeader(
                  'Impuestos y cumplimiento',
                  'ITBIS/IVA, precios con/sin impuesto incluido, retenciones, NCF (RD) y estado de facturacion electronica.'
              )
    }<div class="mb-3 flex flex-wrap gap-2">${tabBtn('general', 'General')}${tabBtn('tasas', 'Tasas')}${tabBtn('ncf', 'NCF')}${tabBtn(
        'cumplimiento',
        'Cumplimiento'
    )}</div>${errBanner}<div class="rounded-xl bg-surface-container-low p-1"><div class="rounded-lg bg-surface-container-lowest p-5">${body}</div></div>`;
    target.querySelectorAll('[data-fisc-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.fiscalUi = { ...state.fiscalUi, tab: btn.getAttribute('data-fisc-tab') };
            void renderFiscalModule(opts);
        });
    });
    document.getElementById('fisc-set-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const res = await taxComplianceManageViaDb({
            tenantId: tid,
            action: 'upsert_settings',
            countryCode: fd.get('country_code'),
            taxLabel: fd.get('tax_label'),
            defaultTaxRate: fd.get('default_tax_rate'),
            pricesTaxInclusive: ev.target.querySelector('[name="prices_tax_inclusive"]')?.checked === true,
            ncfEnabled: ev.target.querySelector('[name="ncf_enabled"]')?.checked === true,
            electronicInvoicingRequested: ev.target.querySelector('[name="electronic_invoicing_requested"]')?.checked === true,
            companyRnc: fd.get('company_rnc'),
            companyLegalName: fd.get('company_legal_name'),
            fiscalNotes: fd.get('fiscal_notes'),
            withholdingIsrOnSubtotalPct: fd.get('withholding_isr_on_subtotal_pct'),
            withholdingItbisOnTaxPct: fd.get('withholding_itbis_on_tax_pct')
        });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else void renderFiscalModule(opts);
    });
    document.getElementById('fisc-seed-rates')?.addEventListener('click', async () => {
        const res = await taxComplianceManageViaDb({ tenantId: tid, action: 'seed_tax_rates_do' });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else void renderFiscalModule(opts);
    });
    document.getElementById('fisc-rate-add')?.addEventListener('click', async () => {
        const res = await taxComplianceManageViaDb({
            tenantId: tid,
            action: 'upsert_tax_rate',
            code: document.getElementById('fisc-rate-code')?.value,
            label: document.getElementById('fisc-rate-label')?.value,
            ratePercent: document.getElementById('fisc-rate-pct')?.value,
            isDefault: Boolean(document.getElementById('fisc-rate-def')?.checked)
        });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else void renderFiscalModule(opts);
    });
    target.querySelectorAll('[data-fisc-del-rate]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!window.confirm('Eliminar tasa?')) return;
            const res = await taxComplianceManageViaDb({ tenantId: tid, action: 'delete_tax_rate', id: btn.getAttribute('data-fisc-del-rate') });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else void renderFiscalModule(opts);
        });
    });
    document.getElementById('fisc-ncf-add')?.addEventListener('click', async () => {
        const res = await taxComplianceManageViaDb({
            tenantId: tid,
            action: 'upsert_ncf_sequence',
            ncfType: document.getElementById('fisc-ncf-type')?.value,
            invoiceSeriesMatch: document.getElementById('fisc-ncf-ser')?.value,
            prefix: document.getElementById('fisc-ncf-pre')?.value,
            correlativeWidth: document.getElementById('fisc-ncf-w')?.value,
            nextCorrelative: document.getElementById('fisc-ncf-next')?.value
        });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else void renderFiscalModule(opts);
    });
    document.getElementById('fisc-ncf-prev-btn')?.addEventListener('click', async () => {
        const res = await taxComplianceManageViaDb({
            tenantId: tid,
            action: 'preview_ncf',
            invoiceSeries: document.getElementById('fisc-ncf-ser')?.value || 'FAC'
        });
        const u = unwrapFnInvoke(res);
        const el = document.getElementById('fisc-ncf-prev');
        if (el) el.textContent = u.data?.preview?.ncf || '(sin secuencia)';
    });
    target.querySelectorAll('[data-fisc-del-ncf]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!window.confirm('Eliminar secuencia?')) return;
            const res = await taxComplianceManageViaDb({ tenantId: tid, action: 'delete_ncf_sequence', id: btn.getAttribute('data-fisc-del-ncf') });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else void renderFiscalModule(opts);
        });
    });
    document.getElementById('fisc-ack-save')?.addEventListener('click', async () => {
        if (!document.getElementById('fisc-ack')?.checked) {
            window.alert('Marca la casilla.');
            return;
        }
        const res = await taxComplianceManageViaDb({ tenantId: tid, action: 'upsert_settings', complianceAckAt: new Date().toISOString() });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else void renderFiscalModule(opts);
    });
    zyronLog('render:fiscal:done', { tab });
};

const printReportPdf = async (title, rows) => {
    if (!rows || !rows.length) {
        window.alert('No hay filas para imprimir.');
        return;
    }
    const keys = Object.keys(rows[0]);
    const th = keys.map((k) => `<th style="text-align:left;padding:6px;border:1px solid #ccc">${escapeHtml(k)}</th>`).join('');
    const tr = rows
        .slice(0, 400)
        .map(
            (r) =>
                `<tr>${keys.map((k) => `<td style="padding:6px;border:1px solid #eee">${escapeHtml(String(r[k] ?? ''))}</td>`).join('')}</tr>`
        )
        .join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
        <style>body{font-family:system-ui,sans-serif;padding:16px}h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:12px}</style></head>
        <body><h1>${escapeHtml(title)}</h1><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
        <p style="font-size:11px;color:#666">Use el dialogo de impresion del sistema y elija "Guardar como PDF" si esta disponible.</p>
        <script>window.onload=function(){window.focus();window.print();}<\/script></body></html>`;
    if (!window.electronAPI?.openHtmlPreview) {
        window.alert('No se pudo abrir la vista previa de impresion.');
        return;
    }
    const res = await safeCall(
        () => window.electronAPI.openHtmlPreview({ title, html, autoPrint: true }),
        'desktop.openHtmlPreview'
    );
    const u = unwrapFnInvoke(res);
    if (u.err || u.data?.error) {
        window.alert(u.err || u.data?.error || 'No se pudo abrir la vista previa de impresion.');
    }
};

const renderReportesModule = async () => {
    zyronLog('render:reportes:start', { tenantId: state.currentTenantId });
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader('Reportes', 'Necesitas una empresa activa')}`;
        return;
    }
    const tid = state.currentTenantId;
    const ui = state.reportesUi || {};
    const tab = ui.tab || 'sales';
    const dateFrom = ui.dateFrom ?? '';
    const dateTo = ui.dateTo ?? '';

    const tabBtn = (key, label) => {
        const on = tab === key;
        return `<button type="button" data-rep-tab="${key}" class="rounded-md px-3 py-1.5 text-sm ${
            on ? 'bg-primary text-white' : 'bg-surface-container-highest text-on-surface'
        }">${label}</button>`;
    };

    const rangePayload = {};
    if (dateFrom) rangePayload.dateFrom = dateFrom;
    if (dateTo) rangePayload.dateTo = dateTo;

    let bodyBlock = '';
    let errHtml = '';

    if (tab === 'custom') {
        const listRes = await reportsManageViaDb({ tenantId: tid, action: 'list_custom_definitions' });
        const listU = unwrapFnInvoke(listRes);
        const defs = !listU.err && listU.data?.ok ? listU.data.rows || [] : [];
        if (listU.err || listU.data?.error) errHtml += `<div class="mb-2 text-xs text-error">${escapeHtml(listU.err || listU.data?.error || '')}</div>`;
        const defRows = (defs || [])
            .map(
                (d) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2">${escapeHtml(d.name)}</td>
            <td class="py-2 text-xs">${escapeHtml(d.dataset_key)}</td>
            <td class="py-2 text-right whitespace-nowrap">
                <button type="button" class="text-xs text-primary" data-rep-run-custom="${escapeHtml(d.id)}">Ejecutar</button>
                <button type="button" class="ml-2 text-xs text-error" data-rep-del-custom="${escapeHtml(d.id)}">Eliminar</button>
            </td>
        </tr>`
            )
            .join('');
        bodyBlock = `
            <p class="mb-3 text-sm text-on-surface-variant">Plantillas reutilizables (dataset + rango de fechas guardado en filtros).</p>
            <form id="rep-custom-form" class="mb-6 grid max-w-xl grid-cols-1 gap-2 rounded-lg border border-outline-variant/30 p-4 sm:grid-cols-2">
                <label class="text-sm sm:col-span-2">Nombre<input name="name" required class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" placeholder="Ej. Ventas Q1" /></label>
                <label class="text-sm">Dataset
                    <select name="datasetKey" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm">
                        <option value="sales">Ventas (facturas)</option>
                        <option value="income">Ingresos (pagos)</option>
                        <option value="tax">Impuestos</option>
                        <option value="customers">Clientes (resumen)</option>
                        <option value="top_products">Productos mas vendidos</option>
                        <option value="ar">Cuentas por cobrar</option>
                    </select>
                </label>
                <label class="text-sm">Desde<input name="df" type="date" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" /></label>
                <label class="text-sm">Hasta<input name="dt" type="date" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" /></label>
                <button type="submit" class="sm:col-span-2 rounded-md bg-primary px-3 py-2 text-sm text-white">Guardar plantilla</button>
            </form>
            <table class="w-full text-left text-sm"><thead><tr class="border-b border-outline-variant/30"><th class="py-2">Nombre</th><th class="py-2">Dataset</th><th></th></tr></thead>
            <tbody>${defRows || `<tr><td colspan="3" class="py-6 text-on-surface-variant">Sin plantillas.</td></tr>`}</tbody></table>`;
    } else if (tab === 'history') {
        const hRes = await reportsManageViaDb({ tenantId: tid, action: 'list_export_history' });
        const hU = unwrapFnInvoke(hRes);
        const hist = !hU.err && hU.data?.ok ? hU.data.rows || [] : [];
        if (hU.err) errHtml += `<div class="mb-2 text-xs text-error">${escapeHtml(hU.err)}</div>`;
        const hRows = (hist || [])
            .map(
                (r) => `<tr class="border-b border-outline-variant/20">
            <td class="py-2 text-xs">${escapeHtml(r.created_at || '')}</td>
            <td class="py-2">${escapeHtml(r.report_type || '')}</td>
            <td class="py-2">${escapeHtml(r.format || '')}</td>
            <td class="py-2 max-w-[14rem] truncate text-xs">${escapeHtml(JSON.stringify(r.meta || {}))}</td>
        </tr>`
            )
            .join('');
        bodyBlock = `<p class="mb-3 text-sm text-on-surface-variant">Registro de exportaciones CSV generadas desde este modulo.</p>
            <table class="w-full text-left text-sm"><thead><tr class="border-b border-outline-variant/30"><th class="py-2">Fecha</th><th class="py-2">Tipo</th><th class="py-2">Formato</th><th class="py-2">Meta</th></tr></thead>
            <tbody>${hRows || `<tr><td colspan="4" class="py-6 text-on-surface-variant">Sin historial (ejecuta una exportacion CSV).</td></tr>`}</tbody></table>`;
    } else {
        const res = await reportsManageViaDb({ tenantId: tid, action: 'run_report', reportKey: tab, format: 'json', ...rangePayload });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error || !u.data?.ok) {
            errHtml += `<div class="mb-3 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">Reportes: ${escapeHtml(
                u.err || u.data?.error || 'error'
            )}. Ejecuta SQL reports_module_advanced si faltan tablas.</div>`;
            bodyBlock = '<p class="text-sm text-on-surface-variant">No se pudieron cargar datos.</p>';
        } else {
            const rows = u.data.rows || [];
            const sum = u.data.summary || {};
            const sumStr = Object.entries(sum)
                .map(([k, v]) => `${escapeHtml(k)}: ${typeof v === 'number' ? v.toFixed(2) : escapeHtml(String(v))}`)
                .join(' · ');
            const keys = rows[0] ? Object.keys(rows[0]) : [];
            const th = keys.map((k) => `<th class="py-2 text-left text-xs font-semibold uppercase tracking-wide">${escapeHtml(k)}</th>`).join('');
            const tr = (rows || [])
                .slice(0, 300)
                .map(
                    (r) =>
                        `<tr class="border-b border-outline-variant/15">${keys
                            .map((k) => `<td class="py-2 text-xs">${escapeHtml(String(r[k] ?? ''))}</td>`)
                            .join('')}</tr>`
                )
                .join('');
            bodyBlock = `
                <div class="mb-3 flex flex-wrap gap-2">
                    <button type="button" id="rep-csv-btn" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">Excel (CSV)</button>
                    <button type="button" id="rep-pdf-btn" class="rounded-md border border-outline-variant/50 px-3 py-2 text-sm">PDF / imprimir</button>
                </div>
                ${sumStr ? `<div class="mb-3 rounded-md bg-surface-container-highest px-3 py-2 text-xs">${sumStr}</div>` : ''}
                <div class="overflow-x-auto max-h-[55vh] overflow-y-auto">
                    <table class="w-full min-w-[640px] text-left text-sm"><thead><tr class="border-b border-outline-variant/30">${th}</tr></thead>
                    <tbody>${tr || `<tr><td colspan="${keys.length || 1}" class="py-8 text-center text-on-surface-variant">Sin filas en el periodo.</td></tr>`}</tbody></table>
                </div>`;
            state._reportesLastRows = rows;
            state._reportesLastTab = tab;
        }
    }

    dashboardContent.innerHTML = `
        ${renderModuleHeader(
            'Reportes',
            'Ventas, ingresos, impuestos, clientes, ranking de productos, cuentas por cobrar, plantillas personalizadas e historial de exportaciones. Excel: CSV con BOM. PDF: impresion del navegador.'
        )}
        <div class="mb-3 flex flex-wrap gap-2">${tabBtn('sales', 'Ventas')}${tabBtn('income', 'Ingresos')}${tabBtn('tax', 'Impuestos')}${tabBtn(
        'customers',
        'Clientes'
    )}${tabBtn('top_products', 'Top productos')}${tabBtn('ar', 'Cuentas x cobrar')}${tabBtn('custom', 'Personalizados')}${tabBtn('history', 'Historial')}</div>
        <div class="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-outline-variant/30 p-3">
            <label class="text-sm">Desde<input id="rep-df" type="date" class="ml-2 rounded-md border border-outline-variant/40 px-2 py-2 text-sm" value="${escapeHtml(
                dateFrom
            )}" /></label>
            <label class="text-sm">Hasta<input id="rep-dt" type="date" class="ml-2 rounded-md border border-outline-variant/40 px-2 py-2 text-sm" value="${escapeHtml(
                dateTo
            )}" /></label>
            <button type="button" id="rep-range-apply" class="rounded-md bg-primary px-3 py-2 text-sm text-white">Aplicar fechas</button>
        </div>
        ${errHtml}
        <div class="rounded-xl bg-surface-container-low p-1">
            <div class="rounded-lg bg-surface-container-lowest p-5">${bodyBlock}</div>
        </div>`;

    dashboardContent.querySelectorAll('[data-rep-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.reportesUi = { ...state.reportesUi, tab: btn.getAttribute('data-rep-tab') };
            void renderReportesModule();
        });
    });
    document.getElementById('rep-range-apply')?.addEventListener('click', () => {
        state.reportesUi = {
            ...state.reportesUi,
            dateFrom: document.getElementById('rep-df')?.value || '',
            dateTo: document.getElementById('rep-dt')?.value || ''
        };
        void renderReportesModule();
    });
    document.getElementById('rep-csv-btn')?.addEventListener('click', async () => {
        const t = state._reportesLastTab;
        if (!t) return;
        const res = await reportsManageViaDb({ tenantId: tid, action: 'run_report', reportKey: t, format: 'csv', ...rangePayload });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.ok === false || !u.data?.csv) {
            window.alert(u.err || u.data?.error || 'Export fallo');
            return;
        }
        const blob = new Blob([u.data.csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = u.data.filename || `${t}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    });
    document.getElementById('rep-pdf-btn')?.addEventListener('click', () => {
        const rows = state._reportesLastRows;
        const t = state._reportesLastTab || 'reporte';
        printReportPdf(`Reporte ${t}`, rows || []);
    });
    document.getElementById('rep-custom-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const filterJson = {};
        if (fd.get('df')) filterJson.dateFrom = fd.get('df');
        if (fd.get('dt')) filterJson.dateTo = fd.get('dt');
        const res = await reportsManageViaDb({
            tenantId: tid,
            action: 'save_custom_definition',
            name: fd.get('name'),
            datasetKey: fd.get('datasetKey'),
            columnKeys: [],
            filterJson
        });
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
        else void renderReportesModule();
    });
    dashboardContent.querySelectorAll('[data-rep-run-custom]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-rep-run-custom');
            const res = await reportsManageViaDb({ tenantId: tid, action: 'run_custom_definition', id, format: 'json', ...rangePayload });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error || u.data?.ok === false) {
                window.alert(u.err || u.data?.error || 'Error');
                return;
            }
            state._reportesLastRows = u.data.rows || [];
            state._reportesLastTab = `custom:${u.data.definition?.name || id}`;
            const rows = u.data.rows || [];
            const keys = rows[0] ? Object.keys(rows[0]) : [];
            const th = keys.map((k) => `<th class="py-2 text-left text-xs">${escapeHtml(k)}</th>`).join('');
            const tr = rows
                .slice(0, 300)
                .map(
                    (r) =>
                        `<tr class="border-b border-outline-variant/15">${keys
                            .map((k) => `<td class="py-2 text-xs">${escapeHtml(String(r[k] ?? ''))}</td>`)
                            .join('')}</tr>`
                )
                .join('');
            const host = document.querySelector('.rounded-lg.bg-surface-container-lowest.p-5');
            if (host) {
                const sum = u.data.summary || {};
                const sumStr = Object.entries(sum)
                    .map(([k, v]) => `${escapeHtml(k)}: ${typeof v === 'number' ? v.toFixed(2) : escapeHtml(String(v))}`)
                    .join(' · ');
                host.innerHTML = `
                    <p class="mb-2 text-sm font-medium">Resultado plantilla</p>
                    <div class="mb-3 flex flex-wrap gap-2">
                        <button type="button" id="rep-csv-custom-btn" class="rounded-md border px-3 py-2 text-sm">Excel (CSV)</button>
                        <button type="button" id="rep-pdf-custom-btn" class="rounded-md border px-3 py-2 text-sm">PDF / imprimir</button>
                    </div>
                    ${sumStr ? `<div class="mb-3 rounded-md bg-surface-container-highest px-3 py-2 text-xs">${sumStr}</div>` : ''}
                    <div class="overflow-x-auto max-h-[50vh] overflow-y-auto"><table class="w-full text-left text-sm"><thead><tr class="border-b">${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
                document.getElementById('rep-csv-custom-btn')?.addEventListener('click', async () => {
                    const r2 = await reportsManageViaDb({ tenantId: tid, action: 'run_custom_definition', id, format: 'csv', ...rangePayload });
                    const u2 = unwrapFnInvoke(r2);
                    if (u2.err || u2.data?.ok === false || !u2.data?.csv) {
                        window.alert(u2.err || u2.data?.error || 'Export fallo');
                        return;
                    }
                    const blob = new Blob([u2.data.csv], { type: 'text/csv;charset=utf-8' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = u2.data.filename || 'custom.csv';
                    a.click();
                    URL.revokeObjectURL(a.href);
                });
                document.getElementById('rep-pdf-custom-btn')?.addEventListener('click', () => {
                    printReportPdf(`Plantilla`, state._reportesLastRows || []);
                });
            }
        });
    });
    dashboardContent.querySelectorAll('[data-rep-del-custom]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (!window.confirm('Eliminar plantilla?')) return;
            const res = await reportsManageViaDb({ tenantId: tid, action: 'delete_custom_definition', id: btn.getAttribute('data-rep-del-custom') });
            const u = unwrapFnInvoke(res);
            if (u.err || u.data?.error) window.alert(u.err || u.data.error || 'Error');
            else void renderReportesModule();
        });
    });
    zyronLog('render:reportes:done', { tab });
};

const renderSimpleCrudModule = async (key, table, title, subtitle, columns) => {
    zyronLog('render:simpleCrud:start', { key, table, tenantId: state.currentTenantId });
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader(title, 'Necesitas una empresa activa para este modulo')}`;
        zyronLog('render:simpleCrud:noTenant', { key, table });
        return;
    }
    const { data: rows } = await dbSelect({
        table,
        filters: [{ op: 'eq', column: 'tenant_id', value: state.currentTenantId }],
        order: { column: 'created_at', ascending: false },
        limit: 50
    });
    dashboardContent.innerHTML = `
        ${renderModuleHeader(title, subtitle)}
        <div class="rounded-xl bg-surface-container-low p-1">
            <div class="rounded-lg bg-surface-container-lowest p-5">
                <table class="w-full text-left text-sm">
                    <thead>
                        <tr class="border-b border-outline-variant/30">
                            ${columns.map((col) => `<th class="py-2">${col.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${(rows || []).map((row) => `
                            <tr class="border-b border-outline-variant/20">
                                ${columns.map((col) => `<td class="py-3">${row[col.key] ?? '-'}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    zyronLog('render:simpleCrud:done', { key, table, rowCount: (rows || []).length });
};

const renderConfigModule = async () => {
    zyronLog('render:config:start', { tenantId: state.currentTenantId });
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = `${renderModuleHeader('Configuracion', 'Necesitas una empresa activa')}`;
        return;
    }
    const tid = state.currentTenantId;
    await loadTenantContext(tid);
    const cur = state.tenantContext?.defaultCurrency || 'DOP';
    const loc = state.tenantContext?.defaultLocale || 'es';
    const curP = state.tenantContext?.priceDisplayCurrency || '';
    const { data: rows } = await dbSelect({
        table: 'app_settings',
        filters: [{ op: 'eq', column: 'tenant_id', value: tid }],
        order: { column: 'updated_at', ascending: false },
        limit: 80
    });
    const [docRes, hintsRes, { data: tenantRows }] = await Promise.all([
        fetchInvoiceDocSettingsViaDb(tid),
        fetchTaxHintsViaDb(tid),
        dbSelect({ table: 'tenants', filters: [{ op: 'eq', column: 'id', value: tid }], limit: 1 })
    ]);
    const docU = unwrapFnInvoke(docRes);
    const hintsU = unwrapFnInvoke(hintsRes);
    const docSettings = mergeInvoiceDocumentSettings(docU.data?.settings || {});
    const docTemplates = Array.isArray(docU.data?.templates) && docU.data.templates.length ? docU.data.templates : documentTemplateCatalog();
    const tenantRow = (tenantRows || [])[0] || {};
    const fiscalTaxLabel = !hintsU.err && hintsU.data?.ok ? hintsU.data.taxLabel : 'ITBIS';
    const previewInvoiceSample = {
        series: 'FAC',
        number: '0001',
        invoice_type: 'standard',
        status: 'emitida',
        created_at: new Date().toISOString(),
        currency: cur || 'DOP',
        subtotal: 12500,
        tax_total: 2250,
        total: 14750,
        notes: 'Gracias por su compra.'
    };
    const previewLineSample = [
        { description: 'Servicio profesional', quantity: 1, unit_price: 8500, tax_rate: 18, discount: 0 },
        { description: 'Soporte mensual', quantity: 2, unit_price: 2000, tax_rate: 18, discount: 0 }
    ];
    const previewCustomerSample = {
        name: 'Cliente de ejemplo',
        email: 'cliente@empresa.com',
        tax_id: 'RNC 000-00000-0',
        address: 'Santo Domingo, RD'
    };
    const initialPreviewHtml = buildInvoiceDocumentHtml({
        invoice: previewInvoiceSample,
        lines: previewLineSample,
        customer: previewCustomerSample,
        tenant: tenantRow,
        branding: docSettings,
        fiscalTaxLabel,
        isDraft: false
    });
    const companyBlock = `
        <div class="mb-6 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
            <h3 class="text-sm font-bold text-primary">Empresa</h3>
            <p class="mb-4 text-xs text-on-surface-variant">Datos legales y de contacto usados en documentos y operacion.</p>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label class="text-xs font-medium text-on-surface-variant">Nombre comercial
                    <input id="company-display-name" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(tenantRow.display_name || '')}" />
                </label>
                <label class="text-xs font-medium text-on-surface-variant">Razon social
                    <input id="company-legal-name" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(tenantRow.legal_name || '')}" />
                </label>
                <label class="text-xs font-medium text-on-surface-variant">RNC / identificacion fiscal
                    <input id="company-tax-id" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(tenantRow.tax_id || '')}" />
                </label>
                <label class="text-xs font-medium text-on-surface-variant">Email
                    <input id="company-email" type="email" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(tenantRow.email || '')}" />
                </label>
                <label class="text-xs font-medium text-on-surface-variant">Telefono
                    <input id="company-phone" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(tenantRow.phone || '')}" />
                </label>
                <label class="text-xs font-medium text-on-surface-variant sm:col-span-2">Direccion
                    <textarea id="company-address" rows="3" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">${escapeHtml(tenantRow.address || '')}</textarea>
                </label>
            </div>
            <button type="button" id="company-save-btn" class="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar empresa</button>
            <p id="company-save-status" class="mt-2 hidden text-xs"></p>
        </div>`;
    const regionalBlock = `
        <div class="mb-6 rounded-xl border border-primary/25 bg-surface-container-high/30 p-5">
            <h3 class="text-sm font-bold text-primary">Configuracion regional</h3>
            <p class="mb-4 text-xs text-on-surface-variant">Moneda de la empresa. El sistema opera solo en espanol, asi que idioma no se configura ni se muestra.</p>
            <div class="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                <label class="text-xs font-medium">Moneda (ISO 4217)
                    <input id="reg-def-currency" maxlength="3" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 font-mono uppercase text-sm" value="${escapeHtml(cur)}" />
                </label>
                <label class="text-xs font-medium">Moneda visible alternativa (opcional)
                    <input id="reg-display-currency" maxlength="3" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 font-mono uppercase text-sm" value="${escapeHtml(curP)}" placeholder="DOP" />
                </label>
            </div>
            <button type="button" id="reg-save-btn" class="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar region</button>
            <p id="reg-save-status" class="mt-2 hidden text-xs"></p>
        </div>`;
    const companySettingsBlock = `${companyBlock}${regionalBlock}`;
    const logoPreviewAttr = docSettings.logoDataUrl
        ? String(docSettings.logoDataUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        : '';
    const invoiceFormatBlock = `
        <div class="mb-6 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-5">
            <div class="mb-5">
                <h3 class="text-sm font-bold text-primary">Formato de factura</h3>
                <p class="mt-1 text-xs text-on-surface-variant">Plantillas de factura, logo, color y pie legal para exportar PDF desde el sistema de escritorio. No incluye envio por correo.</p>
            </div>
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div class="space-y-4 rounded-lg border border-outline-variant/30 bg-surface-container-low/25 p-4">
                    <h4 class="text-sm font-bold text-primary">Marca y pie</h4>
                    <label class="block text-xs font-medium text-on-surface-variant">Logo (PNG, JPG, WebP; recomendado menor a 300 KB)
                        <input type="file" id="doc-logo-file" accept="image/png,image/jpeg,image/webp,image/gif" class="mt-1 block w-full text-sm" />
                    </label>
                    <input type="hidden" id="doc-logo-data" value="" />
                    <input type="hidden" id="doc-logo-removed" value="" />
                    <div id="doc-logo-preview" class="flex min-h-[52px] items-center justify-start rounded border border-dashed border-outline-variant/50 bg-surface-container-lowest p-2">
                        ${
                            logoPreviewAttr
                                ? `<img src="${logoPreviewAttr}" alt="Logo" class="max-h-16 max-w-[200px] object-contain" />`
                                : '<span class="text-xs text-on-surface-variant">Sin logo (opcional)</span>'
                        }
                    </div>
                    <button type="button" id="doc-logo-clear" class="text-xs font-semibold text-error">Quitar logo</button>
                    <label class="block text-xs font-medium text-on-surface-variant">Color de acento
                        <input type="color" id="doc-accent" class="mt-1 h-10 w-full max-w-[120px] cursor-pointer rounded border border-outline-variant/40" value="${escapeHtml(docSettings.accentHex)}" />
                    </label>
                    <label class="block text-xs font-medium text-on-surface-variant">Nombre en documento (opcional)
                        <input type="text" id="doc-company-name" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" value="${escapeHtml(
                            docSettings.companyDisplayName
                        )}" placeholder="${escapeHtml(String(tenantRow.display_name || tenantRow.legal_name || 'Empresa'))}" />
                    </label>
                    <label class="block text-xs font-medium text-on-surface-variant">Pie legal / notas al pie
                        <textarea id="doc-footer" class="mt-1 w-full rounded-md border border-outline-variant/40 px-2 py-2 text-sm" rows="4" placeholder="RNC, terminos de pago, etc.">${escapeHtml(
                            docSettings.footerLegal
                        )}</textarea>
                    </label>
                    <label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" id="doc-show-disc" class="h-4 w-4" ${docSettings.showLineDiscounts ? 'checked' : ''} />
                        <span>Mostrar columna descuento por linea</span>
                    </label>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" id="doc-branding-save" class="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar formato</button>
                        <button type="button" id="doc-preview-sample" class="rounded-md border border-outline-variant/50 px-4 py-2 text-sm">Vista previa</button>
                    </div>
                    <p id="doc-branding-status" class="hidden text-xs"></p>
                </div>
                <div class="rounded-lg border border-outline-variant/30 p-4">
                    <h4 class="mb-3 text-sm font-bold text-primary">Plantillas</h4>
                    <div class="space-y-2">${docTemplates
                        .map(
                            (t) => `
                        <label class="flex cursor-pointer gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-lowest p-3 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20">
                            <input type="radio" name="doc-template" value="${escapeHtml(t.id)}" class="mt-1" ${docSettings.templateId === t.id ? 'checked' : ''} />
                            <div>
                                <div class="text-sm font-semibold text-on-surface">${escapeHtml(t.label)}</div>
                                <div class="text-xs text-on-surface-variant">${escapeHtml(t.description || '')}</div>
                            </div>
                        </label>`
                        )
                        .join('')}
                    </div>
                    <div class="mt-4 overflow-hidden rounded-lg border border-outline-variant/40 bg-white shadow-sm">
                        <div class="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low px-3 py-2">
                            <span class="text-xs font-semibold text-on-surface-variant">Vista previa</span>
                            <span class="text-[11px] text-on-surface-variant">Factura de ejemplo</span>
                        </div>
                        <iframe id="doc-preview-frame" title="Vista previa de factura" class="h-[520px] w-full bg-white" srcdoc="${escapeHtml(
                            initialPreviewHtml
                        )}"></iframe>
                    </div>
                </div>
            </div>
        </div>`;
    const formatSettingName = (key) =>
        ({
            'preferences.fiscal_year': 'Año fiscal',
            'preferences.timezone': 'Zona horaria',
            'preferences.currency': 'Moneda',
            'preferences.language': 'Idioma',
            invoice_document_branding: 'Formato de documentos',
            zyron_tenant_context: 'Contexto regional'
        }[key] || key);
    const summarizeSettingValue = (key, raw) => {
        let value = raw;
        if (value && typeof value === 'object') value = JSON.stringify(value);
        const text = String(value ?? '');
        if (!text) return 'Sin valor';
        if (text.startsWith('data:image/')) return 'Imagen guardada';
        if (text.length > 80 && /^[A-Za-z0-9+/=]+$/.test(text)) return 'Dato binario guardado';
        if (text.trim().startsWith('{')) {
            try {
                const obj = JSON.parse(text);
                if (key === 'invoice_document_branding') {
                    return `Plantilla ${obj.templateId || 'classic'} ? color ${obj.accentHex || '#0f2744'}${obj.logoDataUrl ? ' ? logo guardado' : ''}`;
                }
                if (key === 'zyron_tenant_context') {
                    return `Moneda ${obj.defaultCurrency || 'DOP'}`;
                }
                return Object.keys(obj).length ? Object.keys(obj).join(', ') : 'Objeto vacío';
            } catch (_) {
                return 'JSON guardado';
            }
        }
        return text.length > 90 ? text.slice(0, 90) + '?' : text;
    };
    const visuallyHiddenSettingKeys = new Set(['preferences.fiscal_year', 'preferences.timezone', 'preferences.currency', 'preferences.language']);
    const appSettingsRows = (rows || [])
        .filter((row) => !visuallyHiddenSettingKeys.has(String(row.setting_key || row.key || '')))
        .map((row) => {
            const key = String(row.setting_key || row.key || '');
            const raw = row.setting_value ?? row.value ?? '';
            const rawString = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
            return `
                <details class="group border-b border-outline-variant/15 px-5 py-4 last:border-b-0">
                    <summary class="grid cursor-pointer list-none grid-cols-[1fr_1.5fr_120px_24px] items-center gap-4">
                        <div>
                            <div class="font-semibold text-on-surface">${escapeHtml(formatSettingName(key))}</div>
                            <div class="mt-0.5 font-mono text-[11px] text-on-surface-variant">${escapeHtml(key)}</div>
                        </div>
                        <div class="text-sm text-on-surface-variant">${escapeHtml(summarizeSettingValue(key, raw))}</div>
                        <div class="text-xs text-on-surface-variant">${escapeHtml(toDateString(row.updated_at))}</div>
                        <span class="material-symbols-outlined text-on-surface-variant transition-transform group-open:rotate-180">expand_more</span>
                    </summary>
                    <pre class="mt-3 max-h-56 overflow-auto rounded-md bg-surface-container-low p-3 text-xs text-on-surface-variant">${escapeHtml(rawString.length > 2500 ? rawString.slice(0, 2500) + '\n? truncado' : rawString)}</pre>
                </details>`;
        })
        .join('');
    const appSettingsBlock = `
        <div class="rounded-xl border border-outline-variant/25 bg-surface-container-lowest shadow-sm">
            <div class="border-b border-outline-variant/25 px-5 py-4">
                <h3 class="text-sm font-semibold text-on-surface">Datos del sistema</h3>
                <p class="mt-1 text-xs text-on-surface-variant">Resumen técnico de ajustes guardados para esta empresa. Abre una fila solo si necesitas inspeccionar el valor raw.</p>
            </div>
            <div class="grid grid-cols-[1fr_1.5fr_120px_24px] gap-4 bg-surface-container-low px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                <span>Clave</span><span>Resumen</span><span>Actualizado</span><span></span>
            </div>
            <div>
                ${appSettingsRows || '<div class="px-5 py-6 text-sm text-on-surface-variant">Sin datos del sistema.</div>'}
            </div>
        </div>`;
    const settingsMenu = [
        { key: 'cuenta', icon: 'person', label: 'Cuenta' },
        { key: 'empresa', icon: 'business', label: 'Empresa' },
        { key: 'preferencias', icon: 'tune', label: 'Preferencias' },
        { key: 'documentos', icon: 'description', label: 'Facturas y presupuestos' },
        { key: 'impuestos', icon: 'request_quote', label: 'Impuestos' },
        { key: 'pagos', icon: 'payments', label: 'Pagos' },
        { key: 'notas', icon: 'notes', label: 'Notas' },
        { key: 'campos', icon: 'dynamic_form', label: 'Campos personalizados' },
        { key: 'roles', icon: 'admin_panel_settings', label: 'Roles' },
        { key: 'correo', icon: 'mail', label: 'Correo' },
        { key: 'archivos', icon: 'picture_as_pdf', label: 'PDF y almacenamiento' },
        { key: 'notificaciones', icon: 'notifications', label: 'Notificaciones' },
        { key: 'sistema', icon: 'database', label: 'Datos del sistema' }
    ];
    const activeSetting = settingsMenu.some((m) => m.key === state.configUi?.tab) ? state.configUi.tab : 'empresa';
    const devCard = (title, text) => `
        <div class="rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-lowest p-5">
            <div class="flex items-center gap-2 text-sm font-bold text-primary">
                <span class="material-symbols-outlined text-lg" aria-hidden="true">construction</span>${escapeHtml(title)}
            </div>
            <p class="mt-2 text-sm text-on-surface-variant">${escapeHtml(text)}</p>
        </div>`;
    const shortcutCard = (title, text, btn, moduleKey) => `
        <div class="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-5">
            <h3 class="text-sm font-bold text-primary">${escapeHtml(title)}</h3>
            <p class="mt-2 text-sm text-on-surface-variant">${escapeHtml(text)}</p>
            <button type="button" data-config-open="${escapeHtml(moduleKey)}" class="mt-4 rounded-md border border-outline-variant/50 px-4 py-2 text-sm font-semibold text-primary">${escapeHtml(btn)}</button>
        </div>`;
    const prefRes = await fetchTenantPreferencesViaDb(tid);
    const prefs = prefRes.data?.preferences || defaultTenantPreferencesObj();
    const preferencesBlock = `
        <div class="rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-5 shadow-sm">
            <h3 class="text-sm font-bold text-primary">Preferencias</h3>
            <p class="mb-4 text-xs text-on-surface-variant">Preferencias operativas. No hay tabla de idiomas: Zyron esta definido solo en espanol.</p>
            <div class="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                <label class="text-xs font-medium text-on-surface-variant">Modulo inicial
                    <select id="pref-default-module" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                        ${['panel', 'facturas', 'presupuestos', 'pagos', 'clientes', 'inventario', 'reportes'].map((v) => `<option value="${v}" ${prefs.defaultModule === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                </label>
                <label class="text-xs font-medium text-on-surface-variant">Densidad
                    <select id="pref-density" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm">
                        <option value="comfortable" ${prefs.interfaceDensity === 'comfortable' ? 'selected' : ''}>Comoda</option>
                        <option value="compact" ${prefs.interfaceDensity === 'compact' ? 'selected' : ''}>Compacta</option>
                    </select>
                </label>
                <label class="text-xs font-medium text-on-surface-variant">Vencimiento factura (dias)
                    <input id="pref-invoice-due-days" type="number" min="0" max="365" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(prefs.invoiceDueDays)}" />
                </label>
                <label class="text-xs font-medium text-on-surface-variant">Vencimiento presupuesto (dias)
                    <input id="pref-estimate-expiry-days" type="number" min="0" max="365" class="mt-1 w-full rounded-md border border-outline-variant/40 px-3 py-2 text-sm" value="${escapeHtml(prefs.estimateExpiryDays)}" />
                </label>
                <label class="flex items-center gap-2 text-sm"><input id="pref-confirm-before-issue" type="checkbox" class="h-4 w-4" ${prefs.confirmBeforeIssue ? 'checked' : ''} /> Confirmar antes de emitir</label>
                <label class="flex items-center gap-2 text-sm"><input id="pref-auto-preview" type="checkbox" class="h-4 w-4" ${prefs.autoOpenDocumentPreview ? 'checked' : ''} /> Abrir vista previa automaticamente</label>
            </div>
            <button type="button" id="pref-save-btn" class="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Guardar preferencias</button>
            <p id="pref-save-status" class="mt-2 hidden text-xs"></p>
        </div>`;
    const contentBySetting = {
        cuenta: devCard('Cuenta', 'Preferencias personales, perfil y seguridad local se agregaran a esta seccion.'),
        empresa: companySettingsBlock,
        preferencias: preferencesBlock,
        documentos: invoiceFormatBlock,
        impuestos: '<div id="config-fiscal-mount"></div>',
        pagos: shortcutCard('Pagos', 'Metodos de pago, cuentas por cobrar, vencimientos y conciliacion viven en Pagos y cobros.', 'Abrir pagos', 'pagos'),
        notas: devCard('Notas', 'Plantillas de notas para documentos y clientes estaran disponibles aqui.'),
        campos: devCard('Campos personalizados', 'Campos extra para clientes, productos y documentos se agregaran en esta seccion.'),
        roles: '<div id="config-roles-mount"></div>',
        correo: devCard('Correo', 'El envio por correo esta fuera del flujo actual de escritorio.'),
        archivos: devCard('PDF y almacenamiento', 'La exportacion PDF se guarda desde el dialogo del sistema. Almacenamiento avanzado se agregara despues.'),
        notificaciones: devCard('Notificaciones', 'En desarrollo.'),
        sistema: appSettingsBlock
    };
    dashboardContent.innerHTML = `
        ${renderModuleHeader('Configuracion', 'Ajustes de la empresa activa')}
        <div class="w-full xl:hidden">
            <select id="config-mobile-select" class="w-full rounded-md border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-sm">
                ${settingsMenu.map((m) => `<option value="${escapeHtml(m.key)}" ${activeSetting === m.key ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}
            </select>
        </div>
        <div class="flex gap-6">
            <aside class="hidden w-60 shrink-0 xl:block">
                <div class="rounded-lg border border-outline-variant/25 bg-surface-container-lowest p-2 shadow-sm">
                    ${settingsMenu
                        .map(
                            (m) => `
                        <button type="button" data-config-tab="${escapeHtml(m.key)}" class="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm ${
                                activeSetting === m.key ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container-low'
                            }">
                            <span class="material-symbols-outlined text-lg" aria-hidden="true">${escapeHtml(m.icon)}</span>
                            <span>${escapeHtml(m.label)}</span>
                        </button>`
                        )
                        .join('')}
                </div>
            </aside>
            <section class="min-w-0 flex-1">
                ${contentBySetting[activeSetting] || regionalBlock}
            </section>
        </div>`;
    if (activeSetting === 'roles') {
        await renderRolesModule({ embedded: true, mount: document.getElementById('config-roles-mount') });
    }
    if (activeSetting === 'impuestos') {
        await renderFiscalModule({ embedded: true, mount: document.getElementById('config-fiscal-mount') });
    }
    document.querySelectorAll('[data-config-tab]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            state.configUi = { ...state.configUi, tab: btn.getAttribute('data-config-tab') || 'empresa' };
            await renderConfigModule();
        });
    });
    document.getElementById('config-mobile-select')?.addEventListener('change', async (ev) => {
        state.configUi = { ...state.configUi, tab: ev.target.value || 'empresa' };
        await renderConfigModule();
    });
    document.querySelectorAll('[data-config-open]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const moduleKey = btn.getAttribute('data-config-open');
            if (moduleKey) void openModule(moduleKey);
        });
    });
    document.getElementById('company-save-btn')?.addEventListener('click', async () => {
        const st = document.getElementById('company-save-status');
        const clean = (id) => String(document.getElementById(id)?.value || '').trim() || null;
        const res = await dbUpdate({
            table: 'tenants',
            values: {
                display_name: clean('company-display-name'),
                legal_name: clean('company-legal-name'),
                tax_id: clean('company-tax-id'),
                email: clean('company-email'),
                phone: clean('company-phone'),
                address: clean('company-address'),
                updated_at: new Date().toISOString()
            },
            filters: [{ op: 'eq', column: 'id', value: tid }]
        });
        if (st) {
            st.classList.remove('hidden');
            st.textContent = res.error ? res.error.message || 'No se pudo guardar la empresa.' : 'Empresa guardada.';
            st.classList.toggle('text-error', Boolean(res.error));
            st.classList.toggle('text-primary', !res.error);
        }
        if (!res.error) await appendAuditLogSafe(tid, 'tenant_company_updated', 'tenants', tid, { section: 'company' });
    });
    document.getElementById('pref-save-btn')?.addEventListener('click', async () => {
        const st = document.getElementById('pref-save-status');
        const res = await tenantPreferencesUpsertViaDb(tid, {
            defaultModule: document.getElementById('pref-default-module')?.value || 'panel',
            interfaceDensity: document.getElementById('pref-density')?.value || 'comfortable',
            invoiceDueDays: Number(document.getElementById('pref-invoice-due-days')?.value || 30),
            estimateExpiryDays: Number(document.getElementById('pref-estimate-expiry-days')?.value || 15),
            confirmBeforeIssue: Boolean(document.getElementById('pref-confirm-before-issue')?.checked),
            autoOpenDocumentPreview: Boolean(document.getElementById('pref-auto-preview')?.checked)
        });
        const u = unwrapFnInvoke(res);
        if (st) {
            st.classList.remove('hidden');
            st.textContent = u.err || u.data?.error ? u.err || u.data.error : 'Preferencias guardadas.';
            st.classList.toggle('text-error', Boolean(u.err || u.data?.error));
            st.classList.toggle('text-primary', !u.err && !u.data?.error);
        }
        if (!u.err && !u.data?.error) {
            state.tenantPreferences = u.data?.settings || defaultTenantPreferencesObj();
            applyTenantPreferencesToDom();
        }
    });
    document.getElementById('reg-save-btn')?.addEventListener('click', async () => {
        const c = String(document.getElementById('reg-def-currency')?.value || '').trim().toUpperCase();
        const st = document.getElementById('reg-save-status');
        const res = await tenantContextUpsertViaDb(tid, {
            defaultCurrency: c || 'DOP',
            defaultLocale: 'es',
            priceDisplayCurrency: String(document.getElementById('reg-display-currency')?.value || '').trim().toUpperCase()
        });
        const u = unwrapFnInvoke(res);
        if (st) {
            st.classList.remove('hidden');
            st.textContent = u.err || u.data?.error ? u.err || u.data.error : tr('iso.saved');
            st.classList.toggle('text-error', Boolean(u.err || u.data?.error));
        }
        if (!u.err && u.data?.ok) {
            await loadTenantContext(tid);
            await renderSidebar();
            renderTenantContextBar();
        }
    });
    const setDocStatus = (msg, isErr) => {
        const el = document.getElementById('doc-branding-status');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
        el.classList.toggle('text-error', Boolean(isErr));
        el.classList.toggle('text-primary', !isErr && Boolean(msg));
    };
    const readLiveDocBranding = () => {
        const tplEl = document.querySelector('input[name="doc-template"]:checked');
        const liveBranding = {
            ...docSettings,
            templateId: tplEl?.value || docSettings.templateId,
            accentHex: document.getElementById('doc-accent')?.value || docSettings.accentHex,
            footerLegal: document.getElementById('doc-footer')?.value || '',
            companyDisplayName: document.getElementById('doc-company-name')?.value || '',
            showLineDiscounts: Boolean(document.getElementById('doc-show-disc')?.checked),
            logoDataUrl: document.getElementById('doc-logo-data')?.value?.trim() || docSettings.logoDataUrl
        };
        if (document.getElementById('doc-logo-removed')?.value === '1') liveBranding.logoDataUrl = '';
        return liveBranding;
    };
    const buildConfigPreviewHtml = () =>
        buildInvoiceDocumentHtml({
            invoice: previewInvoiceSample,
            lines: previewLineSample,
            customer: previewCustomerSample,
            tenant: tenantRow,
            branding: readLiveDocBranding(),
            fiscalTaxLabel,
            isDraft: false
        });
    const refreshDocInlinePreview = () => {
        const frame = document.getElementById('doc-preview-frame');
        if (frame) frame.srcdoc = buildConfigPreviewHtml();
    };
    document.getElementById('doc-logo-file')?.addEventListener('change', (ev) => {
        const f = ev.target.files?.[0];
        const rm = document.getElementById('doc-logo-removed');
        if (rm) rm.value = '';
        if (!f) return;
        if (f.size > 380000) {
            window.alert('Imagen demasiado grande; usa una por debajo de ~300 KB.');
            ev.target.value = '';
            return;
        }
        const r = new FileReader();
        r.onload = () => {
            const data = typeof r.result === 'string' ? r.result : '';
            const hid = document.getElementById('doc-logo-data');
            if (hid) hid.value = data;
            const pv = document.getElementById('doc-logo-preview');
                if (pv) {
                    const safe = data.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                    pv.innerHTML = `<img src="${safe}" class="max-h-16 max-w-[200px] object-contain" alt="" />`;
                }
                refreshDocInlinePreview();
            };
            r.readAsDataURL(f);
        });
        document.getElementById('doc-logo-clear')?.addEventListener('click', () => {
        const hid = document.getElementById('doc-logo-data');
        if (hid) hid.value = '';
        const rm = document.getElementById('doc-logo-removed');
        if (rm) rm.value = '1';
        const fi = document.getElementById('doc-logo-file');
        if (fi) fi.value = '';
            const pv = document.getElementById('doc-logo-preview');
            if (pv) pv.innerHTML = '<span class="text-xs text-on-surface-variant">Logo se quitara al guardar.</span>';
            refreshDocInlinePreview();
        });
    ['doc-accent', 'doc-company-name', 'doc-footer', 'doc-show-disc'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', refreshDocInlinePreview);
        el.addEventListener('change', refreshDocInlinePreview);
    });
    document.querySelectorAll('input[name="doc-template"]').forEach((el) => {
        el.addEventListener('change', refreshDocInlinePreview);
    });
    document.getElementById('doc-branding-save')?.addEventListener('click', async () => {
        const docPayload = readLiveDocBranding();
        if (document.getElementById('doc-logo-removed')?.value === '1') docPayload.logoDataUrl = null;
        else {
            const nd = document.getElementById('doc-logo-data')?.value?.trim();
            if (nd) docPayload.logoDataUrl = nd;
        }
        const res = await invoiceDocumentBrandingUpsertViaDb(tid, docPayload);
        const u = unwrapFnInvoke(res);
        if (u.err || u.data?.error) {
            setDocStatus(u.err || u.data?.error || 'Error al guardar', true);
            return;
        }
        setDocStatus('Formato guardado.', false);
    });
    document.getElementById('doc-preview-sample')?.addEventListener('click', async () => {
        refreshDocInlinePreview();
        openInvoiceDocumentPreview(buildConfigPreviewHtml(), false);
    });
    zyronLog('render:config:done', { rows: (rows || []).length });
};

const pushZyronModuleUrl = (moduleKey, opts = {}) => {
    if (opts.skipHistory) return;
    if (!moduleKey || moduleKey === 'pending-gate') return;
    try {
        const u = new URL(window.location.href);
        if (!opts.replaceHistory && u.searchParams.get('view') === moduleKey) return;
        u.searchParams.set('view', moduleKey);
        u.hash = '';
        const method = opts.replaceHistory ? 'replaceState' : 'pushState';
        history[method]({ view: moduleKey }, '', u.toString());
    } catch (_) {
        /* ignore */
    }
};

let zyronPopstateInstalled = false;
const installZyronPopstateNavigation = () => {
    if (zyronPopstateInstalled) return;
    zyronPopstateInstalled = true;
    window.addEventListener('popstate', () => {
        if (!viewDashboard || viewDashboard.classList.contains('hidden')) return;
        const v = getZyronViewFromUrl();
        if (!v || v === state.currentModule) return;
        void openModule(v, { skipHistory: true });
    });
};

const openModule = async (moduleKey, opts = {}) => {
    const requested = moduleKey;
    console.log('[Zyron:openModule]', { requested, isSuperAdmin: state.isSuperAdmin, pending: isTenantPendingApproval() });
    if (isTenantPendingApproval()) {
        zyronLog('openModule:blockedPendingGate', { requested });
        await renderPendingApprovalScreen();
        return;
    }
    if (state.isSuperAdmin) {
        const allow = new Set(state.navModulesSuper.map((m) => m.key));
        if (!allow.has(moduleKey)) {
            const fallback = state.navModulesSuper[0]?.key || 'empresas';
            zyronLog('openModule:superAdminRedirect', { from: moduleKey, to: fallback });
            moduleKey = fallback;
        }
    } else if (
        !state.isSuperAdmin &&
        (moduleKey === 'acceso' || moduleKey === 'usuarios' || moduleKey === 'solicitudes' || moduleKey === 'empresas')
    ) {
        zyronLog('openModule:superOnlyModule', { from: moduleKey });
        moduleKey = 'panel';
    } else if (!state.isSuperAdmin && moduleKey === 'roles') {
        zyronLog('openModule:rolesAsConfigTab', { from: moduleKey });
        state.configUi = { ...state.configUi, tab: 'roles' };
        moduleKey = 'config';
    } else if (!state.isSuperAdmin && moduleKey === 'fiscal') {
        zyronLog('openModule:fiscalAsConfigTab', { from: moduleKey });
        state.configUi = { ...state.configUi, tab: 'impuestos' };
        moduleKey = 'config';
    }
    state.currentModule = moduleKey;
    refreshSidebarSelection();
    await paintOutletFromFragment(moduleKey);
    pushZyronModuleUrl(moduleKey, opts);
    installZyronPopstateNavigation();
    zyronLog('openModule:route', { moduleKey });
    if (moduleKey === 'panel') return renderPanelModule();
    if (moduleKey === 'empresas') return renderEmpresasModule();
    if (moduleKey === 'solicitudes') return renderSolicitudesModule();
    if (moduleKey === 'acceso' || moduleKey === 'usuarios') return renderSuperAccessModule();
    if (moduleKey === 'roles') return renderRolesModule();
    if (moduleKey === 'facturas') return renderFacturasModule();
    if (moduleKey === 'presupuestos') return renderPresupuestosModule();
    if (moduleKey === 'fiscal') return renderFiscalModule();
    if (moduleKey === 'inventario') return renderInventarioModule();
    if (moduleKey === 'clientes') return renderClientesModule();
    if (moduleKey === 'pagos') return renderPagosModule();
    if (moduleKey === 'reportes') return renderReportesModule();
    if (moduleKey === 'config') return renderConfigModule();
    console.warn('[Zyron:openModule:unknown]', { moduleKey });
};

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus(loginStatus);
    const formData = new FormData(loginForm);
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');
    if (!email || !password) {
        setStatus(loginStatus, 'Debes completar correo y contraseña.', true);
        return;
    }

    zyronLog('login:submit', { email });
    const { data, error } = await safeCall(
        () => window.insforgeAPI.auth.signInWithPassword({ email, password }),
        'auth.signInWithPassword'
    );
    if (error || !data?.user) {
        zyronLog('login:signInError', { message: error?.message, hasUser: Boolean(data?.user) });
        setStatus(loginStatus, error?.message || 'No fue posible iniciar sesion.', true);
        return;
    }
    zyronLog('login:signInOk', { userId: data.user.id });

    const remember = Boolean(formData.get('remember'));
    try {
        if (remember) {
            localStorage.setItem(REMEMBER_EMAIL_KEY, email);
            localStorage.setItem(REMEMBER_PASSWORD_KEY, password);
        } else {
            localStorage.removeItem(REMEMBER_EMAIL_KEY);
            localStorage.removeItem(REMEMBER_PASSWORD_KEY);
        }
    } catch (_) {
        /* ignore */
    }

    const boot = await bootstrapSession();
    if (!boot.ok) {
        zyronLog('login:bootstrapFailed', { email, message: boot.message });
        setStatus(
            loginStatus,
            boot.message ||
                'No fue posible cargar tu perfil de aplicacion. Si tu cuenta es nueva, espera la aprobacion o revisa con un administrador.',
            true
        );
    }
});

openRegisterLink.addEventListener('click', (event) => {
    event.preventDefault();
    clearStatus(registerStatus);
    showRegister();
});

backToLoginLink.addEventListener('click', (event) => {
    event.preventDefault();
    clearStatus(registerStatus);
    showLogin();
});

registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus(registerStatus);

    const formData = new FormData(registerForm);
    const fullName = String(formData.get('fullName') || '').trim();
    const company = String(formData.get('company') || '').trim();
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const phone = String(formData.get('phone') || '').trim();
    const notes = String(formData.get('notes') || '').trim();
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');
    const passwordConfirm = String(formData.get('passwordConfirm') || '');

    if (username.length < 4) return setStatus(registerStatus, 'El usuario debe tener al menos 4 caracteres.', true);
    if (password.length < 8) return setStatus(registerStatus, 'La contraseña debe tener al menos 8 caracteres.', true);
    if (password !== passwordConfirm) return setStatus(registerStatus, 'Las contraseñas no coinciden.', true);
    if (!company || !email) return setStatus(registerStatus, 'Completa empresa y correo.', true);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return setStatus(registerStatus, 'Introduce un correo valido (ejemplo: usuario@dominio.com).', true);

    zyronLog('register:start', { email, company, username, phoneLen: phone.length, notesLen: notes.length });
    const { data: signUpData, error: signUpError } = await safeCall(
        () =>
            window.insforgeAPI.auth.signUp({
                email,
                password,
                name: fullName || username
            }),
        'auth.signUp'
    );
    if (signUpError) {
        zyronLog('register:signUpError', signUpError);
        return setStatus(registerStatus, signUpError.message || 'No se pudo registrar el usuario.', true);
    }

    const authId = signUpData?.user?.id;
    zyronLog('register:signUpOk', { authId, signUpEmail: signUpData?.user?.email });

    if (authId) {
        zyronLog('register:appUsersInsert', { authId, appStatus: 'pending', globalRole: 'user' });
        const { error: profileError } = await dbInsert({
            table: 'app_users',
            values: [{
                auth_user_id: authId,
                email,
                full_name: fullName || username,
                global_role: 'user',
                status: 'pending'
            }]
        });
        if (profileError) {
            zyronLog('register:appUsersInsertError', profileError);
            await safeCall(() => window.insforgeAPI.auth.signOut(), 'auth.signOut:registerRollbackProfile');
            return setStatus(registerStatus, profileError.message || 'No se pudo crear tu perfil de usuario.', true);
        }
        zyronLog('register:appUsersInsertOk', { authId });
    } else {
        zyronLog('register:noAuthIdAfterSignUp', { signUpDataKeys: signUpData ? Object.keys(signUpData) : [] });
    }

    if (authId) {
        zyronLog('register:accessRequestRpc', { function: 'submit_my_access_request' });
        const { error: rpcError } = await dbRpc('submit_my_access_request', {
            p_username: username,
            p_full_name: fullName || username,
            p_company_name: company,
            p_phone: phone,
            p_notes: notes
        });
        let requestError = rpcError;
        if (requestError) {
            zyronLog('register:accessRequestRpcError', requestError);
            zyronLog('register:accessRequestFallbackInsert', {});
            const fallback = await dbInsert({
                table: 'user_access_requests',
                values: [{
                    email,
                    requested_email: email,
                    username,
                    full_name: fullName,
                    company_name: company,
                    phone,
                    notes,
                    requested_role: 'tenant_admin',
                    status: 'pending',
                    request_status: 'pending',
                    request_payload: {
                        email,
                        username,
                        full_name: fullName || username,
                        company_name: company,
                        phone,
                        notes,
                        requested_owner: true
                    }
                }]
            });
            requestError = fallback.error || null;
            if (requestError) zyronLog('register:accessRequestFallbackError', requestError);
        }
        if (requestError) {
            zyronLog('register:rollbackAppUser', { authId });
            await dbDelete({
                table: 'app_users',
                filters: [{ op: 'eq', column: 'auth_user_id', value: authId }]
            });
            await safeCall(() => window.insforgeAPI.auth.signOut(), 'auth.signOut:registerRollbackRequest');
            const errMsg = String(requestError.message || '').toLowerCase();
            const hint = errMsg.includes('submit_my_access_request') || errMsg.includes('pgrst202') || errMsg.includes('could not find')
                ? ' Revisa en Insforge que existan las funciones RPC submit_my_access_request y register_insert_app_user.'
                : '';
            return setStatus(registerStatus, (requestError.message || 'No se pudo crear la solicitud de acceso.') + hint, true);
        }
        zyronLog('register:accessRequestOk', {});
    }

    await safeCall(() => window.insforgeAPI.auth.signOut(), 'auth.signOut:registerComplete');
    registerForm.reset();
    clearStatus(registerStatus);
    showLogin();
    zyronLog('register:complete', { authId });
    setStatus(
        loginStatus,
        'Registro recibido. Tu cuenta queda en estado pendiente hasta que un administrador apruebe la solicitud. Inicia sesion cuando te confirmen.',
        false
    );
});

const performLogout = async () => {
    zyronLog('logout:start', {});
    await safeCall(() => window.insforgeAPI.auth.signOut(), 'auth.signOut:logout');
    if (state._rtTenantChannel) {
        await safeCall(
            () => window.insforgeAPI.realtime.unsubscribe(state._rtTenantChannel),
            'realtime.unsubscribe:tenant:logout'
        );
        state._rtTenantChannel = null;
    }
    state.sessionUser = null;
    state.appUser = null;
    state.membership = null;
    state.membershipsList = [];
    state.tenantContext = { defaultCurrency: 'DOP', defaultLocale: 'es', priceDisplayCurrency: null };
    try {
        localStorage.removeItem(LAST_TENANT_KEY);
    } catch (_) {
        /* */
    }
    state.currentTenantId = null;
    state.isSuperAdmin = false;
    state.currentModule = 'panel';
    state.navModulesSuper = [...DEFAULT_NAV_SUPER];
    state.navModulesTenant = [...DEFAULT_NAV_TENANT];
    state.permissionRowsForUi = [...DEFAULT_PERMISSION_UI];
    state.roleSystemPresetsResolved = [...DEFAULT_ROLE_SYSTEM_PRESETS];
    state.rolesContextTenantId = null;
    sidebarNav.classList.remove('hidden');
    sidebarToggleBtn?.classList.remove('pointer-events-none', 'opacity-40');
    dashboardAppHeader?.classList.remove('hidden');
    updateSessionNoticeBanner();
    renderTenantContextBar();
    clearStatus(loginStatus);
    showLogin();
    zyronLog('logout:done', {});
};

logoutBtn.addEventListener('click', () => performLogout());

sidebarToggleBtn.addEventListener('click', () => {
    sidebarNav.classList.toggle('hidden');
    updateSidebarToggleState();
});
updateSidebarToggleState();

(async () => {
    console.log('[Zyron:startup] DOM script init');
    clearStatus(loginStatus);
    clearStatus(registerStatus);
    const boot = await bootstrapSession();
    console.log('[Zyron:startup] bootstrapSession', boot);
    if (!boot.ok) showLogin();
})();
