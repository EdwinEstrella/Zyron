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

    if (action === 'list_methods') {
      const { data, error } = await client.database.from('payment_methods_catalog').select('*').eq('tenant_id', tenantId)
      if (error) {
        return new Response(JSON.stringify({ ok: true, rows: [], error: error.message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const rows = (data || []).slice().sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      return new Response(JSON.stringify({ ok: true, rows }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'seed_methods') {
      const defaults = [
        { code: 'cash', label: 'Efectivo', sort_order: 10 },
        { code: 'card', label: 'Tarjeta', sort_order: 20 },
        { code: 'transfer', label: 'Transferencia', sort_order: 30 },
        { code: 'digital_wallet', label: 'Billetera digital', sort_order: 40 },
        { code: 'other', label: 'Otro', sort_order: 90 }
      ]
      for (const d of defaults) {
        const { error: insErr } = await client.database.from('payment_methods_catalog').insert({
          tenant_id: tenantId,
          code: d.code,
          label: d.label,
          sort_order: d.sort_order,
          is_active: true
        })
        if (insErr && !/duplicate|unique/i.test(insErr.message || '')) {
          return new Response(JSON.stringify({ error: insErr.message || 'seed failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
      const { data: rows } = await client.database.from('payment_methods_catalog').select('*').eq('tenant_id', tenantId)
      const sorted = (rows || []).slice().sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      return new Response(JSON.stringify({ ok: true, rows: sorted }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_payments') {
      const { data, error } = await client.database
        .from('payments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('id', { ascending: false })
        .limit(120)
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

    if (action === 'list_allocations') {
      const paymentId = body.paymentId
      if (!paymentId) {
        return new Response(JSON.stringify({ error: 'paymentId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data, error } = await client.database.from('payment_allocations').select('*').eq('payment_id', paymentId).eq('tenant_id', tenantId)
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

    if (action === 'list_ar') {
      const { data: invs, error } = await client.database
        .from('invoices')
        .select('id,series,number,total,amount_paid,status,due_date,customer_id,currency,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message, rows: [] }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const rows = (invs || [])
        .filter((inv) => {
          const st = String(inv.status || '').toLowerCase()
          if (st === 'draft' || st === 'cancelled' || st === 'void') return false
          const bal = Number(inv.total || 0) - Number(inv.amount_paid || 0)
          return bal > 0.0001
        })
        .map((inv) => ({
          ...inv,
          balance_due: Number(inv.total || 0) - Number(inv.amount_paid || 0)
        }))
      return new Response(JSON.stringify({ ok: true, rows }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'set_invoice_due_date') {
      const { invoiceId, dueDate } = body
      if (!invoiceId) {
        return new Response(JSON.stringify({ error: 'invoiceId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const patch = { due_date: dueDate || null }
      const { data, error } = await client.database.from('invoices').update(patch).eq('id', invoiceId).eq('tenant_id', tenantId).select('*')
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      await recalcInvoiceFinancials(client, tenantId, invoiceId)
      return new Response(JSON.stringify({ ok: true, invoice: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'create_payment') {
      const amount = Number(body.amount || 0)
      if (!(amount > 0)) {
        return new Response(JSON.stringify({ error: 'amount must be > 0' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const code = String(body.paymentMethodCode || body.paymentMethod || 'cash').toLowerCase()
      const allocations = Array.isArray(body.allocations) ? body.allocations : []
      let allocSum = 0
      for (const a of allocations) {
        allocSum += Number(a.amount || 0)
      }
      if (allocSum - amount > 0.0001) {
        return new Response(JSON.stringify({ error: 'La suma aplicada a facturas no puede superar el monto del pago' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const insertPayment = {
        tenant_id: tenantId,
        amount,
        status: String(body.status || 'completed').toLowerCase() === 'pending' ? 'pending' : 'completed',
        paid_at: body.paidAt || new Date().toISOString(),
        payment_method: code,
        payment_method_code: code,
        currency: String(body.currency || 'USD'),
        customer_id: body.customerId || null,
        reference: body.reference || null,
        notes: body.notes || null,
        gateway_provider: body.gatewayProvider || null,
        gateway_transaction_id: body.gatewayTransactionId || null,
        reconciliation_status: 'unmatched',
        unallocated_amount: Math.max(0, amount - allocSum)
      }

      let payRows
      let payErr
      ;({ data: payRows, error: payErr } = await client.database.from('payments').insert(insertPayment).select('*'))
      if (payErr && /column .* does not exist/i.test(payErr.message || '')) {
        const slim = {
          tenant_id: tenantId,
          amount,
          status: insertPayment.status,
          paid_at: insertPayment.paid_at,
          payment_method: code
        }
        ;({ data: payRows, error: payErr } = await client.database.from('payments').insert(slim).select('*'))
      }
      if (payErr || !payRows?.length) {
        return new Response(JSON.stringify({ error: payErr?.message || 'payment insert failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const payment = payRows[0]

      const touchedInvoices = new Set()
      for (const a of allocations) {
        const invId = a.invoiceId
        const amt = Number(a.amount || 0)
        if (!invId || !(amt > 0)) continue
        const { data: invRows } = await client.database.from('invoices').select('id,total,amount_paid,status,tenant_id').eq('id', invId).limit(1)
        const inv = invRows?.[0]
        if (!inv || String(inv.tenant_id) !== String(tenantId)) {
          await client.database.from('payments').delete().eq('id', payment.id)
          return new Response(JSON.stringify({ error: 'Factura invalida para el tenant' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const st = String(inv.status || '').toLowerCase()
        if (st === 'draft') {
          await client.database.from('payments').delete().eq('id', payment.id)
          return new Response(JSON.stringify({ error: 'No se puede aplicar pago a borrador' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const open = Number(inv.total || 0) - Number(inv.amount_paid || 0)
        if (amt - open > 0.0001) {
          await client.database.from('payments').delete().eq('id', payment.id)
          return new Response(JSON.stringify({ error: `Monto excede saldo abierto en factura ${invId}` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const { error: alErr } = await client.database.from('payment_allocations').insert({
          tenant_id: tenantId,
          payment_id: payment.id,
          invoice_id: invId,
          amount: amt
        })
        if (alErr) {
          await client.database.from('payment_allocations').delete().eq('payment_id', payment.id)
          await client.database.from('payments').delete().eq('id', payment.id)
          return new Response(JSON.stringify({ error: alErr.message || 'allocation failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        touchedInvoices.add(invId)
      }

      for (const invId of touchedInvoices) {
        await recalcInvoiceFinancials(client, tenantId, invId)
      }

      return new Response(JSON.stringify({ ok: true, payment }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'set_reconciliation') {
      const { paymentId, reconciliationStatus, matchedBankReference } = body
      if (!paymentId) {
        return new Response(JSON.stringify({ error: 'paymentId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const patch = {
        reconciliation_status: String(reconciliationStatus || 'unmatched'),
        matched_bank_reference: matchedBankReference != null ? String(matchedBankReference) : null
      }
      const { data, error } = await client.database.from('payments').update(patch).eq('id', paymentId).eq('tenant_id', tenantId).select('*')
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, payment: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'run_reminders') {
      const horizonDays = Math.min(30, Math.max(1, Number(body.horizonDays || 7)))
      const now = Date.now()
      const horizon = now + horizonDays * 86400000
      const { data: invs } = await client.database
        .from('invoices')
        .select('id,total,amount_paid,due_date,status,series,number')
        .eq('tenant_id', tenantId)
      const candidates = (invs || []).filter((inv) => {
        const st = String(inv.status || '').toLowerCase()
        if (st === 'draft' || st === 'paid' || st === 'cancelled' || st === 'void') return false
        const bal = Number(inv.total || 0) - Number(inv.amount_paid || 0)
        if (bal <= 0.0001) return false
        if (!inv.due_date) return false
        const t = new Date(inv.due_date).getTime()
        if (Number.isNaN(t)) return false
        return t <= horizon
      })
      const created = []
      for (const inv of candidates) {
        const { data: ins, error: insErr } = await client.database
          .from('payment_reminder_log')
          .insert({
            tenant_id: tenantId,
            invoice_id: inv.id,
            kind: new Date(inv.due_date).getTime() < now ? 'overdue' : 'due_soon',
            channel: 'manual',
            meta: { series: inv.series, number: inv.number, balance: Number(inv.total || 0) - Number(inv.amount_paid || 0) }
          })
          .select('id')
        if (!insErr && ins?.length) created.push(ins[0])
      }
      return new Response(JSON.stringify({ ok: true, queued: created.length, candidates: candidates.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_reminder_log') {
      const { data, error } = await client.database
        .from('payment_reminder_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(80)
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

    if (action === 'ingest_gateway_event') {
      const provider = String(body.provider || 'stripe')
      const externalId = body.externalId ? String(body.externalId) : null
      const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
      const { data: ev, error: evErr } = await client.database
        .from('payment_gateway_events')
        .insert({
          tenant_id: tenantId,
          provider,
          external_id: externalId,
          payload,
          matched_payment_id: null
        })
        .select('*')
      if (evErr) {
        return new Response(JSON.stringify({ error: evErr.message || 'gateway event insert failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      let matched = null
      if (externalId) {
        const { data: payMatch } = await client.database
          .from('payments')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('gateway_transaction_id', externalId)
          .limit(1)
        if (payMatch?.length) {
          matched = payMatch[0].id
          await client.database.from('payment_gateway_events').update({ matched_payment_id: matched }).eq('id', ev[0].id)
        }
      }
      return new Response(JSON.stringify({ ok: true, event: ev[0], matchedPaymentId: matched }), {
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

async function recalcInvoiceFinancials(client, tenantId, invoiceId) {
  const { data: invRows } = await client.database.from('invoices').select('total,status,due_date').eq('id', invoiceId).eq('tenant_id', tenantId).limit(1)
  if (!invRows?.length) return
  const inv = invRows[0]
  const st0 = String(inv.status || '').toLowerCase()
  if (st0 === 'draft' || st0 === 'cancelled' || st0 === 'void') return

  const { data: allocs } = await client.database.from('payment_allocations').select('amount').eq('invoice_id', invoiceId)
  const paid = (allocs || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const total = Number(inv.total || 0)
  let nextStatus = st0
  if (paid >= total - 0.0001) nextStatus = 'paid'
  else if (paid > 0.0001) nextStatus = 'partial'
  else {
    const dueMs = inv.due_date ? new Date(inv.due_date).getTime() : null
    if (dueMs != null && !Number.isNaN(dueMs) && dueMs < Date.now()) nextStatus = 'overdue'
    else nextStatus = 'pending'
  }
  const patch = { amount_paid: paid, status: nextStatus }
  await client.database.from('invoices').update(patch).eq('id', invoiceId).eq('tenant_id', tenantId)
}
