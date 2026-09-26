# Team resources and team-owned document specification

## Overview

- Reference screenshot: `/private/tmp/linear-team-overview-reference.png`.
- Reference open-menu screenshot:
  `/private/tmp/linear-team-add-resources-menu.png` (both private/local).
- Target UI: Team Home Overview resources area and Documents tab.
- Target backend: team resources/sections plus document authorization in the
  existing database, models, search and TRPC layers.
- Interaction model: Add resources opens a menu; New document creates a
  team-owned page, Existing documents attaches a readable page, New link opens
  a form; Add section creates a named section. Reads render persistent rows.

## Reference state and visible structure

At 1440 × 900 light/en-US, empty Team resources starts x349/y236. The
heading is 18px/500. Two 28px round controls sit at x987 and x1019 (labels
`Add resources` and `Add section`). The first opens a menu with `New
document`, `Existing documents` (submenu), and `New link…`. The empty helper
is 15px/450 and says `Add documents and links. Organize by creating
sections.` The menu has a lifted white surface, icon + text rows, and a
divider before New link. Add section was not clicked on the private reference
because it may immediately write; its exact transition remains unverified.

## Data contract

Create ordered team resource sections and resource placements scoped by
workspaceId/teamId. A resource is either an HTTP(S) link (title/URL) or a
document reference, with optional sectionId. Restrict URL protocol to HTTP(S),
reject embedded credentials, and bound title/URL length as the existing
project-link model does. Check workspace and team identity on every mutation.
Prevent duplicate document placements in one team; allow a public document to
be attached to multiple teams. A team-owned document has exactly one owning
team. Deleting a section moves its placements to the unsectioned area; removing
a placement must not silently delete its document.

New team documents are standalone API Pages (`sourceType:'api'`), not KB/file
attachments. Extend document visibility to `team` with owning `teamId` and
database constraints so the pair cannot drift. Team readability follows
`TeamModel.hasReadAccess`: public team → active workspace members, private
team → team member or workspace admin. Team edit follows
`TeamModel.hasWriteAccess` plus the existing document RBAC ceiling. Removing a
member immediately revokes direct ID, list, editor, comment, search, Work and
Recent access; a creator outside the team is not an automatic bypass. Public
agent execution cannot read team-private documents. Keep private and public
document behavior unchanged.

Do not put team logic into generic `buildWorkspaceWhere`, which filters many
domains. Add a document-specific readable predicate and separate writable
gate. `DocumentModel.ownership()` currently covers both reads and writes;
changing it to team-readable without splitting would let readers mutate team
pages. Generic update/autosave must reject `visibility` and `teamId` changes.
Handle visibility changes and team deletion without orphaning or publishing
team documents. Keep team Pages out of KB/file/agent attachments until those
consumers enforce team ACL; fail closed on raw document IDs.

Apply the team gate at every active document path, not just the team resources
list: direct DocumentModel reads/lists/writes, resource permission checks,
editor history/locks, comments/likes, Recent, Work, PostgreSQL FTS and
Elasticsearch hydration. ResourcePermission's workspace-wide General Access
must not treat `team` as public; hide or reject that setting for team docs.

## API and UI contract

- List sections and resources in one team-scoped response with stable order.
- Mutations: add/rename/delete section; add/edit/remove link; create a
  team-owned document; attach/detach a readable existing document; move and
  reorder a resource. Use the existing team read/write authorization and
  document creation permission gates.
- Existing document picker only lists documents the caller can read and may
  attach. Attaching a private personal document must explicitly convert or
  copy with owner authorization; never expose it by placing its ID in a team
  row. An alternative is to exclude private documents from this picker and
  leave them unattachable.
- Show loading, empty, success and error states. New links and sections must
  survive reload; removal must be confirmed/read back. A new document opens
  the existing page editor after creation and appears in Team Documents.
- New en-US/zh-CN strings are authored in the same change.

## Verification and safety

Migration: generate through Drizzle; review SQL, snapshot, journal and
idempotent clauses. Test on an isolated local database before using Electron.
Do not inspect or modify production data. Test at least public-team member,
private-team member, nonmember, admin, revoked member, creator outside team,
and public-agent contexts. Cover direct document ID, list, FTS backends,
Work/Recent, editor mutation, comments/likes, visibility transition and
resource CRUD. Capture real Electron menu/form/screenshots and local
create→reload→remove readback. No local root `tsgo`; remote CI owns it.

## Responsive and theme states

Desktop: controls align to the right of the resources heading; resource rows
use Linear's compact type and spacing. Narrow: buttons remain reachable
without hiding the pinned global sidebar. Dark: use existing theme tokens.
Permission denied: no resource metadata leaks, mutation returns an explicit
failure, and the UI does not imply that a write succeeded.
