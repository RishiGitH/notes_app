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

- (populated as decisions are taken; each entry cites a commit
  or a finding id)
