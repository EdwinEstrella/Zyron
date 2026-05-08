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

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (value) => Math.round(num(value) * 100) / 100;

const totalsFor = (items) => {
  let subtotal = 0;
  let taxTotal = 0;
  let total = 0;
  const rows = [];
  for (const item of Array.isArray(items) ? items : []) {
    const quantity = num(item.quantity, 0);
    const unitPrice = num(item.unitPrice ?? item.unit_price, 0);
    const taxRate = num(item.taxRate ?? item.tax_rate, 0);
    const discount = num(item.discount, 0);
    if (quantity <= 0) continue;
    const base = quantity * unitPrice;
    const discounted = base * (1 - discount / 100);
    const tax = discounted * (taxRate / 100);
    const lineTotal = discounted + tax;
    subtotal += discounted;
    taxTotal += tax;
    total += lineTotal;
    rows.push({
      product_id: item.productId ?? item.product_id ?? null,
      description: String(item.description || '').trim() || 'Linea',
      quantity,
      unit_price: unitPrice,
      discount,
      tax_rate: taxRate,
      line_total: round2(lineTotal),
      line_kind: String(item.lineKind || item.line_kind || (item.productId || item.product_id ? 'product' : 'service'))
    });
  }
  return { rows, subtotal: round2(subtotal), tax_total: round2(taxTotal), total: round2(total) };
};

const currentAppUserId = async (client) => {
  const { data } = await client.auth.getCurrentUser();
  const authId = data?.user?.id;
  if (!authId) return null;
  const { data: rows } = await client.database
    .from('app_users')
    .select('id')
    .eq('auth_user_id', authId)
    .limit(1);
  return rows?.[0]?.id || null;
};

const nextNumber = async (client, tenantId, series) => {
  const { data, error } = await client.database.rpc('zyron_next_invoice_number', {
    p_tenant_id: tenantId,
    p_series: series
  });
  if (error) throw new Error(error.message || 'No se pudo generar numeracion');
  return String(data || '').trim() || String(Date.now());
};

const adjustStockOnIssue = async (client, tenantId, itemRows, invoiceType, isDraft) => {
  if (isDraft || invoiceType !== 'standard') return;
  for (const line of itemRows) {
    if (line.line_kind !== 'product' || !line.product_id) continue;
    const { data: rows } = await client.database
      .from('products')
      .select('id,stock,tracks_stock,item_kind')
      .eq('tenant_id', tenantId)
      .eq('id', line.product_id)
      .limit(1);
    const product = rows?.[0];
    if (!product || product.tracks_stock === false || String(product.item_kind || '').toLowerCase() === 'service') continue;
    await client.database
      .from('products')
      .update({ stock: round2(num(product.stock) - num(line.quantity)) })
      .eq('tenant_id', tenantId)
      .eq('id', line.product_id)
      .select();
  }
};

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
    if (!tenantId) return json({ error: 'tenantId requerido' }, 400);
    const invoiceType = String(body.invoiceType || body.invoice_type || 'standard');
    const isDraft = body.isDraft !== false;
    const series = isDraft ? 'BOR' : String(body.series || (invoiceType === 'estimate' ? 'COT' : 'FAC')).trim();
    const number = isDraft ? `BOR-${Date.now()}` : await nextNumber(client, tenantId, series);
    const calc = totalsFor(body.items);
    if (!calc.rows.length) return json({ error: 'Al menos una linea valida es requerida' }, 400);
    const actorId = await currentAppUserId(client);
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
      status: isDraft ? 'draft' : 'pending',
      due_date: body.dueDate || body.due_date || null,
      notes: body.notes || null,
      created_by: actorId
    };
    const { data: inserted, error: invError } = await client.database.from('invoices').insert([invoiceRow]).select();
    if (invError || !inserted?.[0]) return json({ error: invError?.message || 'No se pudo crear el documento' }, 400);
    const invoice = inserted[0];
    const itemRows = calc.rows.map((row) => ({ ...row, tenant_id: tenantId, invoice_id: invoice.id }));
    const { error: itemError } = await client.database.from('invoice_items').insert(itemRows).select();
    if (itemError) return json({ error: itemError.message || 'No se pudieron crear las lineas' }, 400);
    await adjustStockOnIssue(client, tenantId, itemRows, invoiceType, isDraft);
    await client.database.from('audit_logs').insert([{
      tenant_id: tenantId,
      actor_user_id: actorId,
      action: isDraft ? `${invoiceType}_draft_created` : `${invoiceType}_issued`,
      target_type: 'invoices',
      target_id: invoice.id,
      details: { series, number, total: calc.total }
    }]).select();
    return json({ ok: true, invoice: { ...invoice, subtotal: calc.subtotal, tax_total: calc.tax_total, total: calc.total } });
  } catch (error) {
    return json({ error: error.message || String(error) }, 500);
  }
}
