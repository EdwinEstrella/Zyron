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

  function numOr(v, d) {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
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

    async function getDefaultWarehouseId() {
      try {
        const { data: d } = await client.database
          .from('warehouses')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('is_default', true)
          .limit(1)
        if (d?.[0]?.id) return d[0].id
        const { data: a } = await client.database
          .from('warehouses')
          .select('id')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .limit(1)
        return a?.[0]?.id || null
      } catch (_) {
        return null
      }
    }

    if (action === 'bootstrap') {
      let { data: whs, error: whErr } = await client.database.from('warehouses').select('id,is_default').eq('tenant_id', tenantId)
      if (whErr && /does not exist|relation/i.test(whErr.message || '')) {
        return new Response(JSON.stringify({ ok: false, error: 'Tablas de inventario no instaladas. Ejecuta inventory_module_advanced.sql.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (whErr) {
        return new Response(JSON.stringify({ ok: false, error: whErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      let wid = (whs || []).find((w) => w.is_default)?.id || whs?.[0]?.id
      if (!whs?.length) {
        const { data: ins, error: insErr } = await client.database
          .from('warehouses')
          .insert({
            tenant_id: tenantId,
            code: 'principal',
            label: 'Principal',
            is_default: true,
            is_active: true
          })
          .select('id')
        if (insErr && !/duplicate|unique/i.test(insErr.message || '')) {
          return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        if (ins?.[0]?.id) wid = ins[0].id
        else {
          const { data: again } = await client.database.from('warehouses').select('id').eq('tenant_id', tenantId).limit(1)
          wid = again?.[0]?.id
        }
      }
      if (!wid) {
        return new Response(JSON.stringify({ ok: true, defaultWarehouseId: null, backfilled: 0 }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: prods } = await client.database
        .from('products')
        .select('id,stock,tracks_stock,item_kind')
        .eq('tenant_id', tenantId)
        .limit(5000)
      let backfilled = 0
      for (const p of prods || []) {
        if (String(p.item_kind || '').toLowerCase() === 'service') continue
        if (p.tracks_stock === false) continue
        const qty = numOr(p.stock, 0)
        const { data: ex } = await client.database
          .from('warehouse_stock')
          .select('warehouse_id')
          .eq('warehouse_id', wid)
          .eq('product_id', p.id)
          .limit(1)
        if (ex?.length) continue
        if (qty === 0) continue
        const { error: wsErr } = await client.database.from('warehouse_stock').insert({
          warehouse_id: wid,
          product_id: p.id,
          quantity: qty
        })
        if (!wsErr) backfilled += 1
      }
      return new Response(JSON.stringify({ ok: true, defaultWarehouseId: wid, backfilled }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_warehouses') {
      const { data, error } = await client.database
        .from('warehouses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('is_default', { ascending: false })
        .order('label', { ascending: true })
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

    if (action === 'upsert_warehouse') {
      const code = String(body.code || '').trim().toLowerCase()
      const label = String(body.label || '').trim()
      if (!code || !label) {
        return new Response(JSON.stringify({ error: 'code and label required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const id = body.id || body.warehouseId || null
      const isDefault = Boolean(body.isDefault ?? body.is_default)
      const isActive = body.isActive === false || body.is_active === false ? false : true

      if (isDefault) {
        await client.database.from('warehouses').update({ is_default: false }).eq('tenant_id', tenantId)
      }

      if (id) {
        const { data, error } = await client.database
          .from('warehouses')
          .update({
            code,
            label,
            is_default: isDefault,
            is_active: isActive
          })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select('*')
        if (error || !data?.length) {
          return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        return new Response(JSON.stringify({ ok: true, warehouse: data[0] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data, error } = await client.database
        .from('warehouses')
        .insert({
          tenant_id: tenantId,
          code,
          label,
          is_default: isDefault,
          is_active: isActive
        })
        .select('*')
      if (error) {
        return new Response(JSON.stringify({ error: error.message || 'insert failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, warehouse: data?.[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_warehouse') {
      const warehouseId = body.warehouseId || body.id
      if (!warehouseId) {
        return new Response(JSON.stringify({ error: 'warehouseId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: rows } = await client.database.from('warehouse_stock').select('quantity').eq('warehouse_id', warehouseId)
      const sum = (rows || []).reduce((s, r) => s + Math.abs(numOr(r.quantity, 0)), 0)
      if (sum > 0.0001) {
        return new Response(JSON.stringify({ error: 'El almacen tiene existencias; transfiere o ajusta a cero antes de eliminar.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { error } = await client.database.from('warehouses').delete().eq('id', warehouseId).eq('tenant_id', tenantId)
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

    if (action === 'list_stock_by_warehouse') {
      const warehouseId = body.warehouseId || (await getDefaultWarehouseId())
      if (!warehouseId) {
        return new Response(JSON.stringify({ ok: true, rows: [], err: 'Sin almacen. Usa bootstrap o crea un almacen.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: prods, error: pErr } = await client.database
        .from('products')
        .select('id,sku,name,stock,min_stock,tracks_stock,item_kind')
        .eq('tenant_id', tenantId)
        .order('sku', { ascending: true })
        .limit(5000)
      if (pErr) {
        return new Response(JSON.stringify({ ok: false, error: pErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: wsRows } = await client.database.from('warehouse_stock').select('product_id,quantity').eq('warehouse_id', warehouseId)
      const wsMap = new Map((wsRows || []).map((r) => [r.product_id, numOr(r.quantity, 0)]))
      const rows = (prods || [])
        .filter((p) => String(p.item_kind || '').toLowerCase() !== 'service' && p.tracks_stock !== false)
        .map((p) => {
          const wq = wsMap.has(p.id) ? wsMap.get(p.id) : numOr(p.stock, 0)
          return {
            product_id: p.id,
            sku: p.sku,
            name: p.name,
            quantity_warehouse: wq,
            quantity_catalog: numOr(p.stock, 0),
            min_stock: numOr(p.min_stock, 0)
          }
        })
      return new Response(JSON.stringify({ ok: true, warehouseId, rows }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_kardex') {
      const limit = Math.min(500, Math.max(1, numOr(body.limit, 100)))
      let q = client.database
        .from('inventory_kardex')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(limit)
      const wh = body.warehouseId || body.warehouse_id
      if (wh) q = q.eq('warehouse_id', wh)
      const pid = body.productId || body.product_id
      if (pid) q = q.eq('product_id', pid)
      const { data: krows, error } = await q
      if (error) {
        return new Response(JSON.stringify({ ok: true, rows: [], err: error.message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const pids = [...new Set((krows || []).map((k) => k.product_id).filter(Boolean))]
      const whids = [...new Set((krows || []).map((k) => k.warehouse_id).filter(Boolean))]
      const prodMap = new Map()
      const whMap = new Map()
      if (pids.length) {
        const { data: pr } = await client.database.from('products').select('id,sku,name').in('id', pids)
        for (const p of pr || []) prodMap.set(p.id, p)
      }
      if (whids.length) {
        const { data: w } = await client.database.from('warehouses').select('id,label,code').in('id', whids)
        for (const x of w || []) whMap.set(x.id, x)
      }
      const rows = (krows || []).map((k) => ({
        ...k,
        product: prodMap.get(k.product_id) || null,
        warehouse: k.warehouse_id ? whMap.get(k.warehouse_id) || null : null
      }))
      return new Response(JSON.stringify({ ok: true, rows }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_low_stock') {
      const warehouseId = body.warehouseId || null
      const { data: prods } = await client.database
        .from('products')
        .select('id,sku,name,min_stock,stock,tracks_stock,item_kind')
        .eq('tenant_id', tenantId)
        .limit(5000)
      const tracked = (prods || []).filter(
        (p) => String(p.item_kind || '').toLowerCase() !== 'service' && p.tracks_stock !== false && numOr(p.min_stock, 0) > 0
      )
      if (!warehouseId) {
        const rows = tracked
          .filter((p) => numOr(p.stock, 0) <= numOr(p.min_stock, 0))
          .map((p) => ({
            product_id: p.id,
            sku: p.sku,
            name: p.name,
            quantity: numOr(p.stock, 0),
            min_stock: numOr(p.min_stock, 0),
            scope: 'total_catalogo'
          }))
        return new Response(JSON.stringify({ ok: true, rows }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: wsRows } = await client.database.from('warehouse_stock').select('product_id,quantity').eq('warehouse_id', warehouseId)
      const wsMap = new Map((wsRows || []).map((r) => [r.product_id, numOr(r.quantity, 0)]))
      const rows = []
      for (const p of tracked) {
        const qn = wsMap.has(p.id) ? wsMap.get(p.id) : numOr(p.stock, 0)
        if (qn <= numOr(p.min_stock, 0)) {
          rows.push({
            product_id: p.id,
            sku: p.sku,
            name: p.name,
            quantity: qn,
            min_stock: numOr(p.min_stock, 0),
            warehouse_id: warehouseId,
            scope: 'almacen'
          })
        }
      }
      return new Response(JSON.stringify({ ok: true, warehouseId, rows }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'manual_adjust') {
      const warehouseId = body.warehouseId || body.warehouse_id
      const productId = body.productId || body.product_id
      const delta = numOr(body.quantityDelta ?? body.quantity_delta, 0)
      const reason = String(body.reason || body.notes || '').trim() || 'Ajuste manual'
      if (!warehouseId || !productId || delta === 0) {
        return new Response(JSON.stringify({ error: 'warehouseId, productId y quantityDelta distinto de cero son requeridos' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: whCheck } = await client.database.from('warehouses').select('id').eq('id', warehouseId).eq('tenant_id', tenantId).limit(1)
      if (!whCheck?.length) {
        return new Response(JSON.stringify({ error: 'Almacen no encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: prodRows } = await client.database
        .from('products')
        .select('id,stock,price,tracks_stock,item_kind')
        .eq('id', productId)
        .eq('tenant_id', tenantId)
        .limit(1)
      const prod = prodRows?.[0]
      if (!prod) {
        return new Response(JSON.stringify({ error: 'Producto no encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const track = prod && Object.prototype.hasOwnProperty.call(prod, 'tracks_stock') ? prod.tracks_stock !== false : true
      const isService = String(prod?.item_kind || '').toLowerCase() === 'service'
      if (!track || isService) {
        return new Response(JSON.stringify({ error: 'Este articulo no admite ajustes de inventario' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const curP = numOr(prod.stock, 0)
      const nextP = Math.max(0, curP + delta)
      const { data: wsExist } = await client.database
        .from('warehouse_stock')
        .select('quantity')
        .eq('warehouse_id', warehouseId)
        .eq('product_id', productId)
        .limit(1)
      const curW = wsExist?.length ? numOr(wsExist[0].quantity, 0) : curP
      const nextW = Math.max(0, curW + delta)

      const { error: uWs } = await client.database
        .from('warehouse_stock')
        .upsert(
          { warehouse_id: warehouseId, product_id: productId, quantity: nextW, updated_at: new Date().toISOString() },
          { onConflict: 'warehouse_id,product_id' }
        )
      if (uWs) {
        return new Response(JSON.stringify({ error: uWs.message || 'warehouse_stock failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error: uP } = await client.database.from('products').update({ stock: nextP }).eq('id', productId).eq('tenant_id', tenantId)
      if (uP) {
        return new Response(JSON.stringify({ error: uP.message || 'products update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const kPayload = {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        product_id: productId,
        movement_type: 'adjustment',
        quantity: delta,
        unit_cost: numOr(prod.price, 0),
        reference_type: 'manual',
        reference_id: null,
        notes: reason,
        created_by: actor.id
      }
      let { error: kErr } = await client.database.from('inventory_kardex').insert(kPayload)
      if (kErr && /column .* does not exist/i.test(kErr.message || '')) {
        const slim = {
          tenant_id: tenantId,
          product_id: productId,
          movement_type: 'adjustment',
          quantity: delta,
          unit_cost: numOr(prod.price, 0),
          reference_type: 'manual',
          created_by: actor.id
        }
        ;({ error: kErr } = await client.database.from('inventory_kardex').insert(slim))
      }
      if (kErr) {
        return new Response(JSON.stringify({ error: kErr.message || 'kardex failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ ok: true, productStock: nextP, warehouseStock: nextW }), {
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
