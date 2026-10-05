# Devin handoff: Agent IA and public release WIP

This branch preserves all current implementation for handoff. Keep every PR in this stack **Draft**. This is a recovery checkpoint; final integration, CI, native acceptance and release work remain incomplete.

## Start here

Use the top branch `codex/agent-admission-handoff`, which contains the full Agent/product stack. Follow the GitHub native stack dependency order: #453 → #459 → #454 → #455 → #456 → #457 → Agent branding → Agent creation admission. Independent infrastructure PR #461 is also part of this handoff and must be reviewed separately.

The previously omitted Agent IA baseline is included: Home/sidebar, Agent-level model and effort configuration, ACP discovery/configuration, permissions, history and working-directory authority. Preserve it while finishing the WIP. Do not restore the obsolete composer model-chip design.

## Saved implementation

- Shared control geometry and theme reset ordering; keyboard focus coverage.
- Full Agent IA baseline and first-login real-Agent gate, private personal-device selection, workspace slug validation and persisted completion contract.
- Failed/refused dispatch settlement; correct terminal running indicators; unaccepted draft/files/context recovery through the owning composer, including newer input during rejection.
- CLI release artifact workflow, release metadata/download route and installer/update command; Apple API notarization checks. No stable release or full candidate deployment was completed.
- Task category-only board grouping, localized repair actions, account device repair escape and readable markdown summaries.
- CLI/Electron shared persistent device identity, independent connection channels, canonical IPC identity and owner-aware cache. Device picker now identifies this computer and private/workspace ownership accurately.
- Fixed Agent runtime branding across picker/composer/sidebar/header/settings and persisted legacy reads. Display names stay editable; unsupported runtime identity is refused or shown as unsupported.
- Strict runtime/model/provider/host creation admission and runtime inheritance across ordinary, template, marketplace, tool, group, project, session and import callers. This final concern is WIP; see the detailed companion document.

## Evidence and limits

Earlier committed layers have focused regressions, independent source reviews and remote CI evidence on their respective PRs. The composer recovery change passed 121 focused tests and native concurrent newer-input + uploaded-file rejection acceptance. Device identity/picker changes have focused regressions and source review; the latest native integration verification is incomplete.

Branding originally passed 223 focused tests with a synthetic light/dark component preview; subsequent contract/read-path corrections have narrower checks. These are not final native acceptance or final remote Typecheck evidence. Admission checks include known failures and overlapping intermediate suites; do not sum counts or report the branch as green.

Historical signed ARM/Intel artifacts and native cold-start evidence belong to earlier revisions. The unpublished candidate release `v2.6.1-public-readiness.20261004` contains older artifacts and must not be published as the final branch. Build fresh artifacts only after the final source passes quality and product gates. Stable/latest release was left unchanged.

The native runtime used a controlled HTTPS model fixture with real CLI/Gateway/persistence. It proves execution plumbing, not a paid model or production SSO. Production Gateway configuration was activated separately; production CLI OAuth data-access consent and authenticated end-to-end operation acceptance remain unconfirmed. Do not assume consent.

## Remaining work in order

1. Resolve the admission issues and failing fixtures listed in `agent-creation-admission-handoff.md`; review the assembled branding/admission diff independently.
2. Run remote Typecheck and the relevant CI suites on the final branch. Never run local tsgo. Preserve meaningful regression assertions rather than weakening them to obtain green CI.
3. Exercise real Electron first login, ordinary Agent creation, same-machine CLI + desktop identity, model/provider binding, cancellation, failure recovery with concurrent draft/file input, reload persistence and working-directory authority. Verify light/dark and minimum window width.
4. Complete anonymous CLI install/connect against the final artifact and normal signed/notarized macOS install/start/update acceptance. Attach revision-specific evidence to PRs or Actions artifacts.
5. Update every PR description with final SHA, results and remaining limits before changing draft status. Merge/release/full app deployment are not authorized by this handoff alone.

## Preservation

Original primary-checkout WIP and the original `chat-agent-model-ia` working tree were preserved. Do not stage credential files, local fixture profiles, caches or unrelated `.devin/skills/` and `.env.bak-20260924`. Do not publish raw auth/session/device logs. Keep verification artifacts on PRs/Actions rather than a separate acceptance website.
