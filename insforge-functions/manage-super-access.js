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
    const { action } = body
    if (!action) {
      return new Response(JSON.stringify({ error: 'action is required' }), {
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

    const { data: appRows } = await client.database.from('app_users').select('*').eq('auth_user_id', currentUser.id).limit(1)
    if (!appRows?.length || appRows[0].global_role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const actor = appRows[0]

    const safeAudit = async (row) => {
      try {
        await client.database.from('audit_logs').insert(row)
      } catch (_) {
        /* best-effort */
      }
    }

    const chunk = (arr, n) => {
      const out = []
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
      return out
    }

    const fetchInChunks = async (table, col, ids, select) => {
      const uniq = [...new Set((ids || []).filter(Boolean))]
      const all = []
      for (const part of chunk(uniq, 80)) {
        const { data, error } = await client.database.from(table).select(select).in(col, part)
        if (error) throw new Error(error.message)
        all.push(...(data || []))
      }
      return all
    }

    if (action === 'list_memberships') {
      const limit = Math.min(Math.max(Number(body.limit) || 350, 1), 500)
      let q = client.database.from('tenant_memberships').select('*').order('created_at', { ascending: false }).limit(limit)
      if (body.tenantId) q = q.eq('tenant_id', body.tenantId)
      if (body.status) q = q.eq('status', String(body.status))
      const { data: mems, error: memErr } = await q
      if (memErr) {
        return new Response(JSON.stringify({ ok: false, error: memErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const memList = mems || []
      const uids = memList.map((m) => m.app_user_id)
      const tids = memList.map((m) => m.tenant_id)
      const [users, tenants] = await Promise.all([
        fetchInChunks('app_users', 'id', uids, 'id,email,global_role,status,created_at'),
        fetchInChunks('tenants', 'id', tids, 'id,display_name,legal_name,slug,status')
      ])
      const userMap = new Map(users.map((u) => [u.id, u]))
      const tenantMap = new Map(tenants.map((t) => [t.id, t]))
      const qEmail = String(body.emailQ || '').trim().toLowerCase()
      let rows = memList.map((m) => ({
        membership_id: m.id,
        tenant_id: m.tenant_id,
        app_user_id: m.app_user_id,
        role_key: m.role_key,
        status: m.status,
        is_owner: Boolean(m.is_owner),
        created_at: m.created_at,
        user: userMap.get(m.app_user_id) || null,
        tenant: tenantMap.get(m.tenant_id) || null
      }))
      if (qEmail) {
        rows = rows.filter((r) => String(r.user?.email || '').toLowerCase().includes(qEmail))
      }
      return new Response(JSON.stringify({ ok: true, rows }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'patch_membership') {
      const membershipId = body.membershipId
      if (!membershipId) {
        return new Response(JSON.stringify({ error: 'membershipId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: memRows } = await client.database.from('tenant_memberships').select('*').eq('id', membershipId).limit(1)
      if (!memRows?.length) {
        return new Response(JSON.stringify({ error: 'Membership not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const mem = memRows[0]
      const patch = {}
      if (body.roleKey != null && String(body.roleKey).trim()) {
        const rk = String(body.roleKey).trim()
        const { data: rc } = await client.database
          .from('role_catalog')
          .select('id')
          .eq('tenant_id', mem.tenant_id)
          .eq('role_key', rk)
          .limit(1)
        if (!rc?.length) {
          return new Response(JSON.stringify({ error: `role_key ${rk} no existe en role_catalog de esta empresa` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        patch.role_key = rk
      }
      if (body.status != null && String(body.status).trim()) {
        const st = String(body.status).trim().toLowerCase()
        if (!['active', 'suspended'].includes(st)) {
          return new Response(JSON.stringify({ error: 'Invalid membership status (use active or suspended)' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        patch.status = st
      }
      if (body.isOwner != null) {
        patch.is_owner = Boolean(body.isOwner)
      }
      if (Object.keys(patch).length === 0) {
        return new Response(JSON.stringify({ error: 'No fields to update' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: updated, error: upErr } = await client.database
        .from('tenant_memberships')
        .update(patch)
        .eq('id', membershipId)
        .select('*')
      if (upErr || !updated?.length) {
        return new Response(JSON.stringify({ error: upErr?.message || 'Update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      await safeAudit({
        tenant_id: mem.tenant_id,
        actor_user_id: actor.id,
        action: 'super_membership_patch',
        target_type: 'tenant_memberships',
        target_id: membershipId,
        details: { before: mem, patch, actor_email: actor.email }
      })
      return new Response(JSON.stringify({ ok: true, membership: updated[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'patch_app_user') {
      const appUserId = body.appUserId
      if (!appUserId) {
        return new Response(JSON.stringify({ error: 'appUserId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: targets } = await client.database.from('app_users').select('*').eq('id', appUserId).limit(1)
      if (!targets?.length) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const before = targets[0]
      const patch = {}
      if (body.status != null && String(body.status).trim()) {
        const st = String(body.status).trim().toLowerCase()
        if (!['pending', 'approved', 'active', 'inactive', 'suspended', 'blocked'].includes(st)) {
          return new Response(JSON.stringify({ error: 'Invalid app user status' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        patch.status = st
      }
      if (body.globalRole != null && String(body.globalRole).trim()) {
        const gr = String(body.globalRole).trim().toLowerCase()
        if (gr === 'super_admin') {
          return new Response(JSON.stringify({ error: 'Promoting to super_admin via API is disabled' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        if (gr !== 'user') {
          return new Response(JSON.stringify({ error: 'globalRole must be user when set via super API' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        if (before.global_role === 'super_admin') {
          const { count, error: cErr } = await client.database
            .from('app_users')
            .select('*', { count: 'exact', head: true })
            .eq('global_role', 'super_admin')
          if (cErr) {
            return new Response(JSON.stringify({ error: cErr.message }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
          if ((count || 0) < 2) {
            return new Response(JSON.stringify({ error: 'Cannot demote the last super_admin' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
        }
        patch.global_role = 'user'
      }
      if (Object.keys(patch).length === 0) {
        return new Response(JSON.stringify({ error: 'No fields to update' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: updated, error: upErr } = await client.database.from('app_users').update(patch).eq('id', appUserId).select('*')
      if (upErr || !updated?.length) {
        return new Response(JSON.stringify({ error: upErr?.message || 'app_users update failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      await safeAudit({
        tenant_id: null,
        actor_user_id: actor.id,
        action: 'super_app_user_patch',
        target_type: 'app_users',
        target_id: appUserId,
        details: { before, patch, actor_email: actor.email }
      })
      return new Response(JSON.stringify({ ok: true, user: updated[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_platform_user') {
      const appUserId = body.appUserId
      if (!appUserId) {
        return new Response(JSON.stringify({ error: 'appUserId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (appUserId === actor.id) {
        return new Response(JSON.stringify({ error: 'Cannot delete your own app user row' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: targets } = await client.database.from('app_users').select('*').eq('id', appUserId).limit(1)
      if (!targets?.length) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const target = targets[0]
      if (target.global_role === 'super_admin') {
        return new Response(JSON.stringify({ error: 'Cannot delete super_admin' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      await client.database.from('tenant_memberships').delete().eq('app_user_id', appUserId)
      const { error: delErr } = await client.database.from('app_users').delete().eq('id', appUserId)
      if (delErr) {
        return new Response(JSON.stringify({ error: delErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      await safeAudit({
        tenant_id: null,
        actor_user_id: actor.id,
        action: 'super_delete_platform_user',
        target_type: 'app_users',
        target_id: appUserId,
        details: { email: target.email, actor_email: actor.email }
      })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_super_audit') {
      const limit = Math.min(Math.max(Number(body.limit) || 80, 1), 200)
      const { data: rows, error } = await client.database
        .from('audit_logs')
        .select('*')
        .or(
          'action.eq.super_membership_patch,action.eq.super_app_user_patch,action.eq.super_delete_platform_user'
        )
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message, rows: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, rows: rows || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'role_member_counts') {
      const tenantId = body.tenantId
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenantId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: mems, error } = await client.database.from('tenant_memberships').select('role_key,status').eq('tenant_id', tenantId)
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const counts = {}
      const countsSuspended = {}
      for (const m of mems || []) {
        const rk = m.role_key || 'unknown'
        const active = String(m.status || '').toLowerCase() === 'active'
        if (active) counts[rk] = (counts[rk] || 0) + 1
        else countsSuspended[rk] = (countsSuspended[rk] || 0) + 1
      }
      return new Response(JSON.stringify({ ok: true, counts, counts_non_active: countsSuspended }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'permission_matrix') {
      const tenantId = body.tenantId
      if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenantId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
        client.database.from('role_catalog').select('*').eq('tenant_id', tenantId).order('hierarchy_level', { ascending: true }),
        client.database.from('permission_catalog').select('*').order('permission_key', { ascending: true }),
        client.database.from('role_permissions').select('role_id,permission_id')
      ])
      const permById = new Map((perms || []).map((p) => [p.id, p.permission_key]))
      const keysByRole = new Map()
      for (const row of rp || []) {
        const key = permById.get(row.permission_id)
        if (!key) continue
        if (!keysByRole.has(row.role_id)) keysByRole.set(row.role_id, new Set())
        keysByRole.get(row.role_id).add(key)
      }
      const matrix = (roles || []).map((r) => ({
        role_key: r.role_key,
        label: r.label,
        hierarchy_level: r.hierarchy_level,
        is_system: r.is_system,
        permissions: [...(keysByRole.get(r.id) || [])].sort()
      }))
      return new Response(JSON.stringify({ ok: true, matrix, permission_keys: (perms || []).map((p) => p.permission_key).sort() }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
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
