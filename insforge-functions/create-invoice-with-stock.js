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
    const { tenantId, customerId, series = 'FAC', currency = 'USD', items = [], notes = '' } = payload

    if (!tenantId || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'tenantId and items are required' }), {
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

    const { data: actorRows } = await client.database
      .from('app_users')
      .select('*')
      .eq('auth_user_id', currentUser.id)
      .limit(1)

    if (!actorRows?.length) {
      return new Response(JSON.stringify({ error: 'App user not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const actor = actorRows[0]

    const { data: countRows } = await client.database
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('series', series)

    const nextNumber = String((countRows?.length || 0) + 1).padStart(6, '0')

    let subtotal = 0
    let taxTotal = 0
    const lineItems = []

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

      lineItems.push({
        tenant_id: tenantId,
        product_id: item.productId || null,
        description: item.description || 'Item',
        quantity,
        unit_price: unitPrice,
        discount,
        tax_rate: taxRate,
        line_total: lineTotal
      })
    }

    const total = subtotal + taxTotal

    const { data: invoiceRows, error: invoiceError } = await client.database
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        customer_id: customerId || null,
        series,
        number: nextNumber,
        invoice_type: 'standard',
        currency,
        subtotal,
        tax_total: taxTotal,
        total,
        status: 'pending',
        notes,
        created_by: actor.id
      })
      .select('*')

    if (invoiceError || !invoiceRows?.length) {
      return new Response(JSON.stringify({ error: invoiceError?.message || 'Unable to create invoice' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const invoice = invoiceRows[0]
    const itemRows = lineItems.map((item) => ({
      ...item,
      invoice_id: invoice.id
    }))

    await client.database.from('invoice_items').insert(itemRows)

    for (const item of items) {
      if (!item.productId || Number(item.quantity || 0) <= 0) continue

      await client.database
        .from('products')
        .update({
          stock: Math.max(Number(item.currentStock || 0) - Number(item.quantity || 0), 0)
        })
        .eq('id', item.productId)
        .eq('tenant_id', tenantId)

      await client.database
        .from('inventory_kardex')
        .insert({
          tenant_id: tenantId,
          product_id: item.productId,
          movement_type: 'out',
          quantity: Number(item.quantity || 0),
          unit_cost: Number(item.unitCost || 0),
          reference_type: 'invoice',
          reference_id: invoice.id,
          created_by: actor.id
        })
    }

    await client.database
      .from('audit_logs')
      .insert({
        tenant_id: tenantId,
        actor_user_id: actor.id,
        action: 'invoice_created',
        target_type: 'invoices',
        target_id: invoice.id,
        details: { items: items.length, total }
      })

    return new Response(JSON.stringify({
      ok: true,
      invoice
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
