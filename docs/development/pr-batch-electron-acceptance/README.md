# Electron PR acceptance, 2026-10-08

The product checks below ran in the actual Electron desktop application against a dedicated local PostgreSQL database and the real application backend. Playwright connected to Electron CDP on loopback; a browser fixture was used separately to reproduce the geometry test failure.

- Electron 43.2.0 / Chromium 150, Linux with Xvfb, 1000 × 800 renderer viewport.
- Main and preload built from `a4bdb4957b22c7e26088ef9a1463c8084f1fde9f`.
- Renderer and backend: `52fb8c1781dab27008bc53ba1357065f647ed937` for #511/#516, and `b937ba9ee3dcd226c87ad408193bb0b4de533bd8` for the subsequent checks. The intervening change updates project control typography and spacing.
- Dedicated UTF-8 database `orvilo_pr_acceptance_v2`, migrated through canonical auth 0208 and Issue 0209 with actual pgvector and pg_search extensions. The older acceptance database was preserved.
- Fixture tasks were created through the native renderer's real store/backend. For #509, those disposable tasks were changed to completed through the same application path. Project and offline Agent records were seeded solely for view/edit UI checks.

| PR   | Actual native result                                                                                                                                                        | Evidence                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| #509 | An all-completed Priority board keeps its hidden-items explanation and Show action; Show restores persisted tasks.                                                          | `509-all-completed-hidden.png`, `509-show-restores.png` |
| #511 | Grouping None renders populated tasks. A no-match filter offers Clear filters; clearing restores tasks and reload preserves the list.                                       | `511-filtered-empty.png`, `511-filter-cleared.png`      |
| #515 | Focus a board card title and press Enter; the real T-3 Issue detail opens.                                                                                                  | `515-dark-keyboard-opens.png`                           |
| #516 | Focus a list row and press Enter; the real T-1 Issue detail opens.                                                                                                          | `516-enter-opens-issue.png`                             |
| #531 | Compact project selectors measure 28px high with 14px type after the spacing/typography repair.                                                                             | `531-535-project-compact.png`                           |
| #535 | Shift+Tab exposes a visible 1px focus outline on the project title. Enter saves the rename; reload preserves it.                                                            | `08-project-keyboard-focus.png`, `native-results.json`  |
| #541 | The retained c shortcut navigates from a project to Issues and opens its page-owned task modal. Current native navigation shows Issues, Inbox, My issues, Agent and Groups. | `541-page-owned-create.png`                             |
| #546 | Selecting Dark in the real workspace menu persists across reload. Muted/secondary/accent use a .06 white wash; selected uses .10.                                           | `546-native-dark-board.png`, `dark-theme-roles.json`    |

Authentication used a seeded web session bound to a local Clerk fixture, then the native PKCE request, application consent endpoints, handoff, token exchange and initialized signed-in desktop renderer. An immediate harness assertion raced renderer initialization; the subsequent initialized native store check confirmed sign-in. See `auth-results.json`.

External Clerk sign-in, protected credential persistence on a platform keyring, local CLI Agent producer execution and native notification question production were not exercised. The fixture Agent points to an offline host. Project creation returned an orchestrator setup requirement and is not counted as passed. These results do not certify every PR in the batch, and they do not replace CI or permission-model checks.

Separate quality evidence: #536 fresh/staged PostgreSQL migration and model checks passed 42 tests; #491 archived-team unlink checks passed 33 tests; #529's browser fixture failed before its config exports were repaired and then passed the existing 1280-light and 900-dark geometry cases. No new React component tests were added. The bounded independent follow-up resolved the earlier findings except the then-current #529 duplicate keys; those keys were subsequently repaired with local validation and are not claimed as independently re-reviewed.
