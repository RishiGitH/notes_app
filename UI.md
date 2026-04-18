# UI.md — Interface Choices

The UI exists to demonstrate functionality. Functional and consistent
beats beautiful. Everything is shadcn/ui on Tailwind. No custom design
system.

---

## Visual reference — Notion-inspired

The target aesthetic is **Notion-like**: generous whitespace, muted
borders (`border` token), system font stack, subtle hover states,
restraint. Agents know this vocabulary — saying "Notion-inspired with
shadcn primitives" is enough.

**Do not** chase pixel fidelity. Use the screenshots below as
structural and proportional references only — not colour references.
All colours must use shadcn semantic tokens. All spacing must be
Tailwind defaults.

### Screenshots to attach when kicking off Phase 3B

Attach all of these to the `ui-builder` session at `/phase-start 3B`:

| # | What to screenshot | Source | Used for |
|---|---|---|---|
| 1 | Sidebar — workspace switcher top, nav middle, user menu bottom | notion.so (your workspace) | Shell layout, all pages |
| 2 | Note detail header — title, breadcrumb, Share + menu top-right, "Edited by X" metadata row | notion.so, any note | Page 5 note detail |
| 3 | Empty page state — centered typography only, no illustration | notion.so, blank new page | Empty states across all pages |
| 4 | Share dialog — visibility selector top, people list with per-row permission dropdown | notion.so, Share button | Page 13 share panel |
| 5 | Settings layout — left-rail sub-nav + main pane (Workspace / Members) | notion.so Settings | Pages 9–10 members + org settings |
| 6 | Search / Cmd-K — result list with icon, title, context snippet | notion.so Cmd-K | Page 8 search |
| 7 | GitHub PR diff — two-column, line numbers, +/- colouring | github.com any PR Files tab | Page 7 diff view |
| 8 | Dense table with filter bar — filter controls above, table rows below, column sort indicators | tanstack.com/table examples or Linear | Pages 4, 6, 9 list tables |

### Prompt to include with the screenshots

> Match the **feel** of these Notion screenshots: generous whitespace,
> muted borders, system fonts, subtle hover states, restraint. Do NOT
> match pixel values. All colours use shadcn semantic tokens
> (`bg-background`, `text-muted-foreground`, `border`). All spacing
> uses Tailwind defaults (`gap-2`, `gap-4`, `gap-6`).
>
> - Screenshots 1-3: shell + note page feel. Use shadcn `Sidebar` primitive.
> - Screenshot 4: share dialog. Use shadcn `Dialog` + `Select` + `Avatar`.
> - Screenshot 5: settings sub-nav. Use shadcn `Tabs` vertical orientation.
> - Screenshot 6: search page. Use shadcn `Command` primitive.
> - Screenshot 7: diff view. `react-diff-viewer-continued` with `splitView={true}`.
> - Screenshot 8: all list pages. Filter bar above, TanStack Table below, `muted` hover token.
>
> No custom CSS. No invented Tailwind colours. No illustrations.

### Three high-payoff polish additions (nearly free)

1. **Markdown typography.** Install `@tailwindcss/typography`. Apply
   `prose prose-neutral max-w-none prose-headings:font-semibold
   prose-p:leading-relaxed` to the note body render. Zero design
   decisions, significant visual improvement.

2. **Consistent icons.** Every non-text-only button gets a 16px
   lucide-react icon, left-aligned. Single stroke weight throughout
   the app.

3. **Global Cmd-K palette (stretch goal).** shadcn `Command` primitive.
   Lists: recent notes + quick actions (New note, Search, Settings).
   ~1 hour of work. Move to `DEFERRED.md` if time is short — but
   attempt it, it is the single best "this app feels real" signal.

---

## Component library

- **Primitives:** shadcn/ui (Button, Input, Textarea, Dialog, Sheet,
  DropdownMenu, Tabs, Card, Badge, Avatar, Tooltip, Toast).
- **Tables:** `@tanstack/react-table` with shadcn-styled cells.
- **Forms:** `react-hook-form` + `zod` resolver. shadcn `Form` wrappers.
- **Markdown rendering:** `react-markdown` + `remark-gfm` +
  `rehype-sanitize`. Never `rehype-raw`. Never `dangerouslySetInnerHTML`
  for user content.
- **Diff viewer:** `react-diff-viewer-continued`, split view, line-level.
- **Icons:** `lucide-react`.
- **Toast:** shadcn `Sonner` integration.

## Layout shell

- Two-pane: collapsible left sidebar, main content area.
- Sidebar contains: org switcher (top), nav (Dashboard, Notes, Search,
  Members, Settings), user menu (bottom).
- Header inside main area: page title left, primary action button right
  (e.g. "New note").

## Pages

1. **Login / Sign-up.** Centered card. Email + password.
2. **Create first org.** Shown after sign-up if user has no membership.
3. **Dashboard.** Recent notes (last 10), recent activity from
   `audit_logs` scoped to current org, quick "New note" action.
4. **Notes list (`/notes`).** TanStack Table. Columns: title, tags,
   visibility, updated_at, author. Filter bar above: text search box
   (links to `/search` for full-text), tag multi-select, visibility
   filter, "show deleted" toggle (admin/owner only). Row click → note
   detail.
5. **Note detail (`/notes/[id]`).** Tabs: Read | Edit | Versions |
   Files | AI Summary | Share. Read tab renders sanitized markdown
   preview. Edit tab is a textarea with live preview pane and an
   **explicit Save button — no autosave**. Explicit save creates
   exactly one `note_versions` row (per `PLAN.md` Phase 3A). The
   client passes `expected_current_version_id` with every save; on
   409 the UI toasts "Conflict — reload to see latest" and blocks
   further save until reload. Header shows title, current version
   number, last editor, last updated.
6. **Versions list (`/notes/[id]/versions`).** Table of versions with
   author, timestamp, change summary, "View" + "Compare to current"
   actions.
7. **Diff view (`/notes/[id]/versions/[versionId]`).** Split diff
   between selected version and the current version. Author and
   timestamp in the header.
8. **Search (`/search`).** Search input. Tag and visibility filters.
   Result rows show title, snippet (FTS headline), tags, updated_at.
   Result count + query time displayed.
9. **Members (`/org/members`).** Table of members with role and
   "remove" action (owner/admin only). Add-member form: email +
   initial role.
10. **Org settings (`/org/settings`).** Org name, danger zone (delete
    org — owner only, behind a confirmation dialog).
11. **AI summary panel** (inside note detail, AI Summary tab).
    Generate button → shows draft with three sections (summary, key
    points, action items). Each section has Accept / Reject buttons.
    "Accept all" at top. Accepted fields are appended to the note as
    markdown blocks; never overwrite the body. After accept, the
    accepted section in the panel becomes a read-only "Accepted
    <timestamp>" state; the panel itself remains on the tab for
    history. Re-generate is allowed and starts a new draft row.
12. **Files panel** (inside note detail, Files tab). Upload button
    (server-side MIME sniff + size check). List of attached files
    with name, size, uploader, "Download" (signed URL) and "Delete".
13. **Share panel** (inside note detail, Share tab). Visibility
    selector (private / org / shared). If shared: list of share
    grants with permission + "Revoke"; add-share form (user picker
    + permission).

## States every page must handle

- **Loading:** skeleton or spinner. No layout shift.
- **Empty:** friendly text + primary CTA.
- **Error:** shadcn `Alert` with retry where applicable.
- **Permission denied:** **server-rendered** centered card with
  "You don't have access" + link back to `/notes`. Denial is
  returned from a Server Component or Server Action, never via a
  client-side redirect, so `logAudit` fires on the server before
  the page renders.
- **Optimistic concurrency conflict** (note edit): toast + reload
  prompt. Save button disabled until reload.

## Mutation failure UX matrix

| Response | UX |
|---|---|
| 200 / OK | Toast success. Refresh view via `revalidatePath`. |
| 403 (permission) | Server-renders permission-denied card as above. |
| 404 (gone / deleted) | Toast "Note not found"; redirect to `/notes`. |
| 409 (concurrency) | Toast "Conflict — reload"; block save until reload. |
| 4xx (validation) | Show field-level errors via `react-hook-form`. |
| 5xx (server) | Toast generic error + "Retry" action. Do not retry automatically. |
| Network error | Toast "Offline — try again"; no data loss (form state kept). |

## Visual rules

- Default to Tailwind defaults. No custom color palette.
- Spacing scale: rely on shadcn defaults; do not override.
- One primary action per page (the only `default` variant button).
  Secondary actions are `outline` or `ghost`.
- Destructive actions use `destructive` variant and a confirmation
  dialog.
- No animations beyond shadcn defaults.

## What this UI deliberately does not include

- Rich-text editor / WYSIWYG.
- Drag-and-drop reordering.
- Real-time presence cursors.
- Comments (deferred — `note_comments` table not in scope).
- Mobile-optimized layouts beyond shadcn responsive defaults.
- Theming / dark mode toggle (system default is fine).
- Keyboard shortcut overlay.
