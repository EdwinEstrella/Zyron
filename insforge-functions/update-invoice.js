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
    const { tenantId, invoiceId, action } = body
    if (!tenantId || !invoiceId || !action) {
      return new Response(JSON.stringify({ error: 'tenantId, invoiceId and action are required' }), {
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

    if (action === 'save_draft') {
      if (String(inv.status) !== 'draft') {
        return new Response(JSON.stringify({ error: 'Only draft invoices can be edited' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const items = Array.isArray(body.items) ? body.items : []
      if (items.length === 0) {
        return new Response(JSON.stringify({ error: 'items required for save_draft' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const allowedTypes = new Set(['standard', 'proforma', 'credit_note', 'debit_note'])
      const invType = allowedTypes.has(String(body.invoiceType || inv.invoice_type || 'standard'))
        ? String(body.invoiceType || inv.invoice_type || 'standard')
        : 'standard'
      const parentId = body.parentInvoiceId != null ? body.parentInvoiceId : inv.parent_invoice_id
      if ((invType === 'credit_note' || invType === 'debit_note') && !parentId) {
        return new Response(JSON.stringify({ error: 'parentInvoiceId required for credit_note and debit_note' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { lineRows, subtotal, taxTotal } = buildLineRows(tenantId, items)
      const total = subtotal + taxTotal

      await client.database.from('invoice_items').delete().eq('invoice_id', invoiceId)
      const itemRows = lineRows.map((r) => ({ ...r, invoice_id: invoiceId }))
      const { error: insErr } = await tryInsertInvoiceItems(client, itemRows)
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message || 'invoice_items failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const patch = {
        customer_id: body.customerId !== undefined ? body.customerId || null : inv.customer_id,
        currency: body.currency || inv.currency,
        notes: body.notes !== undefined ? body.notes : inv.notes,
        subtotal,
        tax_total: taxTotal,
        total,
        invoice_type: invType,
        updated_at: new Date().toISOString()
      }
      if (parentId) patch.parent_invoice_id = parentId
      else patch.parent_invoice_id = null

      const { data: upd, error: upErr } = await client.database.from('invoices').update(patch).eq('id', invoiceId).select('*')
      if (upErr || !upd?.length) {
        return new Response(JSON.stringify({ error: upErr?.message || 'update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await safeAudit(client, {
        tenant_id: tenantId,
        actor_user_id: actor.id,
        action: 'invoice_draft_saved',
        target_type: 'invoices',
        target_id: invoiceId,
        details: { total, invoice_type: invType }
      })

      return new Response(JSON.stringify({ ok: true, invoice: upd[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'issue') {
      if (String(inv.status) !== 'draft') {
        return new Response(JSON.stringify({ error: 'Only draft invoices can be issued' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      let items = Array.isArray(body.items) && body.items.length ? body.items : null
      if (!items) {
        const { data: dbItems } = await client.database.from('invoice_items').select('*').eq('invoice_id', invoiceId)
        items = (dbItems || []).map(dbRowToPayload)
      }
      if (!items.length) {
        return new Response(JSON.stringify({ error: 'No lines to issue' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const useSeries = String(body.series || 'FAC').trim() || 'FAC'
      const { data: rpcNum, error: rpcErr } = await client.database.rpc('zyron_next_invoice_number', {
        p_tenant_id: tenantId,
        p_series: useSeries
      })
      let nextNumber
      if (!rpcErr && rpcNum != null && String(rpcNum).trim() !== '') {
        nextNumber = String(rpcNum).trim()
      } else {
        const { data: countRows } = await client.database.from('invoices').select('id').eq('tenant_id', tenantId).eq('series', useSeries)
        nextNumber = String((countRows?.length || 0) + 1).padStart(6, '0')
      }

      const { lineRows, subtotal, taxTotal } = buildLineRows(tenantId, items)
      const total = subtotal + taxTotal

      await client.database.from('invoice_items').delete().eq('invoice_id', invoiceId)
      const itemRows = lineRows.map((r) => ({ ...r, invoice_id: invoiceId }))
      const { error: insErr } = await tryInsertInvoiceItems(client, itemRows)
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message || 'invoice_items failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const allowedTypes = new Set(['standard', 'proforma', 'credit_note', 'debit_note'])
      const invType = allowedTypes.has(String(body.invoiceType || inv.invoice_type || 'standard'))
        ? String(body.invoiceType || inv.invoice_type || 'standard')
        : 'standard'
      const parentId = body.parentInvoiceId != null ? body.parentInvoiceId : inv.parent_invoice_id
      if ((invType === 'credit_note' || invType === 'debit_note') && !parentId) {
        return new Response(JSON.stringify({ error: 'parentInvoiceId required for credit_note and debit_note' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const patch = {
        series: useSeries,
        number: nextNumber,
        status: 'pending',
        customer_id: body.customerId !== undefined ? body.customerId || null : inv.customer_id,
        currency: body.currency || inv.currency,
        notes: body.notes !== undefined ? body.notes : inv.notes,
        subtotal,
        tax_total: taxTotal,
        total,
        invoice_type: invType,
        updated_at: new Date().toISOString()
      }
      if (parentId) patch.parent_invoice_id = parentId
      else patch.parent_invoice_id = null

      const { data: upd, error: upErr } = await client.database.from('invoices').update(patch).eq('id', invoiceId).select('*')
      if (upErr || !upd?.length) {
        return new Response(JSON.stringify({ error: upErr?.message || 'issue update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await applyProductStockOut(client, tenantId, actor.id, invoiceId, items)

      await safeAudit(client, {
        tenant_id: tenantId,
        actor_user_id: actor.id,
        action: 'invoice_issued',
        target_type: 'invoices',
        target_id: invoiceId,
        details: { series: useSeries, number: nextNumber, total, invoice_type: invType }
      })

      return new Response(JSON.stringify({ ok: true, invoice: upd[0] }), {
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

function dbRowToPayload(row) {
  return {
    productId: row.product_id,
    description: row.description,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    taxRate: Number(row.tax_rate),
    discount: Number(row.discount || 0),
    lineKind: row.line_kind,
    unitCost: 0
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
