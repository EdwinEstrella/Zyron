-- Accounting reports: trial balance / financial statements source data and account ledger.
--
--   1. Adds the missing tenant navigation entry for the Contabilidad module
--      (DEFAULT_NAV_TENANT in renderer.js lists it, but it was never seeded
--      into app_navigation_modules, so the sidebar never showed it).
--   2. public.zyron_accounting_account_balances(tenant, from, to): per-account
--      opening (before p_from) and period (p_from..p_to) debit/credit totals.
--      The client rolls these up through parent_account_id and derives the
--      trial balance, balance sheet and income statement.
--   3. public.zyron_accounting_account_ledger(tenant, account, from, to): the
--      posted lines of one account in a date range ("movimientos de cuenta").
--
-- Both report functions count 'posted' and 'reversed' entries. A reversed
-- entry stays in the ledger and is cancelled by its own posted reversal entry,
-- so including both keeps balances correct; drafts are excluded.

INSERT INTO public.app_navigation_modules (module_key, label, icon, scope, sort_order, is_active)
VALUES ('contabilidad', 'Contabilidad', 'account_balance', 'tenant', 70, true)
ON CONFLICT (scope, module_key) DO UPDATE
  SET label = EXCLUDED.label, icon = EXCLUDED.icon, is_active = true;

CREATE OR REPLACE FUNCTION public.zyron_accounting_account_balances(
  p_tenant_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  account_id uuid,
  opening_debit numeric,
  opening_credit numeric,
  period_debit numeric,
  period_credit numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.view') THEN
    RAISE EXCEPTION 'No tiene permiso para ver la contabilidad.';
  END IF;

  RETURN QUERY
  SELECT
    jl.account_id,
    COALESCE(SUM(jl.debit_amount)  FILTER (WHERE p_from IS NOT NULL AND je.entry_date < p_from), 0),
    COALESCE(SUM(jl.credit_amount) FILTER (WHERE p_from IS NOT NULL AND je.entry_date < p_from), 0),
    COALESCE(SUM(jl.debit_amount)  FILTER (WHERE p_from IS NULL OR je.entry_date >= p_from), 0),
    COALESCE(SUM(jl.credit_amount) FILTER (WHERE p_from IS NULL OR je.entry_date >= p_from), 0)
  FROM public.accounting_journal_lines jl
  JOIN public.accounting_journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.tenant_id = p_tenant_id
    AND je.tenant_id = p_tenant_id
    AND je.status IN ('posted', 'reversed')
    AND (p_to IS NULL OR je.entry_date <= p_to)
  GROUP BY jl.account_id;
END $$;

CREATE OR REPLACE FUNCTION public.zyron_accounting_account_ledger(
  p_tenant_id uuid,
  p_account_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  entry_id uuid,
  entry_number text,
  entry_date date,
  source_type text,
  source_label text,
  memo text,
  description text,
  debit_amount numeric,
  credit_amount numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.zyron_accounting_allowed(p_tenant_id, 'accounting.ledger.view') THEN
    RAISE EXCEPTION 'No tiene permiso para ver la contabilidad.';
  END IF;

  RETURN QUERY
  SELECT je.id, je.entry_number, je.entry_date, je.source_type, je.source_label, je.memo,
         jl.description, jl.debit_amount, jl.credit_amount
  FROM public.accounting_journal_lines jl
  JOIN public.accounting_journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.tenant_id = p_tenant_id
    AND je.tenant_id = p_tenant_id
    AND jl.account_id = p_account_id
    AND je.status IN ('posted', 'reversed')
    AND (p_from IS NULL OR je.entry_date >= p_from)
    AND (p_to IS NULL OR je.entry_date <= p_to)
  ORDER BY je.entry_date, je.entry_number, jl.line_no;
END $$;

REVOKE ALL ON FUNCTION public.zyron_accounting_account_balances(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.zyron_accounting_account_ledger(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zyron_accounting_account_balances(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zyron_accounting_account_ledger(uuid, uuid, date, date) TO authenticated;
