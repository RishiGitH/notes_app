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
