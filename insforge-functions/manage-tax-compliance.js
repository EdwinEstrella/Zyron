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

    const { data: mem } = await client.database
      .from('tenant_memberships')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('app_user_id', actorRows[0].id)
      .eq('status', 'active')
      .limit(1)
    if (!mem?.length) {
      return new Response(JSON.stringify({ error: 'Forbidden for this tenant' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'get_hints') {
      let settings = null
      try {
        const { data } = await client.database.from('tenant_fiscal_settings').select('*').eq('tenant_id', tenantId).limit(1)
        settings = data?.[0] || null
      } catch (_) {
        settings = null
      }
      const defRate = settings ? numOr(settings.default_tax_rate, 18) : 18
      const label = settings?.tax_label || 'ITBIS'
      let defaultTaxRate = defRate
      try {
        const { data: rates } = await client.database
          .from('tax_rates_catalog')
          .select('code,label,rate_percent,is_default')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        const defRow = (rates || []).find((r) => r.is_default)
        if (defRow) defaultTaxRate = numOr(defRow.rate_percent, defRate)
      } catch (_) {
        /* */
      }
      return new Response(
        JSON.stringify({
          ok: true,
          defaultTaxRate,
          taxLabel: label,
          pricesTaxInclusive: Boolean(settings?.prices_tax_inclusive),
          ncfEnabled: Boolean(settings?.ncf_enabled),
          countryCode: settings?.country_code || 'DO',
          withholding: {
            isrOnSubtotalPct: numOr(settings?.withholding_isr_on_subtotal_pct, 0),
            itbisOnTaxPct: numOr(settings?.withholding_itbis_on_tax_pct, 0)
          },
          electronicRequested: Boolean(settings?.electronic_invoicing_requested),
          companyRnc: settings?.company_rnc || null,
          companyLegalName: settings?.company_legal_name || null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'get_settings') {
      let data = null
      let err = null
      try {
        const r = await client.database.from('tenant_fiscal_settings').select('*').eq('tenant_id', tenantId).limit(1)
        data = r.data?.[0] || null
        err = r.error
      } catch (e) {
        err = e
      }
      if (err && /does not exist|relation/i.test(err.message || '')) {
        return new Response(JSON.stringify({ ok: true, settings: null, missingSql: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, settings: data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'upsert_settings') {
      const { data: existingRows } = await client.database.from('tenant_fiscal_settings').select('*').eq('tenant_id', tenantId).limit(1)
      const cur = existingRows?.[0] || {}
      const has = (a, b) => body[a] !== undefined || body[b] !== undefined

      const row = {
        tenant_id: tenantId,
        country_code: has('countryCode', 'country_code')
          ? String(body.countryCode || body.country_code || 'DO')
              .slice(0, 2)
              .toUpperCase()
          : cur.country_code || 'DO',
        tax_label: has('taxLabel', 'tax_label')
          ? String(body.taxLabel || body.tax_label || 'ITBIS').slice(0, 40)
          : cur.tax_label || 'ITBIS',
        default_tax_rate: has('defaultTaxRate', 'default_tax_rate')
          ? numOr(body.defaultTaxRate ?? body.default_tax_rate, 18)
          : numOr(cur.default_tax_rate, 18),
        prices_tax_inclusive: has('pricesTaxInclusive', 'prices_tax_inclusive')
          ? Boolean(body.pricesTaxInclusive ?? body.prices_tax_inclusive)
          : Boolean(cur.prices_tax_inclusive),
        ncf_enabled: has('ncfEnabled', 'ncf_enabled') ? Boolean(body.ncfEnabled ?? body.ncf_enabled) : Boolean(cur.ncf_enabled),
        electronic_invoicing_requested: has('electronicInvoicingRequested', 'electronic_invoicing_requested')
          ? Boolean(body.electronicInvoicingRequested ?? body.electronic_invoicing_requested)
          : Boolean(cur.electronic_invoicing_requested),
        company_rnc: has('companyRnc', 'company_rnc')
          ? String(body.companyRnc ?? body.company_rnc ?? '').trim() || null
          : cur.company_rnc ?? null,
        company_legal_name: has('companyLegalName', 'company_legal_name')
          ? String(body.companyLegalName ?? body.company_legal_name ?? '').trim() || null
          : cur.company_legal_name ?? null,
        fiscal_notes: has('fiscalNotes', 'fiscal_notes')
          ? String(body.fiscalNotes ?? body.fiscal_notes ?? '').trim() || null
          : cur.fiscal_notes ?? null,
        compliance_ack_at: has('complianceAckAt', 'compliance_ack_at')
          ? body.complianceAckAt || body.compliance_ack_at || null
          : cur.compliance_ack_at ?? null,
        withholding_isr_on_subtotal_pct: has('withholdingIsrOnSubtotalPct', 'withholding_isr_on_subtotal_pct')
          ? numOr(body.withholdingIsrOnSubtotalPct ?? body.withholding_isr_on_subtotal_pct, 0)
          : numOr(cur.withholding_isr_on_subtotal_pct, 0),
        withholding_itbis_on_tax_pct: has('withholdingItbisOnTaxPct', 'withholding_itbis_on_tax_pct')
          ? numOr(body.withholdingItbisOnTaxPct ?? body.withholding_itbis_on_tax_pct, 0)
          : numOr(cur.withholding_itbis_on_tax_pct, 0),
        updated_at: new Date().toISOString()
      }
      const { data: ex } = await client.database.from('tenant_fiscal_settings').select('id').eq('tenant_id', tenantId).limit(1)
      let out
      if (ex?.length) {
        const { data, error } = await client.database.from('tenant_fiscal_settings').update(row).eq('tenant_id', tenantId).select('*')
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        out = data?.[0]
      } else {
        const { data, error } = await client.database.from('tenant_fiscal_settings').insert(row).select('*')
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        out = data?.[0]
      }
      return new Response(JSON.stringify({ ok: true, settings: out }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_tax_rates') {
      const { data, error } = await client.database
        .from('tax_rates_catalog')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
      if (error && /does not exist|relation/i.test(error.message || '')) {
        return new Response(JSON.stringify({ ok: true, rows: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message, rows: [] }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, rows: data || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'upsert_tax_rate') {
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
      const id = body.id || null
      const row = {
        tenant_id: tenantId,
        code,
        label,
        rate_percent: numOr(body.ratePercent ?? body.rate_percent, 0),
        is_default: Boolean(body.isDefault ?? body.is_default),
        is_active: body.isActive === false || body.is_active === false ? false : true,
        sort_order: numOr(body.sortOrder ?? body.sort_order, 0)
      }
      if (row.is_default) {
        await client.database.from('tax_rates_catalog').update({ is_default: false }).eq('tenant_id', tenantId)
      }
      if (id) {
        const { data, error } = await client.database.from('tax_rates_catalog').update(row).eq('id', id).eq('tenant_id', tenantId).select('*')
        if (error || !data?.length) {
          return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        return new Response(JSON.stringify({ ok: true, rate: data[0] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data, error } = await client.database.from('tax_rates_catalog').insert(row).select('*')
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, rate: data?.[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_tax_rate') {
      const id = body.id
      if (!id) {
        return new Response(JSON.stringify({ error: 'id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { error } = await client.database.from('tax_rates_catalog').delete().eq('id', id).eq('tenant_id', tenantId)
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

    if (action === 'seed_tax_rates_do') {
      const seeds = [
        { code: 'itbis_18', label: 'ITBIS tasa general 18%', rate_percent: 18, sort_order: 10, is_default: true },
        { code: 'itbis_16', label: 'ITBIS tasa reducida 16%', rate_percent: 16, sort_order: 20, is_default: false },
        { code: 'exento', label: 'Exento 0%', rate_percent: 0, sort_order: 30, is_default: false }
      ]
      for (const s of seeds) {
        const { error } = await client.database.from('tax_rates_catalog').insert({
          tenant_id: tenantId,
          code: s.code,
          label: s.label,
          rate_percent: s.rate_percent,
          sort_order: s.sort_order,
          is_default: s.is_default,
          is_active: true
        })
        if (error && !/duplicate|unique/i.test(error.message || '')) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
      }
      const { data } = await client.database.from('tax_rates_catalog').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true })
      return new Response(JSON.stringify({ ok: true, rows: data || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list_ncf_sequences') {
      const { data, error } = await client.database
        .from('ncf_sequences')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('invoice_series_match', { ascending: true })
      if (error && /does not exist|relation/i.test(error.message || '')) {
        return new Response(JSON.stringify({ ok: true, rows: [] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message, rows: [] }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, rows: data || [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'upsert_ncf_sequence') {
      const ncfType = String(body.ncfType || body.ncf_type || '').trim().toUpperCase()
      const invoiceSeriesMatch = String(body.invoiceSeriesMatch || body.invoice_series_match || '')
        .trim()
        .toUpperCase()
      const prefix = String(body.prefix || '').trim().toUpperCase()
      if (!ncfType || !invoiceSeriesMatch || !prefix) {
        return new Response(JSON.stringify({ error: 'ncfType, invoiceSeriesMatch y prefix requeridos' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const id = body.id || null
      const row = {
        tenant_id: tenantId,
        ncf_type: ncfType,
        invoice_series_match: invoiceSeriesMatch,
        prefix,
        correlative_width: Math.min(12, Math.max(1, numOr(body.correlativeWidth ?? body.correlative_width, 8))),
        next_correlative: Math.max(1, Math.floor(numOr(body.nextCorrelative ?? body.next_correlative, 1))),
        is_active: body.isActive === false || body.is_active === false ? false : true,
        notes: body.notes != null ? String(body.notes).trim() || null : null,
        updated_at: new Date().toISOString()
      }
      if (id) {
        const { data, error } = await client.database.from('ncf_sequences').update(row).eq('id', id).eq('tenant_id', tenantId).select('*')
        if (error || !data?.length) {
          return new Response(JSON.stringify({ error: error?.message || 'update failed' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        return new Response(JSON.stringify({ ok: true, sequence: data[0] }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data, error } = await client.database.from('ncf_sequences').insert(row).select('*')
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ ok: true, sequence: data?.[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'delete_ncf_sequence') {
      const id = body.id
      if (!id) {
        return new Response(JSON.stringify({ error: 'id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { error } = await client.database.from('ncf_sequences').delete().eq('id', id).eq('tenant_id', tenantId)
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

    if (action === 'preview_ncf') {
      const invoiceSeries = String(body.invoiceSeries || body.invoice_series || 'FAC').trim().toUpperCase()
      const { data: rows } = await client.database
        .from('ncf_sequences')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('invoice_series_match', invoiceSeries)
        .eq('is_active', true)
        .limit(1)
      const seq = rows?.[0]
      if (!seq) {
        return new Response(JSON.stringify({ ok: true, preview: null }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const n = Number(seq.next_correlative || 1)
      const w = Number(seq.correlative_width || 8)
      const full = String(seq.prefix || '') + String(n).padStart(w, '0')
      return new Response(JSON.stringify({ ok: true, preview: { ncf: full, ncf_type: seq.ncf_type, next: n } }), {
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
