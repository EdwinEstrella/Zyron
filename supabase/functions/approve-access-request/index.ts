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

const slugifyTenant = (text: string) => {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '-')
}

const currentAppUserId = async (
  userClient: ReturnType<typeof createClient>,
  adminClient: ReturnType<typeof createClient>
) => {
  const { data } = await userClient.auth.getUser()
  const authId = data?.user?.id
  if (!authId) return null
  const { data: rows } = await adminClient
    .from('app_users')
    .select('id')
    .eq('auth_user_id', authId)
    .limit(1)
  return rows?.[0]?.id || null
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
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
      Deno.env.get('INSFORGE_API_KEY') ||
      Deno.env.get('SERVICE_ROLE_KEY') ||
      ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        { error: 'Falta configuración de Supabase URL o Service Role Key en el entorno.' },
        500
      )
    }

    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    let body: { requestId?: string; action?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    const { requestId, action } = body
    if (!requestId || !action) {
      return json({ error: 'Faltan parametros requeridos (requestId, action)' }, 400)
    }

    const actorId = await currentAppUserId(userClient, adminClient)

    const { data: reqRows, error: reqErr } = await adminClient
      .from('user_access_requests')
      .select('*')
      .eq('id', requestId)
      .limit(1)

    if (reqErr || !reqRows?.length) {
      return json({ error: reqErr?.message || 'Solicitud no encontrada.' }, 404)
    }

    const request = reqRows[0]
    const now = new Date().toISOString()

    if (action === 'reject') {
      const { error: updErr } = await adminClient
        .from('user_access_requests')
        .update({
          status: 'rejected',
          request_status: 'rejected',
          updated_at: now,
          reviewed_by: actorId
        })
        .eq('id', requestId)

      if (updErr) return json({ error: updErr.message }, 500)
      return json({ ok: true, action: 'reject' })
    }

    if (action !== 'approve') {
      return json({ error: 'Accion invalida.' }, 400)
    }

    const email = String(
      request.requested_email || request.email || request.request_payload?.email || ''
    )
      .trim()
      .toLowerCase()
    if (!email) return json({ error: 'La solicitud no tiene correo.' }, 400)

    const fullName =
      request.full_name ||
      request.username ||
      request.request_payload?.username ||
      email.split('@')[0]
    const companyName = request.company_name || request.request_payload?.company_name || 'Empresa'

    let { data: appRows } = await adminClient
      .from('app_users')
      .select('*')
      .eq('email', email)
      .limit(1)

    let appUser = appRows?.[0] || null

    if (!appUser) {
      const { data: insRows, error: insErr } = await adminClient
        .from('app_users')
        .insert([
          {
            email,
            full_name: fullName,
            global_role: 'user',
            status: 'active'
          }
        ])
        .select()

      if (insErr || !insRows?.length)
        return json({ error: insErr?.message || 'No se pudo crear app_user.' }, 500)
      appUser = insRows[0]
    } else {
      const { data: updRows, error: updErr } = await adminClient
        .from('app_users')
        .update({
          full_name: appUser.full_name || fullName,
          global_role: 'user',
          status: 'active',
          updated_at: now
        })
        .eq('id', appUser.id)
        .select()

      if (updErr) return json({ error: updErr.message }, 500)
      appUser = updRows?.[0] || appUser
    }

    const slug = `${slugifyTenant(companyName)}-${Date.now().toString(36)}`
    const { data: tenRows, error: tenErr } = await adminClient
      .from('tenants')
      .insert([
        {
          slug,
          display_name: companyName,
          legal_name: companyName,
          email,
          status: 'active',
          created_by: appUser.id
        }
      ])
      .select()

    if (tenErr || !tenRows?.length)
      return json({ error: tenErr?.message || 'No se pudo crear empresa.' }, 500)
    const tenant = tenRows[0]

    const { error: memErr } = await adminClient.from('tenant_memberships').insert([
      {
        tenant_id: tenant.id,
        app_user_id: appUser.id,
        role_key: 'tenant_admin',
        status: 'active',
        is_owner: true
      }
    ])

    if (memErr) return json({ error: memErr.message }, 500)

    const { error: reqUpdErr } = await adminClient
      .from('user_access_requests')
      .update({
        status: 'approved',
        request_status: 'approved',
        reviewed_by: actorId,
        updated_at: now
      })
      .eq('id', requestId)

    if (reqUpdErr) return json({ error: reqUpdErr.message }, 500)

    await adminClient.from('audit_logs').insert([
      {
        tenant_id: tenant.id,
        actor_user_id: actorId || appUser.id,
        action: 'access_request_approved',
        target_type: 'user_access_requests',
        target_id: requestId,
        details: { email, app_user_id: appUser.id, tenant_id: tenant.id }
      }
    ])

    return json({ ok: true, tenant, appUser })
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500)
  }
})
