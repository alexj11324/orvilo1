# Issue #626 product verification

Code revision: `109b31653033ec33b17192e576558a2a199a346e` (2026-10-09).

Environment: the real Next/Vite application, Chromium, PostgreSQL/ParadeDB and Redis on localhost. Authentication uses the repository's existing E2E Clerk session fixture. This validates the settings and backend behavior; it does not validate real Clerk login or native Electron notification delivery. No model completion is substituted for a real provider success below.

## Verified outcomes

- Created a workspace through the running `workspace.create` API. In the browser, edited its name and slug, clicked Save, followed the new URL, and reloaded. Both values remained saved.
- In the workspace notification page, disabled the inbox “Agent run failed” event and reloaded. The switch remained off.
- Used the real notification projection service against that same PostgreSQL database and the browser-saved preference. A failed-run event produced no notification while disabled; enabling it produced one. Issue assignment and review-request events also produced their expected notifications. The failure opt-out was restored afterward.
- Through the running provider API, saved only an invalid OpenAI key, enabled the provider and selected `gpt-4o-mini`. Reading the resulting binding returned the official `https://api.openai.com/v1` endpoint and `enabled: false`.
- Called the real `expertise.draftDomain` endpoint for a database-seeded existing CLI Agent fixture. It returned the explicit “CLI agents are not supported” precondition error before model dispatch. This is a server policy check, not a local CLI execution test.
- GitHub Actions Typecheck passed for this code revision: [job 114024952792](https://github.com/alexj11324/orvilo1/actions/runs/37990659797/job/114024952792).

Sanitized output:

```text
saved name after reload Issue 626 Saved
saved slug after reload issue626-saved
failure inbox switch after reload false
failed run notification count with UI opt-out: 0
failed run notification count when enabled: 1
Issue assignment notification delivered
Issue review notification delivered
{"endpoint":"https://api.openai.com/v1","enabled":false,"model":"gpt-4o-mini"}
PASS: actual expertise API blocks CLI owner with explicit explanation
```

## Screenshots

Workspace after save and reload:

![Workspace saved](workspace-saved.png)

Workspace notification opt-out after reload:

![Notification preference saved](notification-saved.png)

## Remaining gates

A successful real model generation remains unverified: the environment's configured Google key returned HTTP 400 `INVALID_ARGUMENT` / “Please pass a valid API key.” A usable provider credential is required. Native Electron notification delivery was subsequently verified below.

Full Test CI and E2E CI are blocked by Docker Hub's unauthenticated image-pull rate limit. The failed database-container setup cancels sibling jobs; a targeted retry allowed Typecheck to complete successfully but did not resolve the database image pull. These cancelled checks are not passes.

Backend cleanup #622 remains deferred because frontend PRs #612, #615, #616 and #617 are still unmerged. No retired API or database fields were deleted.

## Design-system correction and native verification

Code revision: `193abe6e483db2b70956a5b90428a04dd85c0794` (2026-10-09).

The previous screenshots above record the initial implementation. The screenshots linked below supersede its presentation. The correction follows DESIGN.md and the local design-system/react/ux skills: 640px settings lanes, 14px event labels, semantic text colors, 36px editable controls, responsive field alignment, shared FormGroup sections, and compact Save actions. Personal/desktop notifications no longer embed an extra page heading or idle save badge. Native sound controls reserve space so descriptions wrap beside them. Model diagnostics use readable text and keep verification actions aligned. Matching loading skeletons cover the changed shapes.

Also fixed during actual UI acceptance:

- Personal Web notification settings previously pointed to an empty business component and were hidden by an obsolete capability gate. The ordinary Web route now exposes the same personal preferences.
- Channel/event switch labels are explicit siblings of their controls, so the accessible name identifies the channel once.
- Workspace notification controls wait for the workspace-keyed preference response and expose load-error retry; they no longer flash every switch on before an existing opt-out loads.

Verification:

- Web at 1440×1000, light/dark: workspace general, workspace notifications, personal notifications, and built-in Agent model settings. All four also checked at 820×900 without document-level horizontal overflow.
- Workspace name saved and survived reload after the layout change. Personal failure preference saved and survived reload. Restoring the personal preference did not overwrite the workspace failure opt-out.
- Real Electron 43 on Xvfb, with the real preload/main process and Linux Dunst notification service; same real local backend and E2E Clerk authentication fixture. Toggling the actual personal push failure preference off suppressed delivery; on delivered an OS banner and added one entry to Dunst's notification history. The trigger calls the production `notifyDesktopAgentCompleted` helper with a fixture failure event; this proves preference → renderer → native delivery, not an actual paid model failure run.
- Settings capability regression: failed with the old gate (`expected false to be true`), then all 15 package tests passed. Existing application model settings, component-map/capability, and Web/Electron router parity tests: 4 suites / 82 tests passed. Scoped lint and commit hooks passed. Style-only changes have screenshot evidence, not stylesheet-string tests.

```text
PASS workspace save after layout fix
PASS web personal preference survives reload
PASS personal update preserves workspace opt-out
PASS native failure preference false
PASS native failure preference true
```

| Surface                 | Light                                   | Dark                                   | Narrow                                   |
| ----------------------- | --------------------------------------- | -------------------------------------- | ---------------------------------------- |
| Workspace general       | [image](design-general-light.png)       | [image](design-general-dark.png)       | [image](design-general-narrow.png)       |
| Workspace notifications | [image](design-notifications-light.png) | [image](design-notifications-dark.png) | [image](design-notifications-narrow.png) |
| Personal notifications  | [image](design-personal-light.png)      | [image](design-personal-dark.png)      | [image](design-personal-narrow.png)      |
| Agent model settings    | [image](design-agent-light.png)         | [image](design-agent-dark.png)         | [image](design-agent-narrow.png)         |
| Electron notifications  | [image](design-electron-light.png)      | [image](design-electron-dark.png)      | —                                        |

Native failure preference: [off / no banner](electron-failure-off.png), [on / delivered banner](electron-failure-on.png).

Successful real model generation and complete CI remain separate outstanding gates; no screenshot or fixture completion substitutes for them. #622 still waits for its frontend prerequisites.

Full repository Typecheck passed on the design code revision `193abe6e`: [job 114039044429](https://github.com/alexj11324/orvilo1/actions/runs/37994864060/job/114039044429). Full Test/E2E still fail at Docker container initialization with `toomanyrequests` from Docker Hub; the successful standalone type job does not resolve that infrastructure block.

Read-error acceptance used a browser fixture that interrupts only the preference read. No switches were exposed during the failure. Clicking the actual “Reload” action resumed the real API and restored the saved workspace opt-out: [error screenshot](design-notifications-error.png).
