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
    const payload = await request.json()
    const {
      tenantId,
      customerId,
      series = 'FAC',
      currency = 'USD',
      items = [],
      notes = '',
      status: requestedStatus,
      invoiceType = 'standard',
      parentInvoiceId = null,
      isDraft = false
    } = payload

    if (!tenantId || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'tenantId and items are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const allowedTypes = new Set(['standard', 'proforma', 'credit_note', 'debit_note'])
    const invType = allowedTypes.has(String(invoiceType)) ? String(invoiceType) : 'standard'
    if ((invType === 'credit_note' || invType === 'debit_note') && !parentInvoiceId) {
      return new Response(JSON.stringify({ error: 'parentInvoiceId required for credit_note and debit_note' }), {
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

    const statusRaw = requestedStatus != null ? String(requestedStatus).toLowerCase() : isDraft ? 'draft' : 'pending'
    const status = statusRaw === 'draft' ? 'draft' : 'pending'
    const applyStock = status !== 'draft'

    let nextNumber
    let useSeries = String(series || 'FAC').trim() || 'FAC'
    if (status === 'draft') {
      useSeries = 'BOR'
      nextNumber = `${Date.now().toString(36).toUpperCase()}`
    } else {
      const { data: rpcNum, error: rpcErr } = await client.database.rpc('zyron_next_invoice_number', {
        p_tenant_id: tenantId,
        p_series: useSeries
      })
      if (!rpcErr && rpcNum != null && String(rpcNum).trim() !== '') {
        nextNumber = String(rpcNum).trim()
      } else {
        const { data: countRows } = await client.database.from('invoices').select('id').eq('tenant_id', tenantId).eq('series', useSeries)
        nextNumber = String((countRows?.length || 0) + 1).padStart(6, '0')
      }
    }

    const { lineRows, subtotal, taxTotal } = buildLineRows(tenantId, items)
    const total = subtotal + taxTotal

    let insertRow = {
      tenant_id: tenantId,
      customer_id: customerId || null,
      series: useSeries,
      number: nextNumber,
      invoice_type: invType,
      currency,
      subtotal,
      tax_total: taxTotal,
      total,
      status,
      notes,
      created_by: actor.id
    }
    if (parentInvoiceId) insertRow.parent_invoice_id = parentInvoiceId

    const { data: invoiceRows, error: invoiceError } = await tryInsertInvoice(client, insertRow)
    if (invoiceError || !invoiceRows?.length) {
      return new Response(JSON.stringify({ error: invoiceError?.message || 'Unable to create invoice' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const invoice = invoiceRows[0]
    const itemRows = lineRows.map((item) => ({ ...item, invoice_id: invoice.id }))
    const { error: itemsErr } = await tryInsertInvoiceItems(client, itemRows)
    if (itemsErr) {
      await client.database.from('invoices').delete().eq('id', invoice.id)
      return new Response(JSON.stringify({ error: itemsErr.message || 'invoice_items insert failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (applyStock) {
      await applyProductStockOut(client, tenantId, actor.id, invoice.id, items)
    }

    await safeAudit(client, {
      tenant_id: tenantId,
      actor_user_id: actor.id,
      action: 'invoice_created',
      target_type: 'invoices',
      target_id: invoice.id,
      details: { items: items.length, total, status, invoice_type: invType }
    })

    return new Response(JSON.stringify({ ok: true, invoice }), {
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

function buildLineRows(tenantId, items) {
  let subtotal = 0
  let taxTotal = 0
  const lineRows = []
  for (const item of items) {
    const quantity = Number(item.quantity || 0)
    const unitPrice = Number(item.unitPrice || 0)
    const taxRate = Number(item.taxRate || 0)
    const discount = Number(item.discount || 0)
    const baseLine = quantity * unitPrice - discount
    const lineTax = baseLine * (taxRate / 100)
    const lineTotal = baseLine + lineTax
    subtotal += baseLine
    taxTotal += lineTax
    const lineKind = item.lineKind === 'product' || item.productId ? 'product' : 'service'
    lineRows.push({
      tenant_id: tenantId,
      product_id: item.productId || null,
      description: item.description || (lineKind === 'product' ? 'Producto' : 'Servicio'),
      quantity,
      unit_price: unitPrice,
      discount,
      tax_rate: taxRate,
      line_total: lineTotal,
      line_kind: lineKind
    })
  }
  return { lineRows, subtotal, taxTotal }
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
  return { error }
}

async function applyProductStockOut(client, tenantId, actorId, invoiceId, items) {
  for (const item of items) {
    if (!item.productId || Number(item.quantity || 0) <= 0) continue
    const q = Number(item.quantity || 0)
    const { data: prodRows } = await client.database
      .from('products')
      .select('stock, price')
      .eq('id', item.productId)
      .eq('tenant_id', tenantId)
      .limit(1)
    const current = Number(prodRows?.[0]?.stock ?? item.currentStock ?? 0)
    const next = Math.max(current - q, 0)
    await client.database.from('products').update({ stock: next }).eq('id', item.productId).eq('tenant_id', tenantId)
    const unitCost = Number(item.unitCost ?? prodRows?.[0]?.price ?? 0)
    await client.database.from('inventory_kardex').insert({
      tenant_id: tenantId,
      product_id: item.productId,
      movement_type: 'out',
      quantity: q,
      unit_cost: unitCost,
      reference_type: 'invoice',
      reference_id: invoiceId,
      created_by: actorId
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
