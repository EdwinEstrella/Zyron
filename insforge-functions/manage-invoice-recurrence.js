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

    const { data: actorRows } = await client.database.from('app_users').select('*').eq('auth_user_id', currentUser.id).limit(1)
    if (!actorRows?.length) {
      return new Response(JSON.stringify({ error: 'App user not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const actor = actorRows[0]

    const { data: mem } = await client.database
      .from('tenant_memberships')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('app_user_id', actor.id)
      .eq('status', 'active')
      .limit(1)
    if (!mem?.length) {
      return new Response(JSON.stringify({ error: 'Forbidden for this tenant' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list') {
      const { data, error } = await client.database.from('invoice_recurrence_templates').select('*').eq('tenant_id', tenantId)
      if (error) {
        return new Response(JSON.stringify({ error: error.message || 'list failed', rows: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const rows = (data || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      return new Response(JSON.stringify({ ok: true, rows }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'create') {
      const name = String(body.name || '').trim()
      if (!name) {
        return new Response(JSON.stringify({ error: 'name is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      let templatePayload = body.templatePayload
      if (templatePayload == null) templatePayload = {}
      if (typeof templatePayload === 'string') {
        try {
          templatePayload = JSON.parse(templatePayload)
        } catch (_) {
          templatePayload = { raw: templatePayload }
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
      }
      const { data, error } = await client.database.from('invoice_recurrence_templates').insert(row).select('*')
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'create failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, row: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'update') {
      const id = body.id
      if (!id) {
        return new Response(JSON.stringify({ error: 'id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const patch = {}
      if (body.name != null) patch.name = String(body.name).trim()
      if (body.frequency != null) patch.frequency = String(body.frequency)
      if (body.dayOfMonth !== undefined) patch.day_of_month = body.dayOfMonth == null ? null : Number(body.dayOfMonth)
      if (body.series != null) patch.series = String(body.series).trim()
      if (body.invoiceType != null) patch.invoice_type = String(body.invoiceType)
      if (body.templatePayload !== undefined) {
        let tp = body.templatePayload
        if (typeof tp === 'string') {
          try {
            tp = JSON.parse(tp)
          } catch (_) {
            tp = { raw: tp }
          }
        }
        patch.template_payload = tp
      }
      if (body.isActive !== undefined) patch.is_active = Boolean(body.isActive)
      const { data, error } = await client.database
        .from('invoice_recurrence_templates')
        .update(patch)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*')
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, row: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete') {
      const id = body.id
      if (!id) {
        return new Response(JSON.stringify({ error: 'id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { error } = await client.database.from('invoice_recurrence_templates').delete().eq('id', id).eq('tenant_id', tenantId)
      if (error) {
        return new Response(JSON.stringify({ error: error.message || 'delete failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}
