-- Migration 0007: lock tenant-critical identifiers from being changed via UPDATE.
--
-- Same bug class as notes (migration 0006): every table with an UPDATE policy
-- is a candidate for silent tenant/parent migration via UPDATE. RLS USING and
-- WITH CHECK can verify "you are a member of X" but cannot cheaply compare
-- OLD.x to NEW.x. Triggers can.
--
-- Tables with no UPDATE policy are already safe (RLS blocks UPDATE entirely):
--   note_versions, note_tags, files, audit_logs, users, organizations
--
-- Tables locked here:
--   note_shares    note_id (moving a share to another note = cross-tenant leak)
--   memberships    user_id, org_id (changing either = privilege transfer)
--   tags           org_id (moving a tag to another org = cross-tenant leak)
--   ai_summaries   note_id, org_id (moving a summary = cross-tenant leak)
--
-- One trigger function per table. Errors name the table and column for
-- easier diagnosis in logs.

CREATE OR REPLACE FUNCTION public.prevent_note_shares_key_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.note_id IS DISTINCT FROM OLD.note_id THEN
    RAISE EXCEPTION 'note_shares.note_id is immutable: cannot move a share between notes';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER note_shares_note_immutable
  BEFORE UPDATE OF note_id ON public.note_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_note_shares_key_change();


CREATE OR REPLACE FUNCTION public.prevent_memberships_key_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'memberships.user_id is immutable: cannot reassign a membership to a different user';
  END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'memberships.org_id is immutable: cannot move a membership to a different org';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER memberships_keys_immutable
  BEFORE UPDATE OF user_id, org_id ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_memberships_key_change();


CREATE OR REPLACE FUNCTION public.prevent_tags_org_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'tags.org_id is immutable: cannot move a tag between organizations';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tags_org_immutable
  BEFORE UPDATE OF org_id ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tags_org_change();


CREATE OR REPLACE FUNCTION public.prevent_ai_summaries_key_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.note_id IS DISTINCT FROM OLD.note_id THEN
    RAISE EXCEPTION 'ai_summaries.note_id is immutable: cannot move a summary between notes';
  END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'ai_summaries.org_id is immutable: cannot move a summary between organizations';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_summaries_keys_immutable
  BEFORE UPDATE OF note_id, org_id ON public.ai_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_ai_summaries_key_change();
