# Local Electron acceptance checkpoint

Source revision: `4bc693210` on `fix/linear-project-parity`, stacked on PR #282 at `5ed01defc`. This is a WIP checkpoint. The app ran in an isolated Electron instance on CDP port `9263` against the dedicated local parity database.

## Observed outcomes

- Favorites were reordered through a real pointer drag inside the sidebar. Releasing the pointer did not navigate away from the project. The restored order persisted after reload. [Drag result](./parity-favorites-drag-final.png) · [Reload result](./parity-favorites-persisted-final.png)
- A Team Home link was created, persisted after reload, and removed through its pointer action menu and confirmation. The confirmation closed and the link was absent afterward. [After removal](./parity-remove-after-confirm.png)
- The authenticated Linear Import wizard showed the styled four-step layout, populated destination picker, and reachable source team picker. [Initial step](./parity-linear-import-step1.png) · [Team picker](./parity-linear-import-team-picker.png)
- Reconnect stopped at `Linear OAuth is not configured` on this local backend. No provider consent or import completion is claimed. [Local blocker](./parity-linear-import-oauth-blocker.png)

## Checks and remaining gates

Scoped checks passed: 210 sidebar/project tests, 201 server tests, 136 database tests, 19 UI/editor/resource tests, and 5 isolated Team Resource integration tests. The independent light review had no remaining demonstrated blocker. Root `tsgo` was not run locally; the exact PR head needs remote CI.

Before deployment, replay migration 0193 from a clean 0192 database and measure it with production-like document volume; exercise Elasticsearch team-document search across two members; verify team-document edit, reload, and membership revocation in Electron; complete a real Linear import once OAuth configuration is available. These checks are why the PR remains draft.
