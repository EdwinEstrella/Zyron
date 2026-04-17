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
    const src = invRows[0]
    const { data: lineRows } = await client.database.from('invoice_items').select('*').eq('invoice_id', invoiceId)

    const draftNumber = `${Date.now().toString(36).toUpperCase()}`
    const insertRow = {
      tenant_id: tenantId,
      customer_id: src.customer_id,
      series: 'BOR',
      number: draftNumber,
      invoice_type: src.invoice_type || 'standard',
      currency: src.currency || 'USD',
      subtotal: src.subtotal,
      tax_total: src.tax_total,
      total: src.total,
      status: 'draft',
      notes: src.notes ? `Copia de ${src.series}-${src.number}\n${src.notes}` : `Copia de ${src.series}-${src.number}`,
      created_by: actor.id
    }
    if (src.parent_invoice_id) insertRow.parent_invoice_id = src.parent_invoice_id

    const { data: newInvs, error: insErr } = await tryInsertInvoice(client, insertRow)
    if (insErr || !newInvs?.length) {
      return new Response(JSON.stringify({ error: insErr?.message || 'duplicate insert failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const newInv = newInvs[0]

    const items = (lineRows || []).map((row) => ({
      tenant_id: tenantId,
      product_id: row.product_id,
      description: row.description,
      quantity: row.quantity,
      unit_price: row.unit_price,
      discount: row.discount || 0,
      tax_rate: row.tax_rate,
      line_total: row.line_total,
      line_kind: row.line_kind || (row.product_id ? 'product' : 'service'),
      invoice_id: newInv.id,
      tax_base_amount: row.tax_base_amount != null ? row.tax_base_amount : null,
      withholding_amount: row.withholding_amount != null ? row.withholding_amount : null
    }))

    const { error: itemsErr } = await tryInsertInvoiceItems(client, items)
    if (itemsErr) {
      await client.database.from('invoices').delete().eq('id', newInv.id)
      return new Response(JSON.stringify({ error: itemsErr.message || 'items copy failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await safeAudit(client, {
      tenant_id: tenantId,
      actor_user_id: actor.id,
      action: 'invoice_duplicated',
      target_type: 'invoices',
      target_id: newInv.id,
      details: { source_invoice_id: invoiceId }
    })

    return new Response(JSON.stringify({ ok: true, invoice: newInv }), {
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

async function tryInsertInvoice(client, insertRow) {
  let { data, error } = await client.database.from('invoices').insert(insertRow).select('*')
  if (error && shouldRetryInvoiceInsertWithoutOptionals(error.message, insertRow)) {
    const slim = { ...insertRow }
    delete slim.parent_invoice_id
    delete slim.invoice_type
    delete slim.recurrence_rule
    ;({ data, error } = await client.database.from('invoices').insert(slim).select('*'))
  }
  return { data, error }
}

function shouldRetryInvoiceInsertWithoutOptionals(msg, row) {
  if (!msg || typeof msg !== 'string') return false
  if (row.parent_invoice_id && /parent_invoice_id|column .* does not exist/i.test(msg)) return true
  if (row.invoice_type && /invoice_type|column .* does not exist/i.test(msg)) return true
  return false
}

async function tryInsertInvoiceItems(client, itemRows) {
  let { error } = await client.database.from('invoice_items').insert(itemRows)
  if (error && /line_kind|column .* does not exist/i.test(error.message || '')) {
    const slim = itemRows.map((r) => {
      const c = { ...r }
      delete c.line_kind
      return c
    })
    ;({ error } = await client.database.from('invoice_items').insert(slim))
  }
  if (error && /tax_base_amount|withholding_amount|column .* does not exist/i.test(error.message || '')) {
    const slim = itemRows.map((r) => {
      const c = { ...r }
      delete c.tax_base_amount
      delete c.withholding_amount
      return c
    })
    ;({ error } = await client.database.from('invoice_items').insert(slim))
  }
  return { error }
}

async function safeAudit(client, row) {
  try {
    await client.database.from('audit_logs').insert(row)
  } catch (_) {
    /* best-effort */
  }
}
