# Public release readiness

This candidate closes the observed acquisition, first-use and failed-execution paths. A passing unit test or a generated installer alone does not certify the release.

## Supported path

1. Desktop acquisition uses the current stable GitHub Release. `/download` redirects there. Mobile acquisition uses the web app; unavailable native-store and APK links are not advertised.
2. An unfinished signed-in account reaches first-Agent setup before the workspace wizard or main workspace content, including direct workspace links.
3. Create a real ACP or Prime profile. Prime requires a verified personal credential/model binding and an explicitly chosen online device. Continue with the same profile through workspace creation and private transfer.
4. Completion awaits saved workspace ownership and member execution-device preferences before marking onboarding finished and selecting the first Agent.
5. A failed dispatch never starts a waiting stream or changes a failed topic back to running. Confirmed cancellation clears the matching topic's running state; unconfirmed cancellation remains blocked.
6. An unaccepted send restores the editor, attachments and Context. New input or another conversation is never overwritten; the original input also remains in history.
7. Device errors show an actionable configuration route. Technical details start folded and use the current language. Task navigation works from canonical chat URLs, and task cards show a Markdown-free summary.
8. CLI installation instructions only appear after the public release API resolves a real, validated GitHub tarball. Missing assets and lookup failures have distinct unavailable/retry states. The CLI updater uses that same GitHub asset source.

## Shared UI contract

The Ant Design reset is loaded in the base CSS layer for the main and auth shells. ReUI utilities therefore retain control of button foreground and typography. Browser checks load the actual shared components, production global CSS and theme provider, and test geometry and primary-button foreground in both themes and at 360/1024px widths with English, Chinese and long labels. These checks do not claim glyph-ink optical alignment or whole-page accessibility compliance.

## Release evidence

Attach results to the PR or Actions artifacts with the source revision. Required checks include targeted regressions, full remote Typecheck, relevant Test/E2E gates, real Electron flow capture and installable artifact hashes.

The CLI release workflow builds its isolated workspace, packs it, installs it outside the repository on the supported Node floor, and attaches it to a stable release only after the exact revision's quality gate. CLI package versions are derived from the release tag; the root version remains owned by Auto Tag Release.

macOS release jobs stage the existing App Store Connect API key and must pass strict signature validation, stapler validation and Gatekeeper assessment before uploading assets. A skipped notarization is a failed publication condition. Verification on a clean user machine and an actual update remain separate acceptance outcomes.

## Runtime matrix

- Electron: normal and narrow desktop window; Chinese and English; light and dark; fresh unfinished user and existing finished user.
- Onboarding: API/Prime success, invalid model/key, missing/offline device, reload/retry, same-Agent workspace ownership and persisted result after reload.
- Conversation: missing-device refusal, no residual running UI, corrected-device retry, preflight rejection with attachments, new input during async failure, confirmed/unknown cancellation.
- Acquisition: unauthenticated download redirect and CLI metadata endpoint; absent release asset, upstream failure and actual asset; anonymous clean-prefix install plus CLI login/connect; signed/public macOS artifact and update.

Use disposable local accounts and topics for destructive or configuration probes. Do not mutate unrelated user records or claim mock-provider output proves a paid model integration. Windows/Linux installation, VoiceOver and mobile runtime need their own evidence if included in the release promise.
