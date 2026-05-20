-- ==========================================
-- Zyron Accounting Accounts Module Schema
-- ==========================================

CREATE TABLE IF NOT EXISTS public.accounting_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id, code)
);

-- RLS Policies
ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their own accounting accounts" 
ON public.accounting_accounts FOR SELECT 
USING (
    tenant_id IN (
        SELECT tm.tenant_id 
        FROM public.tenant_memberships tm 
        JOIN public.app_users au ON au.id = tm.app_user_id
        WHERE au.auth_user_id = auth.uid()::text
    )
);

CREATE POLICY "Tenant admins and managers can insert accounting accounts" 
ON public.accounting_accounts FOR INSERT 
WITH CHECK (
    tenant_id IN (
        SELECT tm.tenant_id 
        FROM public.tenant_memberships tm 
        JOIN public.app_users au ON au.id = tm.app_user_id
        WHERE au.auth_user_id = auth.uid()::text AND tm.role_key IN ('tenant_admin', 'manager', 'billing_agent')
    )
);

CREATE POLICY "Tenant admins and managers can update accounting accounts" 
ON public.accounting_accounts FOR UPDATE 
USING (
    tenant_id IN (
        SELECT tm.tenant_id 
        FROM public.tenant_memberships tm 
        JOIN public.app_users au ON au.id = tm.app_user_id
        WHERE au.auth_user_id = auth.uid()::text AND tm.role_key IN ('tenant_admin', 'manager', 'billing_agent')
    )
);

CREATE POLICY "Tenant admins can delete accounting accounts" 
ON public.accounting_accounts FOR DELETE 
USING (
    tenant_id IN (
        SELECT tm.tenant_id 
        FROM public.tenant_memberships tm 
        JOIN public.app_users au ON au.id = tm.app_user_id
        WHERE au.auth_user_id = auth.uid()::text AND tm.role_key = 'tenant_admin'
    )
);
