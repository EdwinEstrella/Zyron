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

    const fiscalRow = await loadTenantFiscalSettings(client, tenantId)
    const fiscal = mergeFiscal(fiscalRow)

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

    const { lineRows, subtotal, taxTotal } = buildLineRows(tenantId, items, fiscal)
    const total = subtotal + taxTotal
    const { total: whTotal, detail: whDetail } = computeWithholding(fiscal, subtotal, taxTotal)

    let ncfAlloc = { ncf: null, ncf_type: null }
    const ncfEligible = status !== 'draft' && fiscal.ncf_enabled && invType !== 'proforma' && invType !== 'credit_note'
    if (ncfEligible) {
      ncfAlloc = await allocateNcfForSeries(client, tenantId, useSeries)
    }

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
    if (ncfAlloc.ncf) {
      insertRow.ncf = ncfAlloc.ncf
      insertRow.ncf_type = ncfAlloc.ncf_type
    }
    if (whTotal > 0) {
      insertRow.withholding_total = whTotal
      insertRow.withholding_detail = whDetail
    }
    if (fiscal.electronic_invoicing_requested && status !== 'draft') {
      insertRow.fiscal_electronic_status = 'pending'
    }

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

function numOrF(v, def) {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

function mergeFiscal(row) {
  if (!row) {
    return {
      tax_label: 'ITBIS',
      default_tax_rate: 18,
      prices_tax_inclusive: false,
      ncf_enabled: false,
      withholding_isr_on_subtotal_pct: 0,
      withholding_itbis_on_tax_pct: 0,
      electronic_invoicing_requested: false
    }
  }
  return {
    tax_label: row.tax_label || 'ITBIS',
    default_tax_rate: numOrF(row.default_tax_rate, 18),
    prices_tax_inclusive: Boolean(row.prices_tax_inclusive),
    ncf_enabled: Boolean(row.ncf_enabled),
    withholding_isr_on_subtotal_pct: numOrF(row.withholding_isr_on_subtotal_pct, 0),
    withholding_itbis_on_tax_pct: numOrF(row.withholding_itbis_on_tax_pct, 0),
    electronic_invoicing_requested: Boolean(row.electronic_invoicing_requested)
  }
}

async function loadTenantFiscalSettings(client, tenantId) {
  try {
    const { data } = await client.database.from('tenant_fiscal_settings').select('*').eq('tenant_id', tenantId).limit(1)
    return data?.[0] || null
  } catch (_) {
    return null
  }
}

async function allocateNcfForSeries(client, tenantId, useSeries) {
  try {
    const match = String(useSeries || '').trim().toUpperCase()
    const { data: rows } = await client.database
      .from('ncf_sequences')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('invoice_series_match', match)
      .eq('is_active', true)
      .limit(1)
    const seq = rows?.[0]
    if (!seq) return { ncf: null, ncf_type: null }
    const n = Number(seq.next_correlative || 1)
    const w = Math.min(12, Math.max(1, Number(seq.correlative_width || 8)))
    const full = String(seq.prefix || '') + String(n).padStart(w, '0')
    const { error: upErr } = await client.database
      .from('ncf_sequences')
      .update({ next_correlative: n + 1, updated_at: new Date().toISOString() })
      .eq('id', seq.id)
    if (upErr) return { ncf: null, ncf_type: null }
    return { ncf: full, ncf_type: seq.ncf_type }
  } catch (_) {
    return { ncf: null, ncf_type: null }
  }
}

function computeWithholding(fiscal, subtotal, taxTotal) {
  const isr = (subtotal * numOrF(fiscal.withholding_isr_on_subtotal_pct, 0)) / 100
  const itw = (taxTotal * numOrF(fiscal.withholding_itbis_on_tax_pct, 0)) / 100
  const total = Math.round((isr + itw) * 100) / 100
  const detail = {
    isr,
    itbis_retencion: itw,
    isr_pct: fiscal.withholding_isr_on_subtotal_pct,
    itbis_sobre_impuesto_pct: fiscal.withholding_itbis_on_tax_pct
  }
  return { total, detail }
}

function buildLineRows(tenantId, items, fiscal) {
  const f = fiscal || mergeFiscal(null)
  const inclusive = Boolean(f.prices_tax_inclusive)
  let subtotal = 0
  let taxTotal = 0
  const lineRows = []
  for (const item of items) {
    const quantity = Number(item.quantity || 0)
    const unitPrice = Number(item.unitPrice || 0)
    let taxRate = Number(item.taxRate)
    if (!Number.isFinite(taxRate)) taxRate = numOrF(f.default_tax_rate, 18)
    const discount = Number(item.discount || 0)
    const baseLineRaw = quantity * unitPrice - discount
    let baseLine = baseLineRaw
    let lineTax = 0
    if (inclusive && taxRate > 0) {
      baseLine = baseLineRaw / (1 + taxRate / 100)
      lineTax = baseLineRaw - baseLine
    } else {
      lineTax = baseLine * (taxRate / 100)
    }
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
      line_kind: lineKind,
      tax_base_amount: baseLine
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
  if (error && shouldRetryFiscalInvoiceColumns(error.message, insertRow)) {
    const slim = { ...insertRow }
    delete slim.ncf
    delete slim.ncf_type
    delete slim.withholding_total
    delete slim.withholding_detail
    delete slim.fiscal_electronic_status
    delete slim.fiscal_electronic_url
    delete slim.fiscal_compliance_notes
    ;({ data, error } = await client.database.from('invoices').insert(slim).select('*'))
  }
  return { data, error }
}

function shouldRetryFiscalInvoiceColumns(msg, row) {
  if (!msg || typeof msg !== 'string') return false
  if (!row.ncf && row.withholding_total == null && !row.fiscal_electronic_status) return false
  return /ncf|withholding|fiscal_electronic|column .* does not exist/i.test(msg)
}

function shouldRetryInvoiceInsertWithoutOptionals(msg, row) {
  if (!msg || typeof msg !== 'string') return false
  if (row.parent_invoice_id && /parent_invoice_id|column .* does not exist/i.test(msg)) return true
  if (row.invoice_type && /invoice_type|column .* does not exist/i.test(msg)) return true
  return false
}

async function tryInsertInvoiceItems(client, itemRows) {
  let rows = itemRows
  let { error } = await client.database.from('invoice_items').insert(rows)
  if (error && /line_kind|column .* does not exist/i.test(error.message || '')) {
    rows = itemRows.map((r) => {
      const c = { ...r }
      delete c.line_kind
      return c
    })
    ;({ error } = await client.database.from('invoice_items').insert(rows))
  }
  if (error && /tax_base_amount|withholding_amount|column .* does not exist/i.test(error.message || '')) {
    rows = rows.map((r) => {
      const c = { ...r }
      delete c.tax_base_amount
      delete c.withholding_amount
      return c
    })
    ;({ error } = await client.database.from('invoice_items').insert(rows))
  }
  return { error }
}

async function getDefaultWarehouseIdForTenant(client, tenantId) {
  try {
    const { data: d } = await client.database.from('warehouses').select('id').eq('tenant_id', tenantId).eq('is_default', true).limit(1)
    if (d?.[0]?.id) return d[0].id
    const { data: a } = await client.database
      .from('warehouses')
      .select('id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(1)
    return a?.[0]?.id || null
  } catch (_) {
    return null
  }
}

async function applyProductStockOut(client, tenantId, actorId, invoiceId, items) {
  const wid = await getDefaultWarehouseIdForTenant(client, tenantId)
  for (const item of items) {
    if (!item.productId || Number(item.quantity || 0) <= 0) continue
    const q = Number(item.quantity || 0)
    const { data: prodRows } = await client.database
      .from('products')
      .select('stock, price, tracks_stock, item_kind')
      .eq('id', item.productId)
      .eq('tenant_id', tenantId)
      .limit(1)
    const prod = prodRows?.[0]
    const track = prod && Object.prototype.hasOwnProperty.call(prod, 'tracks_stock') ? prod.tracks_stock !== false : true
    const isService = String(prod?.item_kind || '').toLowerCase() === 'service'
    if (!track || isService) continue
    const current = Number(prod?.stock ?? item.currentStock ?? 0)
    const next = Math.max(current - q, 0)
    await client.database.from('products').update({ stock: next }).eq('id', item.productId).eq('tenant_id', tenantId)
    if (wid) {
      const { data: wsRow } = await client.database
        .from('warehouse_stock')
        .select('quantity')
        .eq('warehouse_id', wid)
        .eq('product_id', item.productId)
        .limit(1)
      const curW = wsRow?.length ? Number(wsRow[0].quantity ?? 0) : current
      const nextW = Math.max(0, curW - q)
      const { error: wsErr } = await client.database.from('warehouse_stock').upsert(
        {
          warehouse_id: wid,
          product_id: item.productId,
          quantity: nextW,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'warehouse_id,product_id' }
      )
      if (wsErr && !/does not exist|relation/i.test(wsErr.message || '')) {
        /* best-effort: tablas de almacen opcionales */
      }
    }
    const unitCost = Number(item.unitCost ?? prod?.price ?? 0)
    const kFull = {
      tenant_id: tenantId,
      warehouse_id: wid || null,
      product_id: item.productId,
      movement_type: 'out',
      quantity: q,
      unit_cost: unitCost,
      reference_type: 'invoice',
      reference_id: invoiceId,
      created_by: actorId
    }
    let { error: kErr } = await client.database.from('inventory_kardex').insert(kFull)
    if (kErr && /column .* does not exist|warehouse_id/i.test(kErr.message || '')) {
      const slim = {
        tenant_id: tenantId,
        product_id: item.productId,
        movement_type: 'out',
        quantity: q,
        unit_cost: unitCost,
        reference_type: 'invoice',
        reference_id: invoiceId,
        created_by: actorId
      }
      ;({ error: kErr } = await client.database.from('inventory_kardex').insert(slim))
    }
    if (kErr && kErr.message) {
      /* kardex best-effort */
    }
  }
}

async function safeAudit(client, row) {
  try {
    await client.database.from('audit_logs').insert(row)
  } catch (_) {
    /* best-effort */
  }
}
