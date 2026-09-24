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

    const { data: rows, error: findError } = await client
      .from('invoices')
      .select('id,status,invoice_type')
      .eq('tenant_id', tenantId)
      .eq('id', invoiceId)
      .limit(1)

    if (findError || !rows?.[0])
      return json({ error: findError?.message || 'Documento no encontrado' }, 404)
    const status = String(rows[0].status || '').toLowerCase()
    if (!['draft', 'pending', 'rejected', 'cancelled'].includes(status)) {
      return json({ error: 'Este estado no permite eliminacion directa' }, 400)
    }

    await client.from('invoice_items').delete().eq('invoice_id', invoiceId)
    const { error: deleteError } = await client
      .from('invoices')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', invoiceId)

    if (deleteError) return json({ error: deleteError.message || 'No se pudo eliminar' }, 400)

    await client.from('audit_logs').insert([
      {
        tenant_id: tenantId,
        action: `${rows[0].invoice_type || 'invoice'}_deleted`,
        target_type: 'invoices',
        target_id: invoiceId,
        details: { previous_status: status }
      }
    ])

    return json({ ok: true })
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500)
  }
})
