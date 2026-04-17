module.exports = async function (request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
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

    const [tenantsResult, usersRpc, requestsRpc, blockedResult] = await Promise.all([
      client.database.from('tenants').select('*'),
      client.database.rpc('super_admin_list_app_users'),
      client.database.rpc('super_admin_list_user_access_requests'),
      client.database.from('tenants').select('*').eq('status', 'blocked')
    ])

    const asRows = (rpc) => (Array.isArray(rpc.data) ? rpc.data : (rpc.data ? [rpc.data] : []))

    let usersRows = asRows(usersRpc)
    if (usersRpc.error) {
      const fb = await client.database.from('app_users').select('*')
      usersRows = Array.isArray(fb.data) ? fb.data : []
    }

    let requestsRows = asRows(requestsRpc)
    if (requestsRpc.error) {
      const fb = await client.database.from('user_access_requests').select('*')
      requestsRows = Array.isArray(fb.data) ? fb.data : []
    }
    const pendingRequests = (requestsRows || []).filter((r) => r.request_status === 'pending')

    return new Response(JSON.stringify({
      ok: true,
      metrics: {
        totalTenants: tenantsResult.data?.length || 0,
        totalUsers: usersRows.length,
        pendingRequests: pendingRequests.length,
        blockedTenants: blockedResult.data?.length || 0
      },
      pendingRequests,
      tenants: tenantsResult.data || []
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
