-- Migration 0011: extend search_tsv to include tag names (weight C) and
-- add triggers to keep the index in sync when tags are added/removed.
--
-- Problem (F-0014): the assignment requires search across titles, content,
-- AND tags. Migration 0008 only indexed title (A) and content (B). Tag names
-- were silently excluded. A note tagged "finance" was not returned by a
-- search for "finance".
--
-- Additionally, migration 0008's trigger on note_versions fired on INSERT
-- with the race: current_version_id on the parent note had not yet been
-- updated, so the `AND current_version_id = NEW.id` guard returned NOT FOUND
-- and left search_tsv empty. The UPDATE trigger on notes then fired when
-- current_version_id was set, repairing it — but a concurrent SELECT between
-- the two steps would see an empty tsvector. The backfill in step 4 below
-- ensures all existing rows are correct regardless of that race.
--
-- Design:
--   • Weight C ('simple' dictionary) for tag names. 'simple' avoids stemming
--     short tag tokens (e.g. "HR" → "hr" not "h").
--   • Three additional triggers:
--       note_tags_fts_update  — AFTER INSERT OR DELETE ON note_tags
--       note_tags_fts_delete  — (same row trigger handles both via TG_OP)
--       tags_fts_update       — AFTER UPDATE OF name ON tags (rename path)
--   • Backfill runs at migration time to correct any rows where search_tsv
--     was not populated (empty tsvector from the race condition, or from
--     notes that never had any note_versions row).

-- ───────────────────────────────────────────────────────────────────────────
-- Step 1: Replace the trigger function with one that aggregates tags.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notes_update_search_tsv()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note_id uuid;
  v_title   text;
  v_content text;
  v_tags    text;
BEGIN
  -- Determine which note to update based on which trigger fired.
  --
  -- Callers:
  --   (a) AFTER INSERT OR UPDATE OF title, current_version_id ON notes
  --       → update the note itself (NEW.id)
  --   (b) AFTER INSERT ON note_versions
  --       → update the parent note; only when it is the current version
  --   (c) AFTER INSERT OR DELETE ON note_tags
  --       → update the parent note (the tag just attached/detached)
  --   (d) AFTER UPDATE OF name ON tags
  --       → update ALL notes that carry this tag (handled by the wrapper below)

  IF TG_TABLE_NAME = 'notes' THEN
    v_note_id := NEW.id;

  ELSIF TG_TABLE_NAME = 'note_versions' THEN
    -- Only update the parent when this version becomes the current pointer.
    -- Guard: is the note's current_version_id already pointing at NEW.id?
    PERFORM 1 FROM public.notes
     WHERE id = NEW.note_id
       AND current_version_id = NEW.id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    v_note_id := NEW.note_id;

  ELSIF TG_TABLE_NAME = 'note_tags' THEN
    -- On DELETE the relevant row is OLD; on INSERT it is NEW.
    v_note_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.note_id ELSE NEW.note_id END;

  ELSE
    -- Unexpected caller — no-op.
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Fetch the note's current title and current version's content.
  SELECT n.title, nv.content
    INTO v_title, v_content
    FROM public.notes n
    LEFT JOIN public.note_versions nv ON nv.id = n.current_version_id
   WHERE n.id = v_note_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_title   := coalesce(v_title,   '');
  v_content := coalesce(v_content, '');

  -- Aggregate all tag names for this note into a single space-separated string.
  SELECT coalesce(string_agg(t.name, ' '), '')
    INTO v_tags
    FROM public.note_tags nt
    JOIN public.tags t ON t.id = nt.tag_id
   WHERE nt.note_id = v_note_id;

  UPDATE public.notes
     SET search_tsv =
           setweight(to_tsvector('english', v_title),   'A') ||
           setweight(to_tsvector('english', v_content), 'B') ||
           setweight(to_tsvector('simple',  v_tags),    'C')
   WHERE id = v_note_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Step 2: Re-attach existing triggers (DROP + CREATE is idempotent because
-- 0008 already ran CREATE OR REPLACE on the function and DROP TRIGGER IF EXISTS).
-- ───────────────────────────────────────────────────────────────────────────

-- Existing trigger on notes — already covers INSERT OR UPDATE OF title, current_version_id.
-- Re-drop and recreate so it picks up the updated function signature.
DROP TRIGGER IF EXISTS notes_fts_update ON public.notes;
CREATE TRIGGER notes_fts_update
  AFTER INSERT OR UPDATE OF title, current_version_id
  ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_update_search_tsv();

-- Existing trigger on note_versions — already covers AFTER INSERT.
DROP TRIGGER IF EXISTS note_versions_fts_update ON public.note_versions;
CREATE TRIGGER note_versions_fts_update
  AFTER INSERT
  ON public.note_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_update_search_tsv();

-- ───────────────────────────────────────────────────────────────────────────
-- Step 3: New trigger — note_tags INSERT / DELETE
-- ───────────────────────────────────────────────────────────────────────────

-- When a tag is attached to or detached from a note, re-index that note.
DROP TRIGGER IF EXISTS note_tags_fts_update ON public.note_tags;
CREATE TRIGGER note_tags_fts_update
  AFTER INSERT OR DELETE
  ON public.note_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_update_search_tsv();

-- ───────────────────────────────────────────────────────────────────────────
-- Step 4: New trigger — tags name UPDATE (rename path)
-- ───────────────────────────────────────────────────────────────────────────

-- When an org admin renames a tag (UPDATE tags SET name = '...'), every note
-- carrying that tag must have its search_tsv rebuilt. This is done via a
-- separate SECURITY DEFINER function that fans out to all affected note rows.

CREATE OR REPLACE FUNCTION public.tags_rename_update_search_tsv()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- NEW.name changed (TG_OP = 'UPDATE', column filter 'name' in trigger def).
  -- Iterate over every note that carries this tag and recompute its tsvector.
  FOR r IN
    SELECT nt.note_id
      FROM public.note_tags nt
     WHERE nt.tag_id = NEW.id
  LOOP
    PERFORM public.notes_update_search_tsv_for_note(r.note_id);
  END LOOP;
  RETURN NEW;
END;
$$;

-- Helper called by the rename fan-out. Isolated so it can be called from PL/pgSQL.
CREATE OR REPLACE FUNCTION public.notes_update_search_tsv_for_note(p_note_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title   text;
  v_content text;
  v_tags    text;
BEGIN
  SELECT n.title, nv.content
    INTO v_title, v_content
    FROM public.notes n
    LEFT JOIN public.note_versions nv ON nv.id = n.current_version_id
   WHERE n.id = p_note_id;

  IF NOT FOUND THEN RETURN; END IF;

  v_title   := coalesce(v_title,   '');
  v_content := coalesce(v_content, '');

  SELECT coalesce(string_agg(t.name, ' '), '')
    INTO v_tags
    FROM public.note_tags nt
    JOIN public.tags t ON t.id = nt.tag_id
   WHERE nt.note_id = p_note_id;

  UPDATE public.notes
     SET search_tsv =
           setweight(to_tsvector('english', v_title),   'A') ||
           setweight(to_tsvector('english', v_content), 'B') ||
           setweight(to_tsvector('simple',  v_tags),    'C')
   WHERE id = p_note_id;
END;
$$;

DROP TRIGGER IF EXISTS tags_rename_fts_update ON public.tags;
CREATE TRIGGER tags_rename_fts_update
  AFTER UPDATE OF name
  ON public.tags
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION public.tags_rename_update_search_tsv();

-- ───────────────────────────────────────────────────────────────────────────
-- Step 5: Full backfill — correct all existing rows.
--
-- This re-runs the three-source formula for every non-deleted note. Because
-- the seed (scripts/seed.ts) inserts notes via raw SQL that fires the old
-- trigger (title+content only, no tags), and because the race condition in
-- the note_versions trigger may have left some rows with an empty tsvector,
-- this backfill is required for correctness on any existing dataset.
-- ───────────────────────────────────────────────────────────────────────────

UPDATE public.notes n
   SET search_tsv =
         setweight(to_tsvector('english', coalesce(n.title, '')), 'A') ||
         setweight(to_tsvector('english', coalesce(nv.content, '')), 'B') ||
         setweight(to_tsvector('simple',
           coalesce(
             (SELECT string_agg(t.name, ' ')
                FROM public.note_tags nt
                JOIN public.tags t ON t.id = nt.tag_id
               WHERE nt.note_id = n.id),
             ''
           )
         ), 'C')
  FROM public.note_versions nv
 WHERE nv.id = n.current_version_id;

-- Notes with no current_version_id (rare edge case: empty draft never saved).
UPDATE public.notes n
   SET search_tsv =
         setweight(to_tsvector('english', coalesce(n.title, '')), 'A') ||
         setweight(to_tsvector('simple',
           coalesce(
             (SELECT string_agg(t.name, ' ')
                FROM public.note_tags nt
                JOIN public.tags t ON t.id = nt.tag_id
               WHERE nt.note_id = n.id),
             ''
           )
         ), 'C')
 WHERE n.current_version_id IS NULL;
