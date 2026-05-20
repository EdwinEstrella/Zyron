-- Realtime RLS Policies Fix for Domain Events

DO $$
BEGIN
  -- We use a DO block to prevent errors if the realtime schema doesn't exist locally
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    
    -- Allow users to subscribe/read messages if they pass the tenant check
    EXECUTE $sql$
      DROP POLICY IF EXISTS "Allow users to read tenant messages" ON realtime.messages;
      CREATE POLICY "Allow users to read tenant messages" 
      ON realtime.messages FOR SELECT 
      USING (
        split_part(realtime.messages.topic, ':', 1) = 'tenant'
        AND public.can_use_tenant_realtime_channel((split_part(realtime.messages.topic, ':', 2))::uuid, 'realtime.domain_events.view')
      );
    $sql$;

    -- Allow users to publish messages if they pass the publish tenant check
    EXECUTE $sql$
      DROP POLICY IF EXISTS "Allow users to publish tenant messages" ON realtime.messages;
      CREATE POLICY "Allow users to publish tenant messages" 
      ON realtime.messages FOR INSERT 
      WITH CHECK (
        split_part(realtime.messages.topic, ':', 1) = 'tenant'
        AND public.can_use_tenant_realtime_channel((split_part(realtime.messages.topic, ':', 2))::uuid, 'realtime.domain_events.publish')
      );
    $sql$;
    
  END IF;
END $$;
