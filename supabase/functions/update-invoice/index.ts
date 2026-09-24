import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info'
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

const num = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const round2 = (value: unknown) => Math.round(num(value) * 100) / 100

interface ItemInput {
  productId?: string
  product_id?: string
  description?: string
  quantity?: number
  unitPrice?: number
  unit_price?: number
  taxRate?: number
  tax_rate?: number
  discount?: number
  lineKind?: string
  line_kind?: string
}

const totalsFor = (items: ItemInput[]) => {
  let subtotal = 0
  let taxTotal = 0
  let total = 0
  const rows: Array<{
    product_id: string | null
    description: string
    quantity: number
    unit_price: number
    discount: number
    tax_rate: number
    line_total: number
    line_kind: string
  }> = []

  for (const item of Array.isArray(items) ? items : []) {
    const quantity = num(item.quantity)
    const unitPrice = num(item.unitPrice ?? item.unit_price)
    const taxRate = num(item.taxRate ?? item.tax_rate)
    const discount = num(item.discount)
    if (quantity <= 0) continue
    const discounted = quantity * unitPrice * (1 - discount / 100)
    const tax = discounted * (taxRate / 100)
    const lineTotal = discounted + tax
    subtotal += discounted
    taxTotal += tax
    total += lineTotal
    rows.push({
      product_id: item.productId ?? item.product_id ?? null,
      description: String(item.description || '').trim() || 'Linea',
      quantity,
      unit_price: unitPrice,
      discount,
      tax_rate: taxRate,
      line_total: round2(lineTotal),
      line_kind: String(
        item.lineKind ||
          item.line_kind ||
          (item.productId || item.product_id ? 'product' : 'service')
      )
    })
  }
  return { rows, subtotal: round2(subtotal), tax_total: round2(taxTotal), total: round2(total) }
}

const nextNumber = async (
  client: ReturnType<typeof createClient>,
  tenantId: string,
  series: string
) => {
  const { data, error } = await client.rpc('zyron_next_invoice_number', {
    p_tenant_id: tenantId,
    p_series: series
  })
  if (error) throw new Error(error.message || 'No se pudo generar numeracion')
  return String(data || '').trim() || String(Date.now())
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('INSFORGE_BASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const authHeader = req.headers.get('Authorization') || ''

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const body = await req.json()
    const tenantId = body.tenantId || body.tenant_id
    const invoiceId = body.invoiceId || body.invoice_id
    if (!tenantId || !invoiceId) return json({ error: 'tenantId e invoiceId requeridos' }, 400)

    const { data: existingRows, error: existingError } = await client
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', invoiceId)
      .limit(1)

    if (existingError || !existingRows?.[0])
      return json({ error: existingError?.message || 'Documento no encontrado' }, 404)
    const existing = existingRows[0]
    if (String(existing.status).toLowerCase() !== 'draft') {
      return json({ error: 'Solo se editan borradores' }, 400)
    }

    const invoiceType = String(
      body.invoiceType || body.invoice_type || existing.invoice_type || 'standard'
    )
    const issue = String(body.action || '').toLowerCase() === 'issue'
    const series = issue
      ? String(body.series || (invoiceType === 'estimate' ? 'COT' : 'FAC')).trim()
      : existing.series || 'BOR'
    const number = issue ? await nextNumber(client, tenantId, series) : existing.number
    const calc = totalsFor(body.items)
    if (!calc.rows.length) return json({ error: 'Al menos una linea valida es requerida' }, 400)

    const patch: Record<string, unknown> = {
      customer_id: body.customerId || body.customer_id || null,
      parent_invoice_id: body.parentInvoiceId || body.parent_invoice_id || null,
      series,
      number,
      invoice_type: invoiceType,
      subtotal: calc.subtotal,
      tax_total: calc.tax_total,
      total: calc.total,
      due_date: body.dueDate || body.due_date || existing.due_date || null,
      notes: body.notes ?? existing.notes ?? null,
      updated_at: new Date().toISOString()
    }
    if (issue) patch.status = 'pending'

    const { data: updated, error: updateError } = await client
      .from('invoices')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', invoiceId)
      .select()

    if (updateError || !updated?.[0])
      return json({ error: updateError?.message || 'No se pudo actualizar' }, 400)

    await client.from('invoice_items').delete().eq('invoice_id', invoiceId)
    const itemRows = calc.rows.map((row) => ({
      ...row,
      tenant_id: tenantId,
      invoice_id: invoiceId
    }))
    const { error: lineError } = await client.from('invoice_items').insert(itemRows)
    if (lineError) return json({ error: lineError.message || 'Error guardando lineas' }, 400)

    await client.from('audit_logs').insert([
      {
        tenant_id: tenantId,
        action: issue ? `${invoiceType}_issued_from_draft` : `${invoiceType}_draft_updated`,
        target_type: 'invoices',
        target_id: invoiceId,
        details: { series, number, total: calc.total }
      }
    ])

    return json({ ok: true, invoice: { ...updated[0], ...calc } })
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500)
  }
})
