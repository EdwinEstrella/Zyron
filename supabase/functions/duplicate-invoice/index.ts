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

    const { data: invRows, error: invError } = await client
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', invoiceId)
      .limit(1)

    if (invError || !invRows?.[0])
      return json({ error: invError?.message || 'Documento no encontrado' }, 404)
    const source = invRows[0]

    const { data: itemRows, error: itemError } = await client
      .from('invoice_items')
      .select('product_id,description,quantity,unit_price,discount,tax_rate,line_total,line_kind')
      .eq('invoice_id', invoiceId)

    if (itemError)
      return json({ error: itemError.message || 'No se pudieron leer las lineas' }, 400)

    const copy = {
      tenant_id: tenantId,
      customer_id: source.customer_id || null,
      parent_invoice_id: source.parent_invoice_id || null,
      series: 'BOR',
      number: `BOR-${Date.now()}`,
      invoice_type: source.invoice_type || 'standard',
      currency: source.currency || 'DOP',
      subtotal: source.subtotal || 0,
      tax_total: source.tax_total || 0,
      total: source.total || 0,
      status: 'draft',
      notes: source.notes
        ? `Duplicado de ${source.series || ''}-${source.number || ''}\n${source.notes}`.trim()
        : null
    }

    const { data: inserted, error: insertError } = await client
      .from('invoices')
      .insert([copy])
      .select()
    if (insertError || !inserted?.[0])
      return json({ error: insertError?.message || 'No se pudo duplicar' }, 400)
    const invoice = inserted[0]

    if (itemRows?.length) {
      const rows = itemRows.map((line: any) => ({
        ...line,
        tenant_id: tenantId,
        invoice_id: invoice.id
      }))
      const { error: linesError } = await client.from('invoice_items').insert(rows)
      if (linesError) return json({ error: linesError.message || 'No se copiaron las lineas' }, 400)
    }

    await client.from('audit_logs').insert([
      {
        tenant_id: tenantId,
        action: `${copy.invoice_type}_duplicated`,
        target_type: 'invoices',
        target_id: invoice.id,
        details: { source_id: invoiceId }
      }
    ])

    return json({ ok: true, invoice })
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500)
  }
})
