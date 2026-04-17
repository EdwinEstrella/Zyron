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
    const { tenantId, invoiceId } = body
    if (!tenantId || !invoiceId) {
      return new Response(JSON.stringify({ error: 'tenantId and invoiceId are required' }), {
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

    const { data: invRows } = await client.database.from('invoices').select('*').eq('id', invoiceId).eq('tenant_id', tenantId).limit(1)
    if (!invRows?.length) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const inv = invRows[0]
    const st = String(inv.status || '').toLowerCase()

    if (st === 'paid' || st === 'cancelled' || st === 'void') {
      return new Response(JSON.stringify({ error: 'Cannot delete invoice in this status' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: lines } = await client.database.from('invoice_items').select('*').eq('invoice_id', invoiceId)

    if (st === 'pending') {
      for (const row of lines || []) {
        if (!row.product_id || Number(row.quantity || 0) <= 0) continue
        const q = Number(row.quantity)
        const { data: prodRows } = await client.database
          .from('products')
          .select('stock, price')
          .eq('id', row.product_id)
          .eq('tenant_id', tenantId)
          .limit(1)
        const current = Number(prodRows?.[0]?.stock || 0)
        await client.database.from('products').update({ stock: current + q }).eq('id', row.product_id).eq('tenant_id', tenantId)
        await client.database.from('inventory_kardex').insert({
          tenant_id: tenantId,
          product_id: row.product_id,
          movement_type: 'in',
          quantity: q,
          unit_cost: Number(prodRows?.[0]?.price || 0),
          reference_type: 'invoice_delete',
          reference_id: invoiceId,
          created_by: actor.id
        })
      }
    }

    await client.database.from('invoice_items').delete().eq('invoice_id', invoiceId)
    const { error: delErr } = await client.database.from('invoices').delete().eq('id', invoiceId)
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message || 'delete failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await safeAudit(client, {
      tenant_id: tenantId,
      actor_user_id: actor.id,
      action: 'invoice_deleted',
      target_type: 'invoices',
      target_id: invoiceId,
      details: { prior_status: inv.status, series: inv.series, number: inv.number }
    })

    return new Response(JSON.stringify({ ok: true }), {
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

async function safeAudit(client, row) {
  try {
    await client.database.from('audit_logs').insert(row)
  } catch (_) {
    /* best-effort */
  }
}
