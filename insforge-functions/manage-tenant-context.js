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

  const SETTINGS_KEY = 'zyron_tenant_context'

  const defaultContext = () => ({
    version: 1,
    defaultCurrency: 'DOP',
    defaultLocale: 'es',
    /** ISO 4217 for display; invoices may use their own currency field. */
    priceDisplayCurrency: null
  })

  const parseContext = (raw) => {
    if (!raw || typeof raw !== 'string') return defaultContext()
    try {
      const j = JSON.parse(raw)
      if (!j || typeof j !== 'object') return defaultContext()
      return { ...defaultContext(), ...j }
    } catch (_) {
      return defaultContext()
    }
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

    if (action === 'get_context') {
      let row = null
      try {
        const { data } = await client.database
          .from('app_settings')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('setting_key', SETTINGS_KEY)
          .limit(1)
        row = data?.[0] || null
      } catch (_) {
        row = null
      }
      const rawVal = row?.setting_value ?? row?.value ?? ''
      const context = parseContext(typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal || {}))

      let tenant = null
      try {
        const { data: trows } = await client.database.from('tenants').select('id,display_name,legal_name,slug,status').eq('id', tenantId).limit(1)
        tenant = trows?.[0] || null
      } catch (_) {
        tenant = null
      }

      return new Response(
        JSON.stringify({
          ok: true,
          context,
          tenant,
          isolation: {
            tenantId,
            message: 'All business data for this workspace is keyed by tenant_id; other tenants are not visible with normal policies.'
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (action === 'upsert_context') {
      let existing = null
      try {
        const { data } = await client.database
          .from('app_settings')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('setting_key', SETTINGS_KEY)
          .limit(1)
        existing = data?.[0] || null
      } catch (_) {
        existing = null
      }

      const prev = parseContext(existing?.setting_value ?? existing?.value ?? '')
      const next = { ...prev }

      if (body.defaultCurrency != null) {
        const c = String(body.defaultCurrency).trim().toUpperCase()
        if (/^[A-Z]{3}$/.test(c)) next.defaultCurrency = c
      }
      if (body.defaultLocale != null) {
        const l = String(body.defaultLocale).trim().toLowerCase()
        if (l === 'es' || l === 'en') next.defaultLocale = l
      }
      if (body.priceDisplayCurrency != null) {
        const c = body.priceDisplayCurrency === '' ? null : String(body.priceDisplayCurrency).trim().toUpperCase()
        if (c == null) next.priceDisplayCurrency = null
        else if (/^[A-Z]{3}$/.test(c)) next.priceDisplayCurrency = c
      }

      const jsonStr = JSON.stringify(next)
      const now = new Date().toISOString()
      let err = null
      if (existing?.id) {
        let r = await client.database.from('app_settings').update({ setting_value: jsonStr, updated_at: now }).eq('id', existing.id)
        if (r.error && /setting_value|column .* does not exist/i.test(r.error.message || '')) {
          r = await client.database.from('app_settings').update({ value: jsonStr, updated_at: now }).eq('id', existing.id)
        }
        err = r.error
      } else {
        let r = await client.database.from('app_settings').insert({
          tenant_id: tenantId,
          setting_key: SETTINGS_KEY,
          setting_value: jsonStr,
          updated_at: now
        })
        if (r.error && /setting_value|column .* does not exist/i.test(r.error.message || '')) {
          r = await client.database.from('app_settings').insert({
            tenant_id: tenantId,
            setting_key: SETTINGS_KEY,
            value: jsonStr,
            updated_at: now
          })
        }
        err = r.error
      }

      if (err) {
        return new Response(JSON.stringify({ error: err.message || 'app_settings write failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      try {
        await client.database.from('audit_logs').insert({
          tenant_id: tenantId,
          actor_user_id: actor.id,
          action: 'tenant_context_updated',
          target_type: 'app_settings',
          target_id: tenantId,
          details: { defaultCurrency: next.defaultCurrency, defaultLocale: next.defaultLocale }
        })
      } catch (_) {
        /* */
      }

      return new Response(JSON.stringify({ ok: true, context: next }), {
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
