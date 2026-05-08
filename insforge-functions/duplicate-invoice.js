import { createClient } from 'npm:@insforge/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') || null;
    const client = createClient({
      baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
      edgeFunctionToken: token
    });
    const body = await req.json();
    const tenantId = body.tenantId || body.tenant_id;
    const invoiceId = body.invoiceId || body.invoice_id;
    if (!tenantId || !invoiceId) return json({ error: 'tenantId e invoiceId requeridos' }, 400);
    const { data: invRows, error: invError } = await client.database
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', invoiceId)
      .limit(1);
    if (invError || !invRows?.[0]) return json({ error: invError?.message || 'Documento no encontrado' }, 404);
    const source = invRows[0];
    const { data: itemRows, error: itemError } = await client.database
      .from('invoice_items')
      .select('product_id,description,quantity,unit_price,discount,tax_rate,line_total,line_kind')
      .eq('invoice_id', invoiceId);
    if (itemError) return json({ error: itemError.message || 'No se pudieron leer las lineas' }, 400);
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
      notes: source.notes ? `Duplicado de ${source.series || ''}-${source.number || ''}\n${source.notes}`.trim() : null
    };
    const { data: inserted, error: insertError } = await client.database.from('invoices').insert([copy]).select();
    if (insertError || !inserted?.[0]) return json({ error: insertError?.message || 'No se pudo duplicar' }, 400);
    const invoice = inserted[0];
    if (itemRows?.length) {
      const rows = itemRows.map((line) => ({
        ...line,
        tenant_id: tenantId,
        invoice_id: invoice.id
      }));
      const { error: linesError } = await client.database.from('invoice_items').insert(rows).select();
      if (linesError) return json({ error: linesError.message || 'No se copiaron las lineas' }, 400);
    }
    await client.database.from('audit_logs').insert([{
      tenant_id: tenantId,
      action: `${copy.invoice_type}_duplicated`,
      target_type: 'invoices',
      target_id: invoice.id,
      details: { source_id: invoiceId }
    }]).select();
    return json({ ok: true, invoice });
  } catch (error) {
    return json({ error: error.message || String(error) }, 500);
  }
}
