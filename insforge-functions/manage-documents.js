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

  const SETTINGS_KEY = 'invoice_document_branding'
  const MAX_LOGO_CHARS = 480000

  const defaultSettings = () => ({
    version: 1,
    templateId: 'classic',
    accentHex: '#0f2744',
    footerLegal: '',
    logoDataUrl: '',
    companyDisplayName: '',
    showLineDiscounts: true
  })

  const templateCatalog = () => [
    {
      id: 'classic',
      label: 'Clasica',
      description: 'Tabla con bordes, barra de color en cabecera. Apta para oficina y archivo.'
    },
    {
      id: 'minimal',
      label: 'Minimal',
      description: 'Tipografia amplia, poco marco. Ideal para marcas limpias.'
    },
    {
      id: 'compact',
      label: 'Compacta',
      description: 'Alta densidad; util para copia impresa o ticket largo en una pagina.'
    }
  ]

  function parseSettings(raw) {
    if (!raw || typeof raw !== 'string') return defaultSettings()
    try {
      const j = JSON.parse(raw)
      if (!j || typeof j !== 'object') return defaultSettings()
      return { ...defaultSettings(), ...j }
    } catch (_) {
      return defaultSettings()
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

    if (action === 'get_settings') {
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
      const settings = parseSettings(typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal || {}))
      return new Response(
        JSON.stringify({
          ok: true,
          settings,
          templates: templateCatalog(),
          rowId: row?.id || null
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (action === 'upsert_settings') {
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

      const prev = parseSettings(existing?.setting_value ?? existing?.value ?? '')
      const next = { ...prev }
      if (body.templateId != null) {
        const t = String(body.templateId).trim()
        if (['classic', 'minimal', 'compact'].includes(t)) next.templateId = t
      }
      if (body.accentHex != null) {
        const h = String(body.accentHex).trim()
        if (/^#[0-9a-fA-F]{3,8}$/.test(h)) next.accentHex = h.slice(0, 9)
      }
      if (body.footerLegal != null) next.footerLegal = String(body.footerLegal).slice(0, 4000)
      if (body.companyDisplayName != null) next.companyDisplayName = String(body.companyDisplayName).slice(0, 200)
      if (body.showLineDiscounts != null) next.showLineDiscounts = Boolean(body.showLineDiscounts)
      if (body.logoDataUrl !== undefined) {
        const logo = body.logoDataUrl === null || body.logoDataUrl === '' ? '' : String(body.logoDataUrl)
        if (logo.length > MAX_LOGO_CHARS) {
          return new Response(JSON.stringify({ error: 'Logo demasiado grande (max ~350KB en base64). Usa una imagen mas pequena.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        if (logo && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(logo)) {
          return new Response(JSON.stringify({ error: 'Logo debe ser data URL de imagen (png, jpeg, webp o gif).' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        next.logoDataUrl = logo
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
        const insertRow = {
          tenant_id: tenantId,
          setting_key: SETTINGS_KEY,
          setting_value: jsonStr,
          updated_at: now
        }
        let r = await client.database.from('app_settings').insert(insertRow)
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
          action: 'document_branding_updated',
          target_type: 'app_settings',
          target_id: tenantId,
          details: { keys: Object.keys(next) }
        })
      } catch (_) {
        /* */
      }

      return new Response(JSON.stringify({ ok: true, settings: next, templates: templateCatalog() }), {
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
