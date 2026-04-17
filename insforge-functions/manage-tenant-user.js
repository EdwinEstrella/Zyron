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
    const { tenantId, targetEmail, roleKey = 'staff', action = 'upsert', status = 'active' } = body

    if (!tenantId || !targetEmail) {
      return new Response(JSON.stringify({ error: 'tenantId and targetEmail are required' }), {
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
    if (!appRows?.length) {
      return new Response(JSON.stringify({ error: 'App user profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const actor = appRows[0]
    const isSuperAdmin = actor.global_role === 'super_admin'

    let hasTenantAdminAccess = false
    if (!isSuperAdmin) {
      const { data: membershipRows } = await client.database
        .from('tenant_memberships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('app_user_id', actor.id)
        .eq('status', 'active')
        .limit(1)

      hasTenantAdminAccess = Boolean(membershipRows?.length) && ['tenant_admin'].includes(membershipRows[0].role_key)
    }

    if (!isSuperAdmin && !hasTenantAdminAccess) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: tenantRows } = await client.database
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .limit(1)

    if (!tenantRows?.length) {
      return new Response(JSON.stringify({ error: 'Tenant not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const tenant = tenantRows[0]
    if (tenant.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Tenant is not active' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: activeMemberships, count: activeMembersCount } = await client.database
      .from('tenant_memberships')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('status', 'active')

    if (action === 'upsert' && tenant.allow_more_users === false && (activeMembersCount || 0) >= tenant.max_users) {
      return new Response(JSON.stringify({ error: 'User limit reached for tenant' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const normalizedEmail = String(targetEmail).toLowerCase()
    const { data: targetRows } = await client.database
      .from('app_users')
      .select('*')
      .eq('email', normalizedEmail)
      .limit(1)

    if (!targetRows?.length) {
      return new Response(JSON.stringify({ error: 'Target user must complete sign up first' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const target = targetRows[0]
    const { data: existingMembership } = await client.database
      .from('tenant_memberships')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('app_user_id', target.id)
      .limit(1)

    if (action === 'suspend' && existingMembership?.length) {
      await client.database
        .from('tenant_memberships')
        .update({ status: 'suspended' })
        .eq('id', existingMembership[0].id)
    } else if (action === 'upsert') {
      if (existingMembership?.length) {
        await client.database
          .from('tenant_memberships')
          .update({ role_key: roleKey, status })
          .eq('id', existingMembership[0].id)
      } else {
        await client.database
          .from('tenant_memberships')
          .insert({
            tenant_id: tenantId,
            app_user_id: target.id,
            role_key: roleKey,
            status
          })
      }
    } else if (action === 'activate' && existingMembership?.length) {
      await client.database
        .from('tenant_memberships')
        .update({ status: 'active' })
        .eq('id', existingMembership[0].id)
    }

    await client.database
      .from('audit_logs')
      .insert({
        tenant_id: tenantId,
        actor_user_id: actor.id,
        action: `user_${action}`,
        target_type: 'app_users',
        target_id: target.id,
        details: { roleKey, targetEmail: normalizedEmail }
      })

    return new Response(JSON.stringify({
      ok: true,
      activeMembersCount: activeMemberships?.length || activeMembersCount || 0
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
