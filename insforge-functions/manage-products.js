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

    if (action === 'seed_categories') {
      const defaults = [
        { code: 'general', label: 'General', sort_order: 10 },
        { code: 'servicios', label: 'Servicios', sort_order: 20 },
        { code: 'repuestos', label: 'Repuestos', sort_order: 30 }
      ]
      for (const d of defaults) {
        const { error: insErr } = await client.database.from('product_categories').insert({
          tenant_id: tenantId,
          code: d.code,
          label: d.label,
          sort_order: d.sort_order
        })
        if (insErr && !/duplicate|unique/i.test(insErr.message || '')) {
          return new Response(JSON.stringify({ error: insErr.message || 'seed failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
      const { data: rows } = await client.database
        .from('product_categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
      return new Response(JSON.stringify({ ok: true, rows: rows || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_categories') {
      const { data, error } = await client.database
        .from('product_categories')
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

    if (action === 'upsert_category') {
      const id = body.id || null
      const code = String(body.code || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
      const label = String(body.label || '').trim()
      if (!code || !label) {
        return new Response(JSON.stringify({ error: 'code and label required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const row = {
        code,
        label,
        parent_id: body.parentId || body.parent_id || null,
        sort_order: Number(body.sortOrder ?? body.sort_order ?? 0)
      }
      if (id) {
        const { data, error } = await client.database
          .from('product_categories')
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
        return new Response(JSON.stringify({ ok: true, category: data[0] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data, error } = await client.database
        .from('product_categories')
        .insert({ tenant_id: tenantId, ...row })
        .select('*')
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'insert failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, category: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_category') {
      const categoryId = body.categoryId
      if (!categoryId) {
        return new Response(JSON.stringify({ error: 'categoryId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { error } = await client.database.from('product_categories').delete().eq('id', categoryId).eq('tenant_id', tenantId)
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

    if (action === 'list_units') {
      const { data, error } = await client.database
        .from('measurement_units')
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

    if (action === 'seed_units') {
      const defaults = [
        { code: 'unit', label: 'Unidad', symbol: 'u', sort_order: 10 },
        { code: 'hour', label: 'Hora', symbol: 'h', sort_order: 20 },
        { code: 'day', label: 'Dia', symbol: 'd', sort_order: 30 },
        { code: 'kg', label: 'Kilogramo', symbol: 'kg', sort_order: 40 },
        { code: 'g', label: 'Gramo', symbol: 'g', sort_order: 50 },
        { code: 'lb', label: 'Libra', symbol: 'lb', sort_order: 60 },
        { code: 'm', label: 'Metro', symbol: 'm', sort_order: 70 },
        { code: 'm2', label: 'Metro cuadrado', symbol: 'm2', sort_order: 80 },
        { code: 'm3', label: 'Metro cubico', symbol: 'm3', sort_order: 90 },
        { code: 'box', label: 'Caja', symbol: 'cj', sort_order: 100 },
        { code: 'pack', label: 'Paquete', symbol: 'paq', sort_order: 110 }
      ]
      for (const d of defaults) {
        const { error: insErr } = await client.database.from('measurement_units').insert({
          tenant_id: tenantId,
          code: d.code,
          label: d.label,
          symbol: d.symbol,
          sort_order: d.sort_order
        })
        if (insErr && !/duplicate|unique/i.test(insErr.message || '')) {
          return new Response(JSON.stringify({ error: insErr.message || 'seed failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
      const { data: rows } = await client.database
        .from('measurement_units')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
      return new Response(JSON.stringify({ ok: true, rows: rows || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_unit') {
      const unitId = body.unitId
      if (!unitId) {
        return new Response(JSON.stringify({ error: 'unitId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { error } = await client.database.from('measurement_units').delete().eq('id', unitId).eq('tenant_id', tenantId)
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

    if (action === 'list_catalog') {
      const q = body.q ? String(body.q).trim().toLowerCase() : ''
      const categoryId = body.categoryId || null
      const itemKind = body.itemKind ? String(body.itemKind).toLowerCase() : null
      const includeInactive = Boolean(body.includeInactive)
      const { data: prows, error: pErr } = await client.database
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .limit(1000)
      if (pErr) {
        return new Response(JSON.stringify({ ok: false, error: pErr.message, rows: [] }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      let rows = prows || []
      if (!includeInactive) rows = rows.filter((p) => p.is_active !== false)
      if (itemKind === 'product' || itemKind === 'service') {
        rows = rows.filter((p) => String(p.item_kind || 'product').toLowerCase() === itemKind)
      }
      if (categoryId) rows = rows.filter((p) => String(p.category_id || '') === String(categoryId))
      if (q) {
        rows = rows.filter((p) => {
          const blob = [p.name, p.sku, p.description].map((x) => String(x || '').toLowerCase()).join(' ')
          return blob.includes(q)
        })
      }
      const [{ data: cats }, { data: unts }] = await Promise.all([
        client.database.from('product_categories').select('id,label,code').eq('tenant_id', tenantId),
        client.database.from('measurement_units').select('id,label,code,symbol').eq('tenant_id', tenantId)
      ])
      const catMap = new Map((cats || []).map((c) => [c.id, c]))
      const unitMap = new Map((unts || []).map((u) => [u.id, u]))
      const enriched = rows.map((p) => ({
        ...p,
        category: p.category_id ? catMap.get(p.category_id) : null,
        unit: p.unit_id ? unitMap.get(p.unit_id) : null
      }))
      return new Response(JSON.stringify({ ok: true, rows: enriched }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'get_product') {
      const productId = body.productId
      if (!productId) {
        return new Response(JSON.stringify({ error: 'productId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data, error } = await client.database.from('products').select('*').eq('id', productId).eq('tenant_id', tenantId).limit(1)
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, product: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'create_product') {
      const sku = String(body.sku || '').trim()
      const name = String(body.name || '').trim()
      if (!sku || !name) {
        return new Response(JSON.stringify({ error: 'sku and name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const itemKind = String(body.itemKind || body.item_kind || 'product').toLowerCase() === 'service' ? 'service' : 'product'
      const tracksStock =
        itemKind === 'service'
          ? false
          : body.tracksStock !== undefined
            ? Boolean(body.tracksStock)
            : body.tracks_stock !== undefined
              ? Boolean(body.tracks_stock)
              : true
      const insertRow = {
        tenant_id: tenantId,
        sku,
        name,
        description: body.description != null ? String(body.description) : null,
        price: numOr(body.price, 0),
        stock: itemKind === 'service' && !tracksStock ? 0 : numOr(body.stock, 0),
        min_stock: numOr(body.minStock ?? body.min_stock, 0),
        category_id: body.categoryId || body.category_id || null,
        unit_id: body.unitId || body.unit_id || null,
        item_kind: itemKind,
        tracks_stock: tracksStock,
        tax_rate_default: numOr(body.tax_rate_default ?? body.taxRateDefault, 18),
        discount_default: numOr(body.discount_default ?? body.discountDefault, 0),
        cost_price: body.costPrice != null || body.cost_price != null ? numOr(body.costPrice ?? body.cost_price, null) : null,
        is_active: body.isActive === false || body.is_active === false ? false : true
      }
      let { data, error } = await client.database.from('products').insert(insertRow).select('*')
      if (error && /column .* does not exist/i.test(error.message || '')) {
        const slim = {
          tenant_id: tenantId,
          sku,
          name,
          description: insertRow.description,
          price: insertRow.price,
          stock: insertRow.stock,
          min_stock: insertRow.min_stock
        }
        ;({ data, error } = await client.database.from('products').insert(slim).select('*'))
      }
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'insert failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      await syncDefaultWarehouseStock(client, tenantId, data[0].id, data[0].stock, data[0].item_kind, data[0].tracks_stock)
      return new Response(JSON.stringify({ ok: true, product: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'update_product') {
      const productId = body.productId
      if (!productId) {
        return new Response(JSON.stringify({ error: 'productId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const patch = {}
      if (body.sku != null) patch.sku = String(body.sku).trim()
      if (body.name != null) patch.name = String(body.name).trim()
      if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description)
      if (body.price !== undefined) patch.price = numOr(body.price, 0)
      if (body.stock !== undefined) patch.stock = numOr(body.stock, 0)
      if (body.minStock !== undefined || body.min_stock !== undefined) patch.min_stock = numOr(body.minStock ?? body.min_stock, 0)
      if (body.categoryId !== undefined || body.category_id !== undefined) {
        patch.category_id = body.categoryId ?? body.category_id ?? null
      }
      if (body.unitId !== undefined || body.unit_id !== undefined) patch.unit_id = body.unitId ?? body.unit_id ?? null
      if (body.itemKind != null || body.item_kind != null) {
        const ik = String(body.itemKind || body.item_kind).toLowerCase()
        patch.item_kind = ik === 'service' ? 'service' : 'product'
      }
      if (body.tracksStock !== undefined || body.tracks_stock !== undefined) {
        patch.tracks_stock = Boolean(body.tracksStock ?? body.tracks_stock)
      }
      if (body.taxRateDefault !== undefined || body.tax_rate_default !== undefined) {
        patch.tax_rate_default = numOr(body.taxRateDefault ?? body.tax_rate_default, null)
      }
      if (body.discountDefault !== undefined || body.discount_default !== undefined) {
        patch.discount_default = numOr(body.discountDefault ?? body.discount_default, 0)
      }
      if (body.costPrice !== undefined || body.cost_price !== undefined) {
        patch.cost_price = body.costPrice == null && body.cost_price == null ? null : numOr(body.costPrice ?? body.cost_price, null)
      }
      if (body.isActive !== undefined || body.is_active !== undefined) {
        patch.is_active = Boolean(body.isActive ?? body.is_active)
      }
      let { data, error } = await client.database.from('products').update(patch).eq('id', productId).eq('tenant_id', tenantId).select('*')
      if (error && /column .* does not exist/i.test(error.message || '')) {
        const slim = {}
        for (const k of ['sku', 'name', 'description', 'price', 'stock', 'min_stock']) {
          if (patch[k] !== undefined) slim[k] = patch[k]
        }
        ;({ data, error } = await client.database.from('products').update(slim).eq('id', productId).eq('tenant_id', tenantId).select('*'))
      }
      if (error || !data?.length) {
        return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (patch.stock !== undefined || patch.item_kind !== undefined || patch.tracks_stock !== undefined) {
        await syncDefaultWarehouseStock(client, tenantId, productId, data[0].stock, data[0].item_kind, data[0].tracks_stock)
      }
      return new Response(JSON.stringify({ ok: true, product: data[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'export_catalog') {
      const { data: prows, error: pErr } = await client.database
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sku', { ascending: true })
        .limit(5000)
      if (pErr) {
        return new Response(JSON.stringify({ ok: false, error: pErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const res = await invokeListCatalogLike(client, tenantId, prows || [])
      const lines = [
        [
          'sku',
          'name',
          'item_kind',
          'price',
          'cost_price',
          'stock',
          'tracks_stock',
          'tax_rate_default',
          'discount_default',
          'category',
          'unit',
          'is_active'
        ].join(',')
      ]
      for (const r of res) {
        lines.push(
          [
            csvEsc(r.sku),
            csvEsc(r.name),
            r.item_kind || 'product',
            String(r.price ?? ''),
            r.cost_price == null ? '' : String(r.cost_price),
            String(r.stock ?? ''),
            r.tracks_stock === false ? '0' : '1',
            r.tax_rate_default == null ? '' : String(r.tax_rate_default),
            r.discount_default == null ? '' : String(r.discount_default),
            csvEsc(r.category?.label || ''),
            csvEsc(r.unit?.label || ''),
            r.is_active === false ? '0' : '1'
          ].join(',')
        )
      }
      const csv = '\ufeff' + lines.join('\n')
      return new Response(JSON.stringify({ ok: true, format: 'csv', filename: 'catalogo_productos.csv', csv }), {
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

async function syncDefaultWarehouseStock(client, tenantId, productId, stockQty, itemKind, tracksStock) {
  try {
    if (String(itemKind || '').toLowerCase() === 'service') return
    if (tracksStock === false) return
    const { data: wh } = await client.database.from('warehouses').select('id').eq('tenant_id', tenantId).eq('is_default', true).limit(1)
    const wid = wh?.[0]?.id
    if (!wid) return
    const n = Number(stockQty)
    const qty = Number.isFinite(n) ? n : 0
    await client.database.from('warehouse_stock').upsert(
      { warehouse_id: wid, product_id: productId, quantity: qty, updated_at: new Date().toISOString() },
      { onConflict: 'warehouse_id,product_id' }
    )
  } catch (_) {
    /* almacenes opcionales hasta migrar SQL */
  }
}

function numOr(v, def) {
  if (v === null || v === undefined || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

function csvEsc(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function invokeListCatalogLike(client, tenantId, rows) {
  const [{ data: cats }, { data: unts }] = await Promise.all([
    client.database.from('product_categories').select('id,label,code').eq('tenant_id', tenantId),
    client.database.from('measurement_units').select('id,label,code,symbol').eq('tenant_id', tenantId)
  ])
  const catMap = new Map((cats || []).map((c) => [c.id, c]))
  const unitMap = new Map((unts || []).map((u) => [u.id, u]))
  return rows.map((p) => ({
    ...p,
    category: p.category_id ? catMap.get(p.category_id) : null,
    unit: p.unit_id ? unitMap.get(p.unit_id) : null
  }))
}
