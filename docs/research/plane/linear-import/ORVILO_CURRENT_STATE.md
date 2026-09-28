# Orvilo Current Candidate State

Captured read-only on 2026-09-25 from an already-open production/canary browser tab.

- Exact live URL after binding the tab: `https://orvilo.aspectlylabs.com/ws-useryhn4omi0/settings/connector`
- Document title: `Orvilo`
- Locale/theme: `zh-CN`, light
- Workspace identity visible: `Alex Jiang's workspace`
- Signed-in account visible: `Alex Jiang`
- Explicit workspace role: not shown on this route
- Current settings page: `连接器` / Connector
- Current content: installed `文档` connector/tool, with Reset permissions, Refresh, and Uninstall controls
- Sidebar exposes `Linear 同步` with destination href `/ws-useryhn4omi0/settings/linear`
- No Linear OAuth client status, connected account/team, Connect button, callback/error state, or import wizard is visible on the current `/settings/connector` page
- The tab inventory had earlier labeled this tab `/settings/linear`, but the authoritative live URL after binding was `/settings/connector`; no navigation was performed by the inspector
- Visible SPA asset fingerprint: `/_spa/assets/index-D3ayL3_O.js`
- No Git commit SHA, release number, or build revision was exposed in DOM metadata or window globals
- No native Orvilo/Electron app appeared in the available app inventory
- Another Orvilo settings tab was already controlled by a different browser session and could not be inspected; its listed URL was also `/settings/connector`
- Screenshot: `docs/design-references/plane/linear-import/orvilo-current-connector.png`

## Linear Sync route inspection

With explicit read-only navigation authorization, the accessible tab was opened through the existing sidebar link. The resulting authoritative route was:

`https://orvilo.aspectlylabs.com/ws-useryhn4omi0/settings/linear`

Observed UI state:

- Heading: `Linear 工作区同步`
- Stage 1 `安装` is available.
- Stages 2–7 are disabled and marked `已锁定`.
- The installation panel shows a `连接 Linear` button and the copy `通过 Orvilo 账户授权 Linear。`
- The page says `请先连接 Linear。下一阶段只会使用已验证目录返回的组织。`
- Installation status is `—`; failed operations, dead letters, unknown results, and conflicts are all zero/empty.
- No Linear organization, installation identity, team, scope, project binding, or sync status is present.
- The Connect button was not clicked.

The browser console recorded three identical server-backed TRPC errors at page load:

`TRPCClientError: Linear OAuth is not configured`

The errors were emitted from the current SPA asset `/_spa/assets/index-D3ayL3_O.js` at 2026-09-25T21:17:03Z. The UI did not surface this configuration error; it continued to render the normal Connect button and generic “please connect” copy.

Screenshot: `docs/design-references/plane/linear-import/orvilo-linear-unconnected.png`

Conclusion: on the inspected deployed candidate, Linear OAuth is **not configured on the server**, and the workspace has **no connected Linear installation**. The settings route exists, but stages after installation are locked. The current UI conceals the configuration failure from the user.

## OAuth start probe

With explicit authorization to test initiation, `连接 Linear` was clicked exactly once. The browser control connection closed before the resulting state could be observed. Immediately afterward Brave was absent from the available browser and app inventory. No Linear consent page, authorization screen, credential submission, or callback was observed.

The confirmed pre-click error remains `TRPCClientError: Linear OAuth is not configured`. The unavailable post-click browser state means the probe cannot independently prove that the button click returned that same error, even though it is consistent with the server configuration failure already recorded above.
