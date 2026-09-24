-- Configuración de Realtime para Supabase
-- Habilita la replicación en tiempo real para las tablas críticas de negocio

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tenant_memberships;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_access_requests;
  END IF;
END $$;
