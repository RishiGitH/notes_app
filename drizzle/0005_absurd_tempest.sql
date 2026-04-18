ALTER POLICY "audit_logs_insert_self" ON "audit_logs" TO authenticated WITH CHECK (
        actor_id = auth.uid()
        and actor_id is not null
        and (
          org_id is null
          or public.is_org_member(org_id)
        )
      );