module.exports = async function (request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await request.json()
    const { requestId, action, tenantSlug, maxUsers = 5 } = body

    if (!requestId || !action || !['approve', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const authHeader = request.headers.get('Authorization')
    const userToken = authHeader ? authHeader.replace('Bearer ', '') : null

    const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
    const dataApiBase = Deno.env.get('INSFORGE_INTERNAL_URL') || baseUrl
    const serviceKey =
      Deno.env.get('INSFORGE_SERVICE_ROLE_KEY') ||
      Deno.env.get('INSFORGE_SERVICE_KEY') ||
      Deno.env.get('API_KEY') ||
      Deno.env.get('INSFORGE_API_KEY')
    if (!baseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({
          error:
            'Server misconfigured: set INSFORGE_BASE_URL and an elevated key on the function (API_KEY, INSFORGE_API_KEY, or INSFORGE_SERVICE_ROLE_KEY) so updates to other users are not blocked by RLS.'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const sdkMod = await import('npm:@insforge/sdk')
    const userClient = sdkMod.createClient({
      baseUrl,
      edgeFunctionToken: userToken
    })
    const db = sdkMod.createClient({
      baseUrl: dataApiBase,
      anonKey: serviceKey
    })

    const { data: currentUserResult } = await userClient.auth.getCurrentUser()
    const currentUser = currentUserResult?.user
    if (!currentUser?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const authUserId = String(currentUser.id)

    const { data: appUserRows, error: appUserError } = await db.database
      .from('app_users')
      .select('*')
      .eq('auth_user_id', authUserId)
      .limit(1)

    if (appUserError || !appUserRows?.length || appUserRows[0].global_role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const reviewer = appUserRows[0]

    const { data: requestRows, error: requestError } = await db.database
      .from('user_access_requests')
      .select('*')
      .eq('id', requestId)
      .limit(1)

    if (requestError || !requestRows?.length) {
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const accessRequest = requestRows[0]

    if (action === 'approve' && accessRequest.request_status && accessRequest.request_status !== 'pending') {
      return new Response(JSON.stringify({ error: 'La solicitud ya no esta pendiente' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'reject') {
      const { error: rejectErr } = await db.database
        .from('user_access_requests')
        .update({
          request_status: 'rejected',
          reviewed_by: reviewer.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: body.reason || 'Rejected by super admin'
        })
        .eq('id', requestId)

      if (rejectErr) {
        return new Response(JSON.stringify({ error: rejectErr.message || 'Reject failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ ok: true, status: 'rejected' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const requestedEmail = String(accessRequest.requested_email || '').trim().toLowerCase()
    const { data: targetRows, error: targetLookupError } = await db.database
      .from('app_users')
      .select('*')
      .eq('email', requestedEmail)
      .limit(1)

    if (targetLookupError || !targetRows?.length) {
      return new Response(
        JSON.stringify({
          error:
            'No hay un perfil app_users con el correo de esta solicitud. El usuario debe registrarse con el mismo correo antes de aprobar.'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const target = targetRows[0]

    const slugBase = (tenantSlug || accessRequest.company_name || 'tenant')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48)
    const slugSuffix = String(requestId).replace(/-/g, '').slice(0, 12)
    const uniqueSlug = slugBase ? `${slugBase}-${slugSuffix}` : `tenant-${slugSuffix}`

    const { data: tenantRows, error: tenantError } = await db.database
      .from('tenants')
      .insert({
        slug: uniqueSlug,
        legal_name: accessRequest.company_name,
        display_name: accessRequest.company_name,
        max_users: maxUsers
      })
      .select('*')

    if (tenantError || !tenantRows?.length) {
      return new Response(JSON.stringify({ error: tenantError?.message || 'Unable to create tenant' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const tenant = tenantRows[0]
    const rolePresets = [
      { role_key: 'tenant_admin', label: 'Admin empresa', hierarchy_level: 10 },
      { role_key: 'manager', label: 'Gerente', hierarchy_level: 20 },
      { role_key: 'billing_agent', label: 'Facturacion', hierarchy_level: 30 },
      { role_key: 'inventory_agent', label: 'Inventario', hierarchy_level: 40 },
      { role_key: 'viewer', label: 'Solo lectura', hierarchy_level: 50 }
    ]

    for (const preset of rolePresets) {
      const { error: roleErr } = await db.database.from('role_catalog').insert({
        tenant_id: tenant.id,
        role_key: preset.role_key,
        label: preset.label,
        hierarchy_level: preset.hierarchy_level,
        is_system: true
      })
      if (roleErr) {
        return new Response(JSON.stringify({ error: roleErr.message || 'role_catalog insert failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    const { data: existingMembership } = await db.database
      .from('tenant_memberships')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('app_user_id', target.id)
      .limit(1)

    if (existingMembership?.length) {
      const { error: memUpdErr } = await db.database
        .from('tenant_memberships')
        .update({ role_key: 'tenant_admin', status: 'active', is_owner: true })
        .eq('id', existingMembership[0].id)
      if (memUpdErr) {
        return new Response(JSON.stringify({ error: memUpdErr.message || 'Membership update failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      const { error: memInsErr } = await db.database.from('tenant_memberships').insert({
        tenant_id: tenant.id,
        app_user_id: target.id,
        role_key: 'tenant_admin',
        is_owner: true,
        status: 'active'
      })
      if (memInsErr) {
        return new Response(JSON.stringify({ error: memInsErr.message || 'Membership insert failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    async function patchAppUserStatus(nextStatus) {
      return db.database.from('app_users').update({ status: nextStatus }).eq('id', target.id).select('id,status')
    }

    let appUserRowsOut = null
    let appUserUpdErr = null
    ;({ data: appUserRowsOut, error: appUserUpdErr } = await patchAppUserStatus('approved'))
    if (appUserUpdErr || !appUserRowsOut?.length) {
      ;({ data: appUserRowsOut, error: appUserUpdErr } = await patchAppUserStatus('active'))
    }
    if (appUserUpdErr) {
      return new Response(JSON.stringify({ error: appUserUpdErr.message || 'app_users update failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!appUserRowsOut || !appUserRowsOut.length) {
      return new Response(
        JSON.stringify({
          error:
            'app_users no se actualizo (0 filas). Suele ser RLS o CHECK de status. Revise politicas para la clave API / service role y que status permita approved o active.'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { data: reqRowsOut, error: reqUpdErr } = await db.database
      .from('user_access_requests')
      .update({
        request_status: 'approved',
        reviewed_by: reviewer.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select('id,request_status')
    if (reqUpdErr) {
      return new Response(JSON.stringify({ error: reqUpdErr.message || 'user_access_requests update failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!reqRowsOut?.length) {
      return new Response(
        JSON.stringify({ error: 'user_access_requests: actualizacion sin filas (id no coincide o RLS).' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { error: auditErr } = await db.database.from('audit_logs').insert({
      tenant_id: tenant.id,
      actor_user_id: reviewer.id,
      action: 'request_approved',
      target_type: 'user_access_requests',
      target_id: requestId,
      details: {
        requested_email: accessRequest.requested_email,
        tenant_id: tenant.id
      }
    })
    if (auditErr) {
      return new Response(JSON.stringify({ error: auditErr.message || 'audit_logs insert failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      status: 'approved',
      tenantId: tenant.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}
