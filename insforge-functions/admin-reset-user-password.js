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
    const { tenantId, targetEmail, reason = 'Admin requested reset' } = body
    if (!targetEmail) {
      return new Response(JSON.stringify({ error: 'targetEmail is required' }), {
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

    const { data: actorRows } = await client.database
      .from('app_users')
      .select('*')
      .eq('auth_user_id', currentUser.id)
      .limit(1)
    if (!actorRows?.length) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const actor = actorRows[0]

    const isSuperAdmin = actor.global_role === 'super_admin'
    let tenantAdminAccess = false
    if (!isSuperAdmin && tenantId) {
      const { data: membershipRows } = await client.database
        .from('tenant_memberships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('app_user_id', actor.id)
        .eq('status', 'active')
        .limit(1)
      tenantAdminAccess = Boolean(membershipRows?.length) && membershipRows[0].role_key === 'tenant_admin'
    }

    if (!isSuperAdmin && !tenantAdminAccess) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: targetRows } = await client.database
      .from('app_users')
      .select('*')
      .eq('email', String(targetEmail).toLowerCase())
      .limit(1)

    if (!targetRows?.length) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const target = targetRows[0]

    await client.database
      .from('app_users')
      .update({ must_reset_password: true })
      .eq('id', target.id)

    await client.database
      .from('user_password_resets')
      .insert({
        tenant_id: tenantId || null,
        target_user_id: target.id,
        requested_by: actor.id,
        reason
      })

    await client.auth.sendResetPasswordEmail({
      email: target.email
    })

    return new Response(JSON.stringify({
      ok: true,
      message: 'Reset password email sent'
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
