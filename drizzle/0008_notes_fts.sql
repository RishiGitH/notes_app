-- Migration 0008: full-text search on notes via tsvector + GIN index.
--
-- Phase 3C (search-ai) — AGENTS.md section 2 item 10:
--   "Search queries scope by org_id in SQL in addition to RLS."
--
-- Design:
--   A trigger-maintained tsvector column on notes provides fast FTS without
--   the overhead of a generated column that re-computes on every join. The
--   trigger is fired AFTER UPDATE on notes (title change, current_version_id
--   pointer change) and AFTER INSERT on note_versions (new version authored).
--
--   Content comes from: the note's title (always on notes) + the current
--   version's content (must be fetched from note_versions). The trigger on
--   note_versions fires only when the new version id matches the note's
--   current_version_id, i.e. when the note pointer has already been updated.
--   The trigger on notes fires when current_version_id is set/changed,
--   re-reading the content from note_versions at that point.
--
--   English text search configuration. Two lexeme sources with weights:
--     A = title   (higher relevance)
--     B = content (lower relevance)
--
-- GIN index: partial (deleted_at IS NULL) so soft-deleted notes are excluded
-- from the index scan, consistent with all other partial indexes in the schema.

-- Step 1: add the column (nullable initially so we can backfill).
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- Step 2: create the trigger function.
CREATE OR REPLACE FUNCTION public.notes_update_search_tsv()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content text;
  v_title   text;
BEGIN
  -- Determine which note row to update.
  -- This function is shared by two triggers:
  --   (a) AFTER UPDATE on notes      -> use NEW directly
  --   (b) AFTER INSERT on note_versions -> update the parent notes row
  -- The TG_TABLE_NAME discriminates the two paths.

  IF TG_TABLE_NAME = 'notes' THEN
    v_title := coalesce(NEW.title, '');
    -- Fetch content from the current version if pointer is set.
    IF NEW.current_version_id IS NOT NULL THEN
      SELECT content INTO v_content
        FROM public.note_versions
       WHERE id = NEW.current_version_id;
    END IF;
    v_content := coalesce(v_content, '');

    UPDATE public.notes
       SET search_tsv =
             setweight(to_tsvector('english', v_title),   'A') ||
             setweight(to_tsvector('english', v_content), 'B')
     WHERE id = NEW.id;

    RETURN NEW;

  ELSIF TG_TABLE_NAME = 'note_versions' THEN
    -- Only update the parent when this version is the current one.
    SELECT title INTO v_title
      FROM public.notes
     WHERE id = NEW.note_id
       AND current_version_id = NEW.id;

    IF NOT FOUND THEN
      -- This version is not the current version; nothing to update.
      RETURN NEW;
    END IF;

    v_title   := coalesce(v_title, '');
    v_content := coalesce(NEW.content, '');

    UPDATE public.notes
       SET search_tsv =
             setweight(to_tsvector('english', v_title),   'A') ||
             setweight(to_tsvector('english', v_content), 'B')
     WHERE id = NEW.note_id;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 3: attach the trigger to notes (title or current_version_id changed).
DROP TRIGGER IF EXISTS notes_fts_update ON public.notes;
CREATE TRIGGER notes_fts_update
  AFTER INSERT OR UPDATE OF title, current_version_id
  ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_update_search_tsv();

-- Step 4: attach the trigger to note_versions (new version inserted).
DROP TRIGGER IF EXISTS note_versions_fts_update ON public.note_versions;
CREATE TRIGGER note_versions_fts_update
  AFTER INSERT
  ON public.note_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.notes_update_search_tsv();

-- Step 5: backfill existing rows (safe: no notes exist in dev at this point,
-- but the statement is idempotent for production runs with data).
UPDATE public.notes n
   SET search_tsv =
         setweight(to_tsvector('english', coalesce(n.title, '')), 'A') ||
         setweight(to_tsvector('english', coalesce(nv.content, '')), 'B')
  FROM public.note_versions nv
 WHERE nv.id = n.current_version_id;

-- Also backfill notes with no current version yet (empty tsvector).
UPDATE public.notes
   SET search_tsv =
         setweight(to_tsvector('english', coalesce(title, '')), 'A')
 WHERE current_version_id IS NULL
   AND search_tsv IS NULL;

-- Step 6: make the column NOT NULL now that backfill is done.
-- Default to empty tsvector so future INSERTs without a current_version_id
-- don't violate the constraint (trigger will update on next version insert).
ALTER TABLE public.notes
  ALTER COLUMN search_tsv SET DEFAULT ''::tsvector,
  ALTER COLUMN search_tsv SET NOT NULL;

-- Step 7: GIN index — partial to exclude soft-deleted notes.
CREATE INDEX IF NOT EXISTS notes_search_gin
  ON public.notes
  USING gin (search_tsv)
  WHERE deleted_at IS NULL;
