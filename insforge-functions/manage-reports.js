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

  const REPORT_KEYS = new Set(['sales', 'income', 'tax', 'customers', 'top_products', 'ar'])
  const CUSTOM_DATASET_KEYS = new Set(['sales', 'income', 'tax', 'customers', 'top_products', 'ar'])

  function numOr(v, d) {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }

  function parseRange(body) {
    const now = new Date()
    const to = body.dateTo ? new Date(body.dateTo) : now
    let from = body.dateFrom ? new Date(body.dateFrom) : new Date(to.getTime() - 89 * 86400000)
    if (from.getTime() > to.getTime()) {
      const t = from
      from = to
      to = t
    }
    const toEnd = new Date(to)
    toEnd.setUTCHours(23, 59, 59, 999)
    return { fromISO: from.toISOString(), toISO: toEnd.toISOString() }
  }

  function csvEscape(s) {
    const x = String(s ?? '')
    if (/[",\n\r]/.test(x)) return `"${x.replace(/"/g, '""')}"`
    return x
  }

  function rowsToCsv(headers, rows) {
    const lines = [headers.map(csvEscape).join(',')]
    for (const r of rows) {
      lines.push(headers.map((h) => csvEscape(r[h])).join(','))
    }
    return '\uFEFF' + lines.join('\n')
  }

  async function safeLogExport(client, tenantId, actorId, reportKey, format, meta) {
    try {
      await client.database.from('report_exports').insert({
        tenant_id: tenantId,
        report_type: reportKey,
        format,
        meta: meta || {},
        created_by: actorId
      })
    } catch (_) {
      /* tabla opcional */
    }
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

    async function loadCustomerMap(ids) {
      const uniq = [...new Set((ids || []).filter(Boolean))]
      if (!uniq.length) return new Map()
      const { data } = await client.database.from('customers').select('id,name,email').in('id', uniq).eq('tenant_id', tenantId)
      return new Map((data || []).map((c) => [c.id, c]))
    }

    async function runDataset(key, range) {
      const { fromISO, toISO } = range
      if (key === 'sales') {
        const { data: invs, error } = await client.database
          .from('invoices')
          .select('id,series,number,status,invoice_type,customer_id,currency,subtotal,tax_total,total,created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
          .limit(2500)
        if (error) return { ok: false, error: error.message, rows: [], summary: {} }
        const custMap = await loadCustomerMap((invs || []).map((i) => i.customer_id))
        const rows = (invs || [])
          .filter((i) => {
            const st = String(i.status || '').toLowerCase()
            return st !== 'draft' && st !== 'cancelled' && st !== 'void'
          })
          .map((i) => {
            const c = i.customer_id ? custMap.get(i.customer_id) : null
            return {
              id: i.id,
              fecha: i.created_at,
              serie: i.series,
              numero: i.number,
              estado: i.status,
              tipo: i.invoice_type || 'standard',
              cliente_id: i.customer_id || '',
              cliente_nombre: c?.name || '',
              cliente_email: c?.email || '',
              moneda: i.currency || 'USD',
              subtotal: numOr(i.subtotal, 0),
              impuestos: numOr(i.tax_total, 0),
              total: numOr(i.total, 0)
            }
          })
        const summary = rows.reduce(
          (acc, r) => {
            acc.count += 1
            acc.subtotal += r.subtotal
            acc.impuestos += r.impuestos
            acc.total += r.total
            return acc
          },
          { count: 0, subtotal: 0, impuestos: 0, total: 0 }
        )
        return { ok: true, rows, summary }
      }

      if (key === 'income') {
        const { data: pays, error } = await client.database
          .from('payments')
          .select('id,amount,currency,payment_method,payment_method_code,paid_at,customer_id,status,reference,notes')
          .eq('tenant_id', tenantId)
          .gte('paid_at', fromISO)
          .lte('paid_at', toISO)
          .order('paid_at', { ascending: false })
          .limit(2500)
        if (error) return { ok: false, error: error.message, rows: [], summary: {} }
        const custMap = await loadCustomerMap((pays || []).map((p) => p.customer_id))
        const rows = (pays || []).map((p) => {
          const c = p.customer_id ? custMap.get(p.customer_id) : null
          return {
            id: p.id,
            fecha: p.paid_at,
            monto: numOr(p.amount, 0),
            moneda: p.currency || 'USD',
            metodo: p.payment_method_code || p.payment_method || '',
            estado: p.status,
            cliente_id: p.customer_id || '',
            cliente_nombre: c?.name || '',
            referencia: p.reference || '',
            notas: p.notes || ''
          }
        })
        const summary = rows.reduce(
          (acc, r) => {
            acc.count += 1
            acc.total += r.monto
            return acc
          },
          { count: 0, total: 0 }
        )
        return { ok: true, rows, summary }
      }

      if (key === 'tax') {
        const { data: invs, error } = await client.database
          .from('invoices')
          .select('id,series,number,status,customer_id,currency,subtotal,tax_total,total,created_at')
          .eq('tenant_id', tenantId)
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
          .limit(2500)
        if (error) return { ok: false, error: error.message, rows: [], summary: {} }
        const custMap = await loadCustomerMap((invs || []).map((i) => i.customer_id))
        const rows = (invs || [])
          .filter((i) => {
            const st = String(i.status || '').toLowerCase()
            return st !== 'draft' && st !== 'cancelled' && st !== 'void'
          })
          .map((i) => {
            const c = i.customer_id ? custMap.get(i.customer_id) : null
            const sub = numOr(i.subtotal, 0)
            const tax = numOr(i.tax_total, 0)
            const tot = numOr(i.total, 0)
            const base = tot - tax
            return {
              id: i.id,
              fecha: i.created_at,
              serie: i.series,
              numero: i.number,
              estado: i.status,
              cliente_nombre: c?.name || '',
              base_imponible: sub || Math.max(0, base),
              impuestos: tax,
              total: tot
            }
          })
        const summary = rows.reduce(
          (acc, r) => {
            acc.count += 1
            acc.base_imponible += r.base_imponible
            acc.impuestos += r.impuestos
            acc.total += r.total
            return acc
          },
          { count: 0, base_imponible: 0, impuestos: 0, total: 0 }
        )
        return { ok: true, rows, summary }
      }

      if (key === 'customers') {
        const { data: invs, error } = await client.database
          .from('invoices')
          .select('customer_id,total,created_at,status')
          .eq('tenant_id', tenantId)
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .limit(5000)
        if (error) return { ok: false, error: error.message, rows: [], summary: {} }
        const byC = new Map()
        for (const i of invs || []) {
          const st = String(i.status || '').toLowerCase()
          if (st === 'draft' || st === 'cancelled' || st === 'void') continue
          const cid = i.customer_id || '_sin_cliente'
          if (!byC.has(cid)) {
            byC.set(cid, { customer_id: cid === '_sin_cliente' ? '' : cid, facturas: 0, ventas: 0, ultima_fecha: null })
          }
          const agg = byC.get(cid)
          agg.facturas += 1
          agg.ventas += numOr(i.total, 0)
          const t = i.created_at ? new Date(i.created_at).getTime() : 0
          if (!agg.ultima_fecha || t > new Date(agg.ultima_fecha).getTime()) agg.ultima_fecha = i.created_at
        }
        const ids = [...byC.keys()].filter((k) => k && k !== '_sin_cliente')
        const custMap = await loadCustomerMap(ids)
        const rows = [...byC.values()].map((r) => {
          const c = r.customer_id ? custMap.get(r.customer_id) : null
          return {
            cliente_id: r.customer_id,
            cliente_nombre: c?.name || (r.customer_id ? '—' : '(sin cliente)'),
            facturas: r.facturas,
            ventas: r.ventas,
            ultima_fecha: r.ultima_fecha || ''
          }
        })
        rows.sort((a, b) => b.ventas - a.ventas)
        const summary = {
          clientes: rows.length,
          facturas: rows.reduce((s, r) => s + r.facturas, 0),
          ventas: rows.reduce((s, r) => s + r.ventas, 0)
        }
        return { ok: true, rows, summary }
      }

      if (key === 'top_products') {
        const { data: invs, error: invErr } = await client.database
          .from('invoices')
          .select('id')
          .eq('tenant_id', tenantId)
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
          .limit(2000)
        if (invErr) return { ok: false, error: invErr.message, rows: [], summary: {} }
        const invList = (invs || []).filter(Boolean)
        const invIds = invList.map((i) => i.id)
        if (!invIds.length) return { ok: true, rows: [], summary: { lineas: 0 } }
        const { data: items, error: itErr } = await client.database
          .from('invoice_items')
          .select('product_id,quantity,description,line_kind,invoice_id')
          .in('invoice_id', invIds.slice(0, 2000))
          .limit(8000)
        if (itErr) return { ok: false, error: itErr.message, rows: [], summary: {} }
        const { data: invStatus } = await client.database.from('invoices').select('id,status').in('id', invIds.slice(0, 2000))
        const statusMap = new Map((invStatus || []).map((x) => [x.id, String(x.status || '').toLowerCase()]))
        const agg = new Map()
        for (const it of items || []) {
          const st = statusMap.get(it.invoice_id)
          if (st === 'draft' || st === 'cancelled' || st === 'void') continue
          if (!it.product_id) continue
          const lk = String(it.line_kind || 'product').toLowerCase()
          if (lk === 'service') continue
          const pid = it.product_id
          const q = numOr(it.quantity, 0)
          if (!agg.has(pid)) agg.set(pid, { product_id: pid, unidades: 0, lineas: 0 })
          const a = agg.get(pid)
          a.unidades += q
          a.lineas += 1
        }
        const pids = [...agg.keys()]
        const { data: prods } = await client.database.from('products').select('id,sku,name').in('id', pids).eq('tenant_id', tenantId)
        const prodMap = new Map((prods || []).map((p) => [p.id, p]))
        const rows = [...agg.values()]
          .map((r) => {
            const p = prodMap.get(r.product_id)
            return {
              product_id: r.product_id,
              sku: p?.sku || '',
              nombre: p?.name || r.product_id,
              unidades_vendidas: r.unidades,
              lineas_factura: r.lineas
            }
          })
          .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas)
        const summary = { productos: rows.length, unidades: rows.reduce((s, r) => s + r.unidades_vendidas, 0) }
        return { ok: true, rows, summary }
      }

      if (key === 'ar') {
        const { data: invs, error } = await client.database
          .from('invoices')
          .select('id,series,number,total,amount_paid,status,due_date,customer_id,currency,created_at')
          .eq('tenant_id', tenantId)
          .order('due_date', { ascending: true })
          .limit(2000)
        if (error) return { ok: false, error: error.message, rows: [], summary: {} }
        const custMap = await loadCustomerMap((invs || []).map((i) => i.customer_id))
        const now = Date.now()
        const rows = (invs || [])
          .filter((inv) => {
            const st = String(inv.status || '').toLowerCase()
            if (st === 'draft' || st === 'cancelled' || st === 'void') return false
            const bal = numOr(inv.total, 0) - numOr(inv.amount_paid, 0)
            return bal > 0.0001
          })
          .map((inv) => {
            const c = inv.customer_id ? custMap.get(inv.customer_id) : null
            const bal = numOr(inv.total, 0) - numOr(inv.amount_paid, 0)
            const dueMs = inv.due_date ? new Date(inv.due_date).getTime() : null
            let bucket = 'sin_vencimiento'
            if (dueMs != null) {
              const days = Math.floor((now - dueMs) / 86400000)
              if (days < 0) bucket = 'por_vencer'
              else if (days <= 30) bucket = 'vencido_0_30'
              else if (days <= 60) bucket = 'vencido_31_60'
              else bucket = 'vencido_60_mas'
            }
            return {
              id: inv.id,
              serie: inv.series,
              numero: inv.number,
              cliente_nombre: c?.name || '',
              moneda: inv.currency || 'USD',
              total: numOr(inv.total, 0),
              pagado: numOr(inv.amount_paid, 0),
              saldo: bal,
              vencimiento: inv.due_date || '',
              estado: inv.status,
              antiguedad_bucket: bucket
            }
          })
        const summary = {
          facturas: rows.length,
          saldo_total: rows.reduce((s, r) => s + r.saldo, 0)
        }
        return { ok: true, rows, summary }
      }

      return { ok: false, error: 'unknown dataset', rows: [], summary: {} }
    }

    if (action === 'run_report') {
      const reportKey = String(body.reportKey || '').toLowerCase()
      if (!REPORT_KEYS.has(reportKey)) {
        return new Response(JSON.stringify({ error: 'reportKey invalido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const range = parseRange(body)
      const result = await runDataset(reportKey, range)
      const format = String(body.format || 'json').toLowerCase()
      if (format === 'csv') {
        if (!result.ok) {
          return new Response(JSON.stringify({ ok: false, error: result.error || 'run failed', summary: result.summary }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const sample = result.rows[0] || {}
        const headers = Object.keys(sample)
        if (!headers.length) {
          return new Response(
            JSON.stringify({
              ok: true,
              csv: '\uFEFF',
              filename: `${reportKey}_vacio.csv`,
              summary: result.summary,
              reportKey
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        const csv = rowsToCsv(headers, result.rows)
        await safeLogExport(client, tenantId, actor.id, reportKey, 'csv', { dateFrom: range.fromISO, dateTo: range.toISO, rows: result.rows.length })
        return new Response(
          JSON.stringify({
            ok: true,
            csv,
            filename: `${reportKey}_${range.fromISO.slice(0, 10)}_${range.toISO.slice(0, 10)}.csv`,
            summary: result.summary,
            reportKey
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ ...result, reportKey, range }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_custom_definitions') {
      const { data, error } = await client.database
        .from('custom_report_definitions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
      if (error && /does not exist|relation/i.test(error.message || '')) {
        return new Response(JSON.stringify({ ok: true, rows: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message, rows: [] }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, rows: data || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'save_custom_definition') {
      const name = String(body.name || '').trim()
      const datasetKey = String(body.datasetKey || body.dataset_key || '').toLowerCase()
      if (!name || !CUSTOM_DATASET_KEYS.has(datasetKey)) {
        return new Response(JSON.stringify({ error: 'name y datasetKey valido requeridos' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const columnKeys = Array.isArray(body.columnKeys) ? body.columnKeys : Array.isArray(body.column_keys) ? body.column_keys : []
      const filterJson = body.filterJson && typeof body.filterJson === 'object' ? body.filterJson : body.filter_json && typeof body.filter_json === 'object' ? body.filter_json : {}
      const id = body.id || null
      const row = {
        tenant_id: tenantId,
        name,
        dataset_key: datasetKey,
        column_keys: columnKeys,
        filter_json: filterJson,
        updated_at: new Date().toISOString()
      }
      if (id) {
        const { data, error } = await client.database
          .from('custom_report_definitions')
          .update(row)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('*')
        if (error || !data?.length) {
          return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        return new Response(JSON.stringify({ ok: true, definition: data[0] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data, error } = await client.database.from('custom_report_definitions').insert(row).select('*')
      if (error) {
        return new Response(JSON.stringify({ error: error.message || 'insert failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, definition: data?.[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_custom_definition') {
      const id = body.id
      if (!id) {
        return new Response(JSON.stringify({ error: 'id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { error } = await client.database.from('custom_report_definitions').delete().eq('id', id).eq('tenant_id', tenantId)
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

    if (action === 'run_custom_definition') {
      const id = body.id
      if (!id) {
        return new Response(JSON.stringify({ error: 'id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: defs, error } = await client.database
        .from('custom_report_definitions')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .limit(1)
      if (error || !defs?.length) {
        return new Response(JSON.stringify({ error: 'Plantilla no encontrada' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const def = defs[0]
      let colsRaw = def.column_keys
      if (typeof colsRaw === 'string') {
        try {
          colsRaw = JSON.parse(colsRaw)
        } catch (_) {
          colsRaw = []
        }
      }
      if (!Array.isArray(colsRaw)) colsRaw = []
      const key = String(def.dataset_key || '').toLowerCase()
      if (!CUSTOM_DATASET_KEYS.has(key)) {
        return new Response(JSON.stringify({ error: 'dataset no permitido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const mergedBody = {
        dateFrom: def.filter_json?.dateFrom || body.dateFrom,
        dateTo: def.filter_json?.dateTo || body.dateTo
      }
      const range = parseRange(mergedBody)
      const result = await runDataset(key, range)
      const cols = colsRaw
      let rows = result.rows || []
      if (cols.length && rows.length) {
        rows = rows.map((r) => {
          const o = {}
          for (const c of cols) {
            if (Object.prototype.hasOwnProperty.call(r, c)) o[c] = r[c]
          }
          return Object.keys(o).length ? o : r
        })
      }
      const format = String(body.format || 'json').toLowerCase()
      if (format === 'csv') {
        if (!result.ok) {
          return new Response(JSON.stringify({ ok: false, error: result.error || 'run failed' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const headers = cols.length && rows[0] ? cols.filter((c) => Object.prototype.hasOwnProperty.call(rows[0], c)) : Object.keys(rows[0] || {})
        if (!headers.length) {
          return new Response(JSON.stringify({ ok: true, csv: '\uFEFF', filename: 'custom_vacio.csv', summary: result.summary }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const csv = rowsToCsv(headers, rows)
        await safeLogExport(client, tenantId, actor.id, `custom:${def.name}`, 'csv', { definitionId: id })
        return new Response(
          JSON.stringify({
            ok: true,
            csv,
            filename: `custom_${String(def.name).replace(/\s+/g, '_')}.csv`,
            summary: result.summary
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ ok: result.ok, rows, summary: result.summary, error: result.error, definition: def }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_export_history') {
      const { data, error } = await client.database
        .from('report_exports')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error && /does not exist|relation/i.test(error.message || '')) {
        return new Response(JSON.stringify({ ok: true, rows: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message, rows: [] }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, rows: data || [] }), {
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
