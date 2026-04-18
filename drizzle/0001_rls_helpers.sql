-- RLS helper functions. These are SECURITY DEFINER so they can read
-- public.memberships without triggering that table's own RLS policies
-- (which would create an infinite loop). search_path is pinned to
-- public to prevent function-hijacking via a malicious schema on the
-- search path.
--
-- is_org_member: returns true if the current authenticated user is a
-- member of the given org (any role). Used in USING clauses for org-
-- scoped tables.
--
-- org_role: returns the current user's role string in the given org, or
-- NULL if not a member. Used in USING/WITH CHECK to distinguish owner /
-- admin from member / viewer.
--
-- Both are declared STABLE so Postgres can fold the call into the
-- query plan rather than executing it once per row.

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.org_id = org
  )
$$;

create or replace function public.org_role(org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role::text
  from public.memberships m
  where m.user_id = auth.uid()
    and m.org_id = org
  limit 1
$$;
