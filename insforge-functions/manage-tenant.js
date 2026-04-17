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
    const { tenantId, action } = body

    if (!tenantId || !action) {
      return new Response(JSON.stringify({ error: 'tenantId and action are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const authHeader = request.headers.get('Authorization')
    const userToken = authHeader ? authHeader.replace('Bearer ', '') : null
    const sdkMod = await import('npm:@insforge/sdk')
    const client = sdkMod.createClient({
      baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
      edgeFunctionToken: userToken
    })

    const { data: currentUserResult } = await client.auth.getCurrentUser()
    const currentUser = currentUserResult?.user
    if (!currentUser?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: appRows } = await client.database
      .from('app_users')
      .select('*')
      .eq('auth_user_id', currentUser.id)
      .limit(1)

    if (!appRows?.length || appRows[0].global_role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const actor = appRows[0]
    const updatePayload = {}
    if (action === 'block') {
      updatePayload.status = 'blocked'
      updatePayload.blocked_at = new Date().toISOString()
      updatePayload.blocked_reason = body.reason || 'Blocked by super admin'
    } else if (action === 'unblock') {
      updatePayload.status = 'active'
      updatePayload.blocked_at = null
      updatePayload.blocked_reason = null
    } else if (action === 'set_user_limit') {
      updatePayload.max_users = Number(body.maxUsers || 1)
      updatePayload.allow_more_users = Boolean(body.allowMoreUsers)
    } else if (action === 'update_profile') {
      const displayName = String(body.displayName || '').trim()
      const legalName = String(body.legalName || '').trim()
      let slug = String(body.slug || '').trim().toLowerCase()
      slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      if (!displayName || !legalName || !slug) {
        return new Response(JSON.stringify({ error: 'displayName, legalName and slug are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      updatePayload.display_name = displayName
      updatePayload.legal_name = legalName
      updatePayload.slug = slug
      updatePayload.max_users = Number(body.maxUsers || 1)
      updatePayload.allow_more_users = Boolean(body.allowMoreUsers)
    } else {
      return new Response(JSON.stringify({ error: 'Unsupported action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: tenantRows, error: tenantError } = await client.database
      .from('tenants')
      .update(updatePayload)
      .eq('id', tenantId)
      .select('*')

    if (tenantError || !tenantRows?.length) {
      return new Response(JSON.stringify({ error: tenantError?.message || 'Tenant not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await client.database
      .from('audit_logs')
      .insert({
        tenant_id: tenantId,
        actor_user_id: actor.id,
        action: `tenant_${action}`,
        target_type: 'tenants',
        target_id: tenantId,
        details: body
      })

    return new Response(JSON.stringify({ ok: true, tenant: tenantRows[0] }), {
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
