# DEFERRED.md — Explicit out-of-scope decisions

Anything cut from scope goes here with a one-line reason and, if
applicable, the commit where the decision was taken.

## Global out-of-scope (from PLAN.md section 6)

- Real-time collaborative editing (CRDT, OT, websocket sync).
- Rich-text WYSIWYG editor.
- Email-based invites with verification (direct add only).
- File versioning (files attached to notes, not to versions).
- FTS over file contents (notes title + body only).
- Multi-language UI.
- Mobile-native apps; PWA; offline mode.
- SSO / SAML / SCIM provisioning.
- Billing / usage limits / plan tiers.
- Custom domains per org.

## Deferred during build

- **Global Cmd-K palette** — shadcn Command stretch goal from UI.md; deferred from Phase 3B (c42468c) because core page budget ran to budget. Can be added as a single client component in (app)/layout.tsx post-3C merge.
- **Org rename / delete** — `updateOrgAction` and `deleteOrgAction` not in Phase 3A; org/settings renders read-only pending lead-backend shipping these.
- **Full-text search UI** — `searchNotesAction` lives on feat/infra (3C); /search renders placeholder pending search-ai.
- **Files tab UI** — `uploadFileAction`, `deleteFileAction`, `getSignedUrlAction` live on feat/infra (3C); Files tab renders EmptyState pending that merge.
- **AI Summary tab UI** — `generateAiSummaryAction` and related live on feat/infra (3C); AI tab renders EmptyState pending that merge.
- **Activity feed on dashboard** — `listAuditLogsAction` not shipped; dashboard shows placeholder.
- **Role-change in members table** — `changeRoleAction` not in Phase 3A; members page shows role badge but no edit control.

## Phase 4 scope-cutter decisions (2026-04-19)

Cut per PLAN.md section 6 cut-list order; all items are polish, not correctness:

1. **AI partial-accept UX** — accept-all ships; per-field picker deferred. Core generate/validate/store/accept path works; users lose granular control but not safety.
2. **Diff viewer styling** — functional unified diff ships; side-by-side and syntax-coloring deferred. Version history and rollback still work.
3. **File upload UI polish** — functional upload/list/download/delete ships; drag-drop, progress bars, thumbnails deferred. RLS enforcement intact.
4. **Members page niceties** — direct-add and role badge ship; inline `changeRoleAction` deferred. Admins can manage via existing add/remove.
5. **Empty/error-state polish sweep** — per-page defaults ship; global polish pass deferred.
6. **Dashboard activity feed** — placeholder ships; `listAuditLogsAction` deferred. Audit rows written correctly; read-side is cosmetic.
7. **Org rename/delete** — read-only org settings ships; requires new audit-logged actions with cascade review, risk outweighs value pre-ship.
8. **10k-seed perf tuning** — seed harness and autocannon harness ship; production sizing optimization deferred.
