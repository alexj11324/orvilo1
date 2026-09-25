# A1 Related semantics: Web acceptance

Product source commit: `0a458ce28` (`🐛 fix(issue): keep Related links nonblocking and symmetric`).
The baseline audit is `9c58967e3`; this branch is based on draft PR #227 at
`460fe703a`. The source checkout was clean before this evidence was captured.

Runtime: local Web build from `/private/tmp/orvilo-ui-related-a1`, Next on
`localhost:3030`, Vite on `localhost:9885`, local parity test database
`orvilo_linear_parity_20260922`, seeded `agent-testing` account, workspace
`ws-useragenttes`, dark theme, zh-CN, 1440 × 900 CSS pixels, DPR 1.
Browser session: `orvilo-ui-a1`. The test changed only the temporary relation
between the existing synthetic issues PTP-11 and PTP-12; it removed the
relation at the end. No production proxy was used.

| Step           | Real input / independent readback                                          | Result                                                                                                                   |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Add            | Open PTP-11, type `PTP-12` into “关联事项编号”, click “添加关联” normally. | Mutation returned HTTP 200; [PTP-11 screenshot](./web-ptp11-related-1440.png) shows “关联 PTP-12”.                       |
| Reverse view   | Click the related PTP-12 row, then reload PTP-12.                          | [PTP-12 screenshot](./web-ptp12-reverse-1440.png) and the reloaded accessibility tree show “关联 PTP-11”.                |
| Persisted edge | Read local `task_dependencies` joined by identifiers after reload.         | Exactly one `PTP-11 → PTP-12` row with `type=relates`; there was no reverse duplicate.                                   |
| Remove         | On PTP-12, click “移除与 PTP-11 的关联” normally.                          | Mutation returned HTTP 200. PTP-12 lost the row; reopening PTP-11 showed no PTP-12 row; the database pair count was `0`. |

Screenshots are full browser captures at the stated viewport. SHA-256:

- `web-ptp11-related-1440.png`: `92fed8e35e5d12538be1075fdc2c1d5132ea423265b43888f26e041e8c3d0213`
- `web-ptp12-reverse-1440.png`: `cc00441e6f95a77437e6e8cfbbdd7cffa6e94c035a72ed5fa76a4c99d26b14f1`

Regression evidence: the new UI `relates` assertion and existing-blocker
demotion assertion both failed before implementation and passed after it. The
legacy-ID router test reproduced a `NOT_FOUND` error before its fix. Final
focused runs: 199 app/server tests across four files, 28 database relation
tests, and scoped lint on all changed source, tests, and locales. Local `tsgo`
was not run; the PR's remote Typecheck job owns that gate.

The browser run did not connect a Linear provider or verify remote sync, and
the unreadable-peer unlink case was covered by the model, router and component
regressions rather than a second browser account. Electron and the complete
A2–A7 matrix remain pending. This evidence proves A1 only.
