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
    const quantity = num(item.quantity, 0)
    const unitPrice = num(item.unitPrice ?? item.unit_price, 0)
    const taxRate = num(item.taxRate ?? item.tax_rate, 0)
    const discount = num(item.discount, 0)
    if (quantity <= 0) continue
    const base = quantity * unitPrice
    const discounted = base * (1 - discount / 100)
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

const currentAppUserId = async (client: ReturnType<typeof createClient>) => {
  const { data } = await client.auth.getUser()
  const authId = data?.user?.id
  if (!authId) return null
  const { data: rows } = await client
    .from('app_users')
    .select('id')
    .eq('auth_user_id', authId)
    .limit(1)
  return rows?.[0]?.id || null
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
    if (!tenantId) return json({ error: 'tenantId requerido' }, 400)

    const invoiceType = String(body.invoiceType || body.invoice_type || 'standard')
    const isDraft = body.isDraft !== false
    const series = isDraft
      ? 'BOR'
      : String(body.series || (invoiceType === 'estimate' ? 'COT' : 'FAC')).trim()
    const number = isDraft ? `BOR-${Date.now()}` : await nextNumber(client, tenantId, series)
    const calc = totalsFor(body.items)

    if (!calc.rows.length) return json({ error: 'Al menos una linea valida es requerida' }, 400)

    const actorId = await currentAppUserId(client)
    const invoiceRow = {
      tenant_id: tenantId,
      customer_id: body.customerId || body.customer_id || null,
      parent_invoice_id: body.parentInvoiceId || body.parent_invoice_id || null,
      series,
      number,
      invoice_type: invoiceType,
      currency: String(body.currency || 'DOP').toUpperCase(),
      subtotal: calc.subtotal,
      tax_total: calc.tax_total,
      total: calc.total,
      // A document becomes issued only in the accounting RPC, after its event
      // and any inventory movement have been committed together.
      status: 'draft',
      due_date: body.dueDate || body.due_date || null,
      notes: body.notes || null,
      created_by: actorId
    }

    const { data: inserted, error: invError } = await client
      .from('invoices')
      .insert([invoiceRow])
      .select()
    if (invError || !inserted?.[0])
      return json({ error: invError?.message || 'No se pudo crear el documento' }, 400)
    const invoice = inserted[0]

    const itemRows = calc.rows.map((row) => ({
      ...row,
      tenant_id: tenantId,
      invoice_id: invoice.id
    }))
    const { error: itemError } = await client.from('invoice_items').insert(itemRows)
    if (itemError)
      return json({ error: itemError.message || 'No se pudieron crear las lineas' }, 400)

    if (!isDraft) {
      const { error: postingError } = await client.rpc('zyron_post_invoice_issue', {
        p_tenant_id: tenantId,
        p_invoice_id: invoice.id
      })
      if (postingError) return json({ error: postingError.message || 'No se pudo contabilizar la emisión' }, 400)
    }

    await client.from('audit_logs').insert([
      {
        tenant_id: tenantId,
        actor_user_id: actorId,
        action: isDraft ? `${invoiceType}_draft_created` : `${invoiceType}_issued`,
        target_type: 'invoices',
        target_id: invoice.id,
        details: { series, number, total: calc.total }
      }
    ])

    return json({
      ok: true,
      invoice: { ...invoice, subtotal: calc.subtotal, tax_total: calc.tax_total, total: calc.total }
    })
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500)
  }
})
