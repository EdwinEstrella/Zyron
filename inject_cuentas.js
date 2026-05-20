const fs = require('fs')
let html = fs.readFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', 'utf8')

// 1. Add sidebar menu item
const sidebarHTML = `<button type="button" data-nav="reportes" class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-on-surface/5 focus:bg-on-surface/5 focus:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <span class="material-symbols-outlined text-[1.25rem] text-on-surface-variant/70" aria-hidden="true">bar_chart</span>
                    Reportes
                </button>`

const newSidebarHTML =
  sidebarHTML +
  `\n                <button type="button" data-nav="cuentas_contables" class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-on-surface/5 focus:bg-on-surface/5 focus:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <span class="material-symbols-outlined text-[1.25rem] text-on-surface-variant/70" aria-hidden="true">account_balance_wallet</span>
                    Cuentas contables
                </button>`

html = html.replace(sidebarHTML, newSidebarHTML)

// 2. Add the module object definition and router logic
const routerLogic = `const OPEN_MODULES_MAP = {
    panel: renderPanelModule,
    empresas: renderEmpresasModule,
    solicitudes: renderSolicitudesModule,
    acceso: renderAccesoModule,
    roles: renderRolesModule,
    clientes: renderClientesModule,
    productos: renderProductosModule,
    facturas: renderFacturasModule,
    presupuestos: renderPresupuestosModule,
    pagos: renderPagosModule,
    reportes: renderReportesModule,
    configuracion: renderConfiguracionModule
};`

const newRouterLogic = `const OPEN_MODULES_MAP = {
    panel: renderPanelModule,
    empresas: renderEmpresasModule,
    solicitudes: renderSolicitudesModule,
    acceso: renderAccesoModule,
    roles: renderRolesModule,
    clientes: renderClientesModule,
    productos: renderProductosModule,
    facturas: renderFacturasModule,
    presupuestos: renderPresupuestosModule,
    pagos: renderPagosModule,
    reportes: renderReportesModule,
    cuentas_contables: renderCuentasContablesModule,
    configuracion: renderConfiguracionModule
};`

html = html.replace(routerLogic, newRouterLogic)

// 3. Add the renderCuentasContablesModule function itself
const moduleCode = `const renderCuentasContablesModule = async () => {
    paintDashboardSkeleton('cuentas_contables');
    state.currentModule = 'cuentas_contables';
    dashboardContent.innerHTML = '<div class="p-6 text-center text-sm text-on-surface-variant">Cargando cuentas contables...</div>';
    
    if (!state.currentTenantId) {
        dashboardContent.innerHTML = emptyStateContainer('business_center', 'Selecciona una empresa', 'Debes estar operando bajo una empresa para ver sus cuentas contables.');
        return;
    }

    const { data: accounts, error } = await dbSelect({
        table: 'accounting_accounts',
        filters: [{ op: 'eq', column: 'tenant_id', value: state.currentTenantId }],
        order: { column: 'code', ascending: true },
        limit: 1000
    });

    if (error) {
        dashboardContent.innerHTML = emptyStateContainer('error', 'Error al cargar', 'No se pudieron cargar las cuentas contables. Asegúrate de haber ejecutado el script SQL.');
        return;
    }

    if (!accounts || accounts.length === 0) {
        dashboardContent.innerHTML = \`<div class="p-6 max-w-4xl mx-auto">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h2 class="text-2xl font-bold tracking-tight text-on-surface">Cuentas Contables</h2>
                    <p class="text-sm text-on-surface-variant mt-1">Nomenclatura y plan de cuentas para tu empresa.</p>
                </div>
            </div>
            \${emptyStateContainer('account_tree', 'Sin cuentas contables', 'No tienes cuentas configuradas. Puedes inicializar la nomenclatura estándar o crearlas manualmente.')}
            <div class="mt-4 flex justify-center">
                <button type="button" id="btn-init-accounts" class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90">
                    Inicializar Nomenclatura Estándar
                </button>
            </div>
        </div>\`;

        setTimeout(() => {
            document.getElementById('btn-init-accounts')?.addEventListener('click', async () => {
                // Fetch the text file and parse it
                try {
                    const response = await fetch('/Nomenclatura-de-Cuentas.txt');
                    const text = await response.text();
                    
                    // Simple parser for 1.1.1 Format
                    const lines = text.split('\\n');
                    const values = [];
                    const codeRegex = /^(\\d+(?:\\.\\d+)*)\\s+(.*)$/;
                    
                    for (const line of lines) {
                        const m = line.trim().match(codeRegex);
                        if (m) {
                            let type = 'expense';
                            if (m[1].startsWith('1.')) type = 'asset';
                            else if (m[1].startsWith('2.')) type = 'liability';
                            else if (m[1].startsWith('3.')) type = 'equity';
                            else if (m[1].startsWith('4.')) type = 'revenue';
                            
                            values.push({
                                tenant_id: state.currentTenantId,
                                code: m[1],
                                name: m[2].trim(),
                                account_type: type
                            });
                        }
                    }

                    if (values.length > 0) {
                        document.getElementById('btn-init-accounts').textContent = 'Insertando...';
                        document.getElementById('btn-init-accounts').disabled = true;
                        
                        // Insert in chunks of 50 to avoid payload limits
                        for(let i = 0; i < values.length; i += 50) {
                             const chunk = values.slice(i, i + 50);
                             await dbInsert({ table: 'accounting_accounts', values: chunk });
                        }
                        await renderCuentasContablesModule();
                    }
                } catch(e) {
                    console.error('Error init accounts', e);
                    alert('Error inicializando cuentas: ' + e.message);
                }
            });
        }, 100);
        return;
    }

    const rowsHtml = accounts.map(acc => \`
        <tr class="border-b border-outline-variant/30 hover:bg-on-surface/5">
            <td class="whitespace-nowrap px-4 py-3 font-medium text-on-surface">\${escapeHtml(acc.code)}</td>
            <td class="px-4 py-3 text-on-surface">\${escapeHtml(acc.name)}</td>
            <td class="px-4 py-3 text-on-surface-variant">\${escapeHtml(acc.account_type)}</td>
            <td class="px-4 py-3 text-right">
                <button type="button" class="text-primary hover:text-primary/80">Editar</button>
            </td>
        </tr>
    \`).join('');

    dashboardContent.innerHTML = \`<div class="p-6 max-w-6xl mx-auto">
        <div class="flex items-center justify-between mb-8">
            <div>
                <h2 class="text-2xl font-bold tracking-tight text-on-surface">Cuentas Contables</h2>
                <p class="text-sm text-on-surface-variant mt-1">Nomenclatura y plan de cuentas para tu empresa.</p>
            </div>
            <button type="button" class="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary/90 shadow-sm">
                <span class="material-symbols-outlined text-[1.125rem]" aria-hidden="true">add</span>
                Nueva cuenta
            </button>
        </div>
        <div class="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
            <table class="w-full min-w-[800px] text-left text-sm">
                <thead class="bg-surface-container-low/50">
                    <tr class="border-b border-outline-variant/30 text-on-surface-variant">
                        <th class="px-4 py-3 font-semibold">Código</th>
                        <th class="px-4 py-3 font-semibold">Nombre de la cuenta</th>
                        <th class="px-4 py-3 font-semibold">Tipo</th>
                        <th class="px-4 py-3 text-right font-semibold">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    \${rowsHtml}
                </tbody>
            </table>
        </div>
    </div>\`;
};

`

html = html.replace(
  'const renderPanelModule = async () => {',
  moduleCode + '\nconst renderPanelModule = async () => {'
)

// 4. Update allowed tenant modules list
const allowedModules = `const superOnly = new Set(['acceso', 'roles', 'solicitudes', 'empresas']);`
// It seems there's no explicit list of allowed modules, it just filters out superOnly.
// However, the module skeleton label needs it.
const skeletonLabels = `reportes: 'Reportes',
            configuracion: 'Configuracion'`
const newSkeletonLabels = `reportes: 'Reportes',
            cuentas_contables: 'Cuentas contables',
            configuracion: 'Configuracion'`

html = html.replace(skeletonLabels, newSkeletonLabels)

fs.writeFileSync('c:/Users/Asistente/Desktop/Nueva_carpeta/Zyron/renderer.js', html, 'utf8')
console.log('Cuentas contables module injected successfully!')
