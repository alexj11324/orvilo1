# Plane Linear import: output and acceptance plan

Reference: Plane's `/settings/imports/linear/` page (observed 2026-09-25 in an already connected session). The reference remains on one URL through four steps. This is a read-only research artifact; no reference import was submitted.

Destination: `/:workspaceSlug/settings/imports/linear` in Orvilo's existing workspace settings shell. Source route and Orvilo route each retain their own branding and account data. Existing `/:workspaceSlug/settings/linear` remains the live sync settings surface. The new Imports navigation entry leads to a small catalog, then the Linear wizard.

## Observable success

1. An authorized workspace admin can pick one manageable destination project, connect a Linear organization with the existing OAuth flow, then choose one public Linear team from that installation.
2. Every workflow state of that team receives an explicit mapping to a supported Orvilo workflow category. A user may change the suggested mappings before confirmation. Changing the source team resets stale mappings.
3. Summary uses server-derived counts for supported imported data; it does not claim to import types the service does not copy. The final button is disabled until the destination, connection, team, and mappings are valid.
4. Confirmation starts an import job that copies the selected team's issues, including issues without a Linear project, into the one selected destination project. A unique source identity and transactional receipt prevent duplicate tasks on retry. A persisted cursor and progress survive page close and retry. No live sync binding or scope is modified by this one-time import.
5. The job skips private teams and any source issue already linked through live sync, reports skipped/failed counts, and never writes to Linear. A user can inspect progress and terminal result after refresh.

## Failure conditions and verification

- OAuth rejection, expired installation, inaccessible team, non-manageable target, invalid mapping, remote API error, or resumed import must show an actionable state without pretending success.
- Tests cover permission/scope validation, team-wide pagination, one-project placement, state mapping, repeated confirmation, and failed-page recovery. Scoped lint/tests, remote CI typecheck, and local product runtime must be distinguished in delivery evidence.
- Reference visual comparison requires the same viewport and observed state. Fresh-connection UI is an Orvilo OAuth exception because the inspected Plane session was already authorized.

## Shared ownership

- Server import job: `apps/server/src/services/linearImport/`, `apps/server/src/routers/lambda/linearImport.ts`, `packages/database/src/models/linearImport.ts`, schema/migration, and workflow registration.
- Wizard: `src/features/WorkspaceSetting/LinearImport/` and thin route under `src/routes/(main)/[workspaceSlug]/settings/imports/linear/`.
- Common route registration in `src/spa/router/desktopRouter.shared.tsx`; navigation in the existing workspace settings category and tab enum.
- UI copy in `packages/locales/src/default/setting.ts`, `locales/en-US/setting.json`, and `locales/zh-CN/setting.json`.

## Evidence boundary

Observed: four steps, target project selector, source team selector, editable state mapping, summary and final confirmation. The connected Plane session did not expose its fresh credential screen. Import result after final confirmation and mobile behavior were not observed. Orvilo must use its own server-owned OAuth callback and import semantics.
