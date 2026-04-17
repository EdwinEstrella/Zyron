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

    if (action === 'list_segments') {
      const { data, error } = await client.database
        .from('customer_segments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
      if (error) {
        return new Response(JSON.stringify({ ok: true, rows: [], err: error.message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, rows: data || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'seed_segments') {
      const defaults = [
        { code: 'vip', label: 'VIP', sort_order: 10, color: '#7c3aed' },
        { code: 'mayorista', label: 'Mayorista', sort_order: 20, color: '#0369a1' },
        { code: 'minorista', label: 'Minorista', sort_order: 30, color: '#4d7c0f' },
        { code: 'moroso', label: 'Seguimiento cobro', sort_order: 90, color: '#b91c1c' }
      ]
      for (const d of defaults) {
        const { error: insErr } = await client.database.from('customer_segments').insert({
          tenant_id: tenantId,
          code: d.code,
          label: d.label,
          sort_order: d.sort_order,
          color: d.color
        })
        if (insErr && !/duplicate|unique/i.test(insErr.message || '')) {
          return new Response(JSON.stringify({ error: insErr.message || 'seed failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
      const { data: rows } = await client.database
        .from('customer_segments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
      return new Response(JSON.stringify({ ok: true, rows: rows || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'upsert_segment') {
      const id = body.id || null
      const code = String(body.code || '').trim().toLowerCase().replace(/\s+/g, '_')
      const label = String(body.label || '').trim()
      if (!code || !label) {
        return new Response(JSON.stringify({ error: 'code and label required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const patch = {
        code,
        label,
        color: body.color || null,
        sort_order: Number(body.sortOrder ?? body.sort_order ?? 0)
      }
      if (id) {
        const { data, error } = await client.database
          .from('customer_segments')
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
        return new Response(JSON.stringify({ ok: true, segment: data[0] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data, error } = await client.database
        .from('customer_segments')
        .insert({ tenant_id: tenantId, ...patch })
        .select('*')
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'insert failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, segment: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_segment') {
      const segmentId = body.segmentId
      if (!segmentId) {
        return new Response(JSON.stringify({ error: 'segmentId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { error } = await client.database.from('customer_segments').delete().eq('id', segmentId).eq('tenant_id', tenantId)
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_customers') {
      const q = body.q ? String(body.q).trim().toLowerCase() : ''
      const segmentId = body.segmentId || null
      const includeInactive = Boolean(body.includeInactive)
      const { data: customers, error: cErr } = await client.database
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .limit(800)
      if (cErr) {
        return new Response(JSON.stringify({ ok: false, error: cErr.message, rows: [] }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      let rows = customers || []
      if (!includeInactive) rows = rows.filter((c) => c.is_active !== false)
      if (q) {
        rows = rows.filter((c) => {
          const blob = [c.name, c.email, c.phone, c.tax_id, c.city, c.country]
            .map((x) => String(x || '').toLowerCase())
            .join(' ')
          return blob.includes(q)
        })
      }

      const openMap = await loadOpenBalancesByCustomer(client, tenantId)
      const { membersByCustomer, segById } = await loadSegmentMaps(client, tenantId, rows.map((r) => r.id))

      if (segmentId) {
        rows = rows.filter((c) => (membersByCustomer.get(c.id) || []).some((sid) => sid === segmentId))
      }

      const enriched = rows.map((c) => enrichCustomerRow(c, openMap, membersByCustomer, segById))
      return new Response(JSON.stringify({ ok: true, rows: enriched }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'get_customer') {
      const customerId = body.customerId
      if (!customerId) {
        return new Response(JSON.stringify({ error: 'customerId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: custRows, error } = await client.database.from('customers').select('*').eq('id', customerId).eq('tenant_id', tenantId).limit(1)
      if (error || !custRows?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const c = custRows[0]
      const openMap = await loadOpenBalancesByCustomer(client, tenantId)
      const { membersByCustomer, segById } = await loadSegmentMaps(client, tenantId, [c.id])
      const row = enrichCustomerRow(c, openMap, membersByCustomer, segById)
      const segmentIds = membersByCustomer.get(c.id) || []
      return new Response(JSON.stringify({ ok: true, customer: row, segmentIds }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'create_customer') {
      const nm = String(body.name || '').trim()
      if (!nm) {
        return new Response(JSON.stringify({ error: 'name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const insertRow = { tenant_id: tenantId, ...buildCustomerPatch(body, true) }
      insertRow.name = nm
      let { data, error } = await client.database.from('customers').insert(insertRow).select('*')
      if (error && /column .* does not exist/i.test(error.message || '')) {
        const slim = {
          tenant_id: tenantId,
          name: insertRow.name,
          email: insertRow.email || null,
          phone: insertRow.phone || null,
          credit_limit: insertRow.credit_limit ?? null
        }
        ;({ data, error } = await client.database.from('customers').insert(slim).select('*'))
      }
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'insert failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const customer = data[0]
      if (Array.isArray(body.segmentIds) && body.segmentIds.length) {
        await replaceCustomerSegments(client, tenantId, customer.id, body.segmentIds)
      }
      return new Response(JSON.stringify({ ok: true, customer }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'update_customer') {
      const customerId = body.customerId
      if (!customerId) {
        return new Response(JSON.stringify({ error: 'customerId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const patch = buildCustomerPatch(body, false)
      let data
      let error
      if (Object.keys(patch).length > 0) {
        ;({ data, error } = await client.database.from('customers').update(patch).eq('id', customerId).eq('tenant_id', tenantId).select('*'))
        if (error && /column .* does not exist/i.test(error.message || '')) {
          const slim = {}
          if (patch.name != null) slim.name = patch.name
          if (patch.email != null) slim.email = patch.email
          if (patch.phone != null) slim.phone = patch.phone
          if (patch.credit_limit !== undefined) slim.credit_limit = patch.credit_limit
          ;({ data, error } = await client.database.from('customers').update(slim).eq('id', customerId).eq('tenant_id', tenantId).select('*'))
        }
        if (error || !data?.length) {
          return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      } else {
        const { data: rows, error: gErr } = await client.database.from('customers').select('*').eq('id', customerId).eq('tenant_id', tenantId).limit(1)
        if (gErr || !rows?.length) {
          return new Response(JSON.stringify({ error: gErr?.message || 'not found' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        data = rows
      }
      if (Array.isArray(body.segmentIds)) {
        await replaceCustomerSegments(client, tenantId, customerId, body.segmentIds)
      }
      return new Response(JSON.stringify({ ok: true, customer: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'set_customer_active') {
      const { customerId, isActive } = body
      if (!customerId) {
        return new Response(JSON.stringify({ error: 'customerId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data, error } = await client.database
        .from('customers')
        .update({ is_active: Boolean(isActive) })
        .eq('id', customerId)
        .eq('tenant_id', tenantId)
        .select('*')
      if (error && /is_active|column .* does not exist/i.test(error.message || '')) {
        return new Response(JSON.stringify({ error: 'Columna is_active no disponible; aplica customers_module_advanced.sql' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, customer: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'set_customer_segments') {
      const customerId = body.customerId
      if (!customerId) {
        return new Response(JSON.stringify({ error: 'customerId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const ids = Array.isArray(body.segmentIds) ? body.segmentIds : []
      await replaceCustomerSegments(client, tenantId, customerId, ids)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'purchase_history') {
      const customerId = body.customerId
      if (!customerId) {
        return new Response(JSON.stringify({ error: 'customerId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const limit = Math.min(80, Math.max(1, Number(body.limit || 40)))
      const { data: invoices, error: invErr } = await client.database
        .from('invoices')
        .select('id,series,number,total,amount_paid,status,invoice_type,currency,created_at,notes')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (invErr) {
        return new Response(JSON.stringify({ ok: false, error: invErr.message, invoices: [], itemsByInvoice: {} }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const invList = invoices || []
      const ids = invList.map((i) => i.id)
      let itemsByInvoice = {}
      if (ids.length) {
        const { data: items, error: itErr } = await client.database.from('invoice_items').select('*').in('invoice_id', ids)
        if (!itErr && items) {
          itemsByInvoice = groupBy(items, (r) => r.invoice_id)
        }
      }
      return new Response(JSON.stringify({ ok: true, invoices: invList, itemsByInvoice }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'export_customers') {
      const format = String(body.format || 'csv').toLowerCase()
      const { data: customers, error: cErr } = await client.database
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .limit(5000)
      if (cErr) {
        return new Response(JSON.stringify({ ok: false, error: cErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const rows = customers || []
      const openMap = await loadOpenBalancesByCustomer(client, tenantId)
      const { membersByCustomer, segById } = await loadSegmentMaps(client, tenantId, rows.map((r) => r.id))
      const enriched = rows.map((c) => enrichCustomerRow(c, openMap, membersByCustomer, segById))
      if (format === 'json') {
        return new Response(JSON.stringify({ ok: true, format: 'json', rows: enriched }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const headers = [
        'id',
        'name',
        'email',
        'phone',
        'tax_id',
        'city',
        'country',
        'credit_limit',
        'open_balance',
        'credit_available',
        'segments',
        'is_active'
      ]
      const lines = [headers.join(',')]
      for (const r of enriched) {
        const seg = (r.segments || []).map((s) => s.label || s.code).join(';')
        lines.push(
          [
            csvEscape(r.id),
            csvEscape(r.name),
            csvEscape(r.email),
            csvEscape(r.phone),
            csvEscape(r.tax_id),
            csvEscape(r.city),
            csvEscape(r.country),
            r.credit_limit == null ? '' : String(r.credit_limit),
            String(r.open_balance ?? ''),
            r.credit_available == null ? '' : String(r.credit_available),
            csvEscape(seg),
            r.is_active === false ? '0' : '1'
          ].join(',')
        )
      }
      const csv = '\ufeff' + lines.join('\n')
      return new Response(JSON.stringify({ ok: true, format: 'csv', filename: 'clientes.csv', csv }), {
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

function csvEscape(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function groupBy(arr, keyFn) {
  const m = {}
  for (const x of arr || []) {
    const k = keyFn(x)
    if (!m[k]) m[k] = []
    m[k].push(x)
  }
  return m
}

function invoiceOpenBalance(inv) {
  const st = String(inv.status || '').toLowerCase()
  if (st === 'draft' || st === 'cancelled' || st === 'void') return 0
  const bal = Number(inv.total || 0) - Number(inv.amount_paid || 0)
  return bal > 0.0001 ? bal : 0
}

async function loadOpenBalancesByCustomer(client, tenantId) {
  const openMap = new Map()
  const { data: invs } = await client.database
    .from('invoices')
    .select('customer_id,total,amount_paid,status')
    .eq('tenant_id', tenantId)
  for (const inv of invs || []) {
    if (!inv.customer_id) continue
    const add = invoiceOpenBalance(inv)
    if (add <= 0) continue
    openMap.set(inv.customer_id, (openMap.get(inv.customer_id) || 0) + add)
  }
  return openMap
}

async function loadSegmentMaps(client, tenantId, customerIds) {
  const segById = new Map()
  const { data: segs } = await client.database.from('customer_segments').select('*').eq('tenant_id', tenantId)
  for (const s of segs || []) segById.set(s.id, s)

  const membersByCustomer = new Map()
  if (!customerIds.length) return { membersByCustomer, segById }

  const { data: members } = await client.database
    .from('customer_segment_members')
    .select('customer_id,segment_id')
    .eq('tenant_id', tenantId)
    .in('customer_id', customerIds)

  for (const m of members || []) {
    if (!membersByCustomer.has(m.customer_id)) membersByCustomer.set(m.customer_id, [])
    membersByCustomer.get(m.customer_id).push(m.segment_id)
  }
  return { membersByCustomer, segById }
}

function enrichCustomerRow(c, openMap, membersByCustomer, segById) {
  const open = openMap.get(c.id) || 0
  const limRaw = c.credit_limit
  const lim = limRaw != null && limRaw !== '' ? Number(limRaw) : null
  const credit_available = lim != null && !Number.isNaN(lim) ? Math.max(0, lim - open) : null
  const segIds = membersByCustomer.get(c.id) || []
  const segments = segIds.map((id) => segById.get(id)).filter(Boolean)
  return {
    ...c,
    open_balance: round2(open),
    credit_available: credit_available == null ? null : round2(credit_available),
    segments
  }
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

function buildCustomerPatch(body, isCreate) {
  const row = {
    name: body.name != null ? String(body.name).trim() || undefined : undefined,
    email: body.email != null ? String(body.email).trim() || null : undefined,
    phone: body.phone != null ? String(body.phone).trim() || null : undefined,
    credit_limit:
      body.creditLimit !== undefined
        ? body.creditLimit === '' || body.creditLimit === null
          ? null
          : Number(body.creditLimit)
        : body.credit_limit !== undefined
          ? body.credit_limit === '' || body.credit_limit === null
            ? null
            : Number(body.credit_limit)
          : undefined,
    tax_id: body.taxId != null ? String(body.taxId).trim() || null : body.tax_id != null ? String(body.tax_id).trim() || null : undefined,
    address: body.address != null ? String(body.address).trim() || null : undefined,
    city: body.city != null ? String(body.city).trim() || null : undefined,
    country: body.country != null ? String(body.country).trim() || null : undefined,
    internal_notes:
      body.internalNotes != null
        ? String(body.internalNotes)
        : body.internal_notes != null
          ? String(body.internal_notes)
          : undefined
  }
  if (!isCreate) {
    const out = {}
    for (const [k, v] of Object.entries(row)) {
      if (v !== undefined) out[k] = v
    }
    if (out.credit_limit !== undefined && out.credit_limit !== null && Number.isNaN(Number(out.credit_limit))) out.credit_limit = null
    return out
  }
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined) out[k] = v
  }
  if (out.credit_limit === undefined) out.credit_limit = null
  if (out.credit_limit !== null && out.credit_limit !== undefined && Number.isNaN(Number(out.credit_limit))) out.credit_limit = null
  return out
}

async function replaceCustomerSegments(client, tenantId, customerId, segmentIds) {
  await client.database.from('customer_segment_members').delete().eq('customer_id', customerId).eq('tenant_id', tenantId)
  const uniq = [...new Set(segmentIds)].filter(Boolean)
  for (const segmentId of uniq) {
    await client.database.from('customer_segment_members').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      segment_id: segmentId
    })
  }
}
