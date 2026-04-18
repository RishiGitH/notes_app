-- Migration 0005: make notes.org_id immutable via trigger
--
-- The notes_update_editor WITH CHECK only verifies is_org_member(org_id)
-- on the *new* row. A user who belongs to two orgs can UPDATE a note they
-- have edit rights on in Org A, set org_id = Org B, and the WITH CHECK
-- passes because they are a member of Org B. This drags all child rows
-- (versions, shares, tags, files, ai_summaries) into Org B.
--
-- Fix: BEFORE UPDATE trigger that raises an exception when org_id changes.
-- A trigger is used instead of a WITH CHECK correlated subquery because it
-- is evaluated before the row write and cannot be bypassed by a policy
-- with SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.notes_prevent_org_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id <> OLD.org_id THEN
    RAISE EXCEPTION 'notes.org_id is immutable: cannot move a note between organizations';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notes_org_immutable
  BEFORE UPDATE OF org_id ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_prevent_org_change();
