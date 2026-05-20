import { createClient } from 'npm:@insforge/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

const slugifyTenant = (text) => {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '-');
};

const countryCatalog = {
  AR: {
    code: 'AR',
    currency: 'ARS',
    taxLabel: 'IVA',
    defaultTaxRate: 21,
    ncfEnabled: false,
    authorityLabel: 'ARCA / AFIP',
    fiscalIdLabel: 'CUIT',
    taxRates: [
      { code: 'iva_21', label: 'IVA tasa general 21%', rate_percent: 21, sort_order: 10, is_default: true },
      { code: 'iva_105', label: 'IVA tasa reducida 10.5%', rate_percent: 10.5, sort_order: 20, is_default: false },
      { code: 'iva_27', label: 'IVA tasa incrementada 27%', rate_percent: 27, sort_order: 30, is_default: false },
      { code: 'exento', label: 'Exento 0%', rate_percent: 0, sort_order: 40, is_default: false }
    ]
  },
  DO: {
    code: 'DO',
    currency: 'DOP',
    taxLabel: 'ITBIS',
    defaultTaxRate: 18,
    ncfEnabled: true,
    authorityLabel: 'DGII',
    fiscalIdLabel: 'RNC',
    taxRates: [
      { code: 'itbis_18', label: 'ITBIS tasa general 18%', rate_percent: 18, sort_order: 10, is_default: true },
      { code: 'itbis_16', label: 'ITBIS tasa reducida 16%', rate_percent: 16, sort_order: 20, is_default: false },
      { code: 'exento', label: 'Exento 0%', rate_percent: 0, sort_order: 30, is_default: false }
    ]
  }
};

const normalizeBillingCountryCode = (value) => {
  const code = String(value || '').trim().toUpperCase();
  return countryCatalog[code] ? code : null;
};

const currentAppUserId = async (client, token) => {
  if (!token) return null;
  const userClient = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    edgeFunctionToken: token
  });
  const { data } = await userClient.auth.getCurrentUser();
  const authId = data?.user?.id;
  if (!authId) return null;
  const { data: rows } = await userClient.database
    .from('app_users')
    .select('id')
    .eq('auth_user_id', authId)
    .limit(1);
  return rows?.[0]?.id || null;
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') || null;
    
    // Admin client bypasses RLS
    // Using INSFORGE_API_KEY if available, else falling back to environment's JWT_SECRET or generic error to find out
    const adminKey = Deno.env.get('INSFORGE_API_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('API_KEY');
    
    if (!adminKey) {
      return json({ error: 'Falta llave de admin en el entorno: ' + Object.keys(Deno.env.toObject()).join(',') }, 500);
    }
    
    const adminClient = createClient({
      baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
      edgeFunctionToken: adminKey
    });
    
    const bodyText = await req.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (err) {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    
    const { requestId, action } = body;
    
    if (!requestId || !action) {
      return json({ error: 'Faltan parametros requeridos (requestId, action)' }, 400);
    }
    
    const actorId = await currentAppUserId(adminClient, token); 

    const { data: reqRows, error: reqErr } = await adminClient.database
      .from('user_access_requests')
      .select('*')
      .eq('id', requestId)
      .limit(1);
      
    if (reqErr || !reqRows?.length) {
      return json({ error: reqErr?.message || 'Solicitud no encontrada.' }, 404);
    }
    
    const request = reqRows[0];
    const now = new Date().toISOString();
    
    if (action === 'reject') {
      const { error: updErr } = await adminClient.database
        .from('user_access_requests')
        .update({
          status: 'rejected',
          request_status: 'rejected',
          updated_at: now,
          reviewed_by: actorId
        })
        .eq('id', requestId)
        .select();
        
      if (updErr) return json({ error: updErr.message }, 500);
      return json({ ok: true, action: 'reject' });
    }
    
    if (action !== 'approve') {
      return json({ error: 'Accion invalida.' }, 400);
    }
    
    const email = String(request.requested_email || request.email || request.request_payload?.email || '').trim().toLowerCase();
    if (!email) return json({ error: 'La solicitud no tiene correo.' }, 400);
    
    const fullName = request.full_name || request.username || request.request_payload?.username || email.split('@')[0];
    const companyName = request.company_name || request.request_payload?.company_name || 'Empresa';
    const billingCountryCode = normalizeBillingCountryCode(
      request.billing_country_code || request.request_payload?.billing_country_code || request.request_payload?.billingCountryCode
    );
    if (!billingCountryCode) return json({ error: 'La solicitud no tiene pais de facturacion.' }, 400);
    const country = countryCatalog[billingCountryCode];
    
    // Find or create app_user
    let { data: appRows } = await adminClient.database
      .from('app_users')
      .select('*')
      .eq('email', email)
      .limit(1);
      
    let appUser = appRows?.[0] || null;
    
    if (!appUser) {
      const { data: insRows, error: insErr } = await adminClient.database
        .from('app_users')
        .insert([{
          email,
          full_name: fullName,
          global_role: 'user',
          status: 'active'
        }])
        .select();
        
      if (insErr || !insRows?.length) return json({ error: insErr?.message || 'No se pudo crear app_user.' }, 500);
      appUser = insRows[0];
    } else {
      const { data: updRows, error: updErr } = await adminClient.database
        .from('app_users')
        .update({
          full_name: appUser.full_name || fullName,
          global_role: 'user',
          status: 'active',
          updated_at: now
        })
        .eq('id', appUser.id)
        .select();
        
      if (updErr) return json({ error: updErr.message }, 500);
      appUser = updRows?.[0] || appUser;
    }
    
    // Create tenant
    const slug = `${slugifyTenant(companyName)}-${Date.now().toString(36)}`;
    const { data: tenRows, error: tenErr } = await adminClient.database
      .from('tenants')
      .insert([{
        slug,
        display_name: companyName,
        legal_name: companyName,
        email,
        billing_country_code: billingCountryCode,
        status: 'active',
        created_by: appUser.id
      }])
      .select();
      
    if (tenErr || !tenRows?.length) return json({ error: tenErr?.message || 'No se pudo crear empresa.' }, 500);
    const tenant = tenRows[0];

    await adminClient.database
      .from('tenant_fiscal_settings')
      .insert([{
        tenant_id: tenant.id,
        country_code: country.code,
        tax_label: country.taxLabel,
        default_tax_rate: country.defaultTaxRate,
        prices_tax_inclusive: false,
        ncf_enabled: country.ncfEnabled,
        electronic_invoicing_requested: false,
        updated_at: now
      }])
      .select();

    const tenantContext = {
      version: 1,
      defaultCurrency: country.currency,
      defaultLocale: 'es',
      priceDisplayCurrency: null,
      billingCountryCode: country.code,
      taxLabel: country.taxLabel,
      defaultTaxRate: country.defaultTaxRate,
      ncfEnabled: country.ncfEnabled,
      authorityLabel: country.authorityLabel,
      fiscalIdLabel: country.fiscalIdLabel
    };

    await adminClient.database
      .from('app_settings')
      .insert([{
        tenant_id: tenant.id,
        setting_key: 'zyron_tenant_context',
        setting_value: JSON.stringify(tenantContext),
        value: tenantContext,
        updated_at: now
      }])
      .select();

    for (const rate of country.taxRates) {
      await adminClient.database
        .from('tax_rates_catalog')
        .insert([{ tenant_id: tenant.id, ...rate, is_active: true }])
        .select();
    }
    
    // Create tenant membership
    const { error: memErr } = await adminClient.database
      .from('tenant_memberships')
      .insert([{
        tenant_id: tenant.id,
        app_user_id: appUser.id,
        role_key: 'tenant_admin',
        status: 'active',
        is_owner: true
      }])
      .select();
      
    if (memErr) return json({ error: memErr.message }, 500);
    
    // Update request
    const { error: reqUpdErr } = await adminClient.database
      .from('user_access_requests')
      .update({ 
        status: 'approved', 
        request_status: 'approved', 
        reviewed_by: actorId, 
        updated_at: now 
      })
      .eq('id', requestId)
      .select();
      
    if (reqUpdErr) return json({ error: reqUpdErr.message }, 500);
    
    // Create audit log
    await adminClient.database
      .from('audit_logs')
      .insert([{
        tenant_id: tenant.id,
        actor_user_id: actorId || appUser.id,
        action: 'access_request_approved',
        target_type: 'user_access_requests',
        target_id: requestId,
        details: { email, app_user_id: appUser.id, tenant_id: tenant.id }
      }])
      .select();
      
    return json({ ok: true, tenant, appUser });
    
  } catch (error) {
    return json({ error: error.message || String(error), stack: error.stack }, 500);
  }
}
