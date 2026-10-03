---
name: orvilo-ui-testing
description: Suggested additions to orvilo-ui-testing — store actions are callable through __ORVILO_STORES getters, a working playwright-core require path for CDP eval helpers, a sidecar-terminal watch pattern for recordings, in-page fetch patching for prod-degradation emulation (CDP Fetch domain deadlocks), real cross-agent ownership discovery (Move-to-agent UI / getTopicDetail / lastSettledOperationId), and a correction that the "Cloud credentials required" banner does not block sends.
---

# Suggested updates to `orvilo-ui-testing` (append to existing sections)

## Store inspection — corrections and additions

- `__ORVILO_STORES` getters return the full zustand state **including bound
  actions** — so `window.__ORVILO_STORES.chat().internal_dispatchTopic({id,
type:'updateTopic', value:{status:'completed', sortUpdatedAt:Date.now()}},
'qa-probe')` actually mutates store state. Use it to simulate server-pushed
  churn (background run completions, feed reorders) without a backend path —
  the same dispatch the app uses internally. `addTopic`/`deleteTopic` work too.
- Exposed names include `global` (`.status`, persisted to localStorage
  `ORVILO_SYSTEM_STATUS` via `updateSystemStatus`), `chat` (`.composerAgentId`,
  `.activeTopicId`, `.topicDataMap`), `agent` (`.activeAgentId`, `.agentMap`,
  `.builtinAgentIdMap`).
- The workspace conversation feed lives in `topicDataMap['workspace']`. On the
  NEW server (feat/workspace-conversation-feed) its items carry `agentId` (the
  PR adds it to the slim projection). On PROD rows still lack `agentId`/`sessionId` —
  and prod strips the unknown `scope:'workspace'` input field, so a workspace
  `getTopics` degrades to the default "all my visible topics" response. To
  emulate the new server see "In-page response patching" below.

## In-page response patching (emulating server-side fields prod lacks)

- When a PR's frontend needs response fields prod doesn't return (e.g.
  `agentId` on workspace-scope getTopics), patch `window.fetch` IN the page —
  do NOT use CDP `Fetch.enable` request interception: your own replay fetch
  pauses on the same URL pattern, the handler deadlocks, paused requests abort
  with "Failed to fetch", and the Fetch session going away leaves the app
  wedged. In-page wrap is robust: `const of=window.fetch; window.fetch=async
(u,o)=>{const r=await of(u,o); if(urlMatches){const j=await r.clone().json();
transform; return new Response(JSON.stringify(j),{status:r.status,headers:r.headers})} return r}`
  — the REAL prod response is already complete; you only add the missing field.
  Re-run the patch after any page reload (it does not persist).
- To surface request logs visibly for a recording, `console.log('[tag]',…)`
  inside the patch and tail them via `page.on('console')` in a sidecar
  Terminal. Log both the incoming request params (proves scope/shape) and the
  stamped counts.

## Discovering REAL topic ownership (for honest cross-agent data)

- `topic.getTopicDetail{id}` returns `agentId`/`sessionId` where the caller has
  access (returns `json:null` otherwise — ACL, not absence).
- `metadata.lastSettledOperationId` embeds the runner agent:
  `op_<ts>_<agentId>_<topicId>` — for agent-run topics (judgments) the runner
  is the bound agent.
- **"Move to another agent"** (topic-row context menu → Move Topics modal) is a
  real server write that rebinds `agentId` — verified via `getTopicDetail`
  before/after. Use it to make a row honestly owned by a NAMED agent (e.g. the
  inbox "Orvilo AI") when no named agent owns a feed row — required for the
  agent-name secondary line, since `agentDisplayName` only reads
  `name`/`title` (slug is ignored; builtin task-agent metas resolve '').
- Inbox agents can't send without a bound device (send arrow disabled; "No
  device" chip's Cloud Sandbox option may not stick) — so a UI send can't
  produce an inbox-owned topic; the Move flow is the workaround.
- Sending under the composer-picked Task Agent DOES create + bind the topic
  server-side even with "No device" — only the reply step fails.

## Feed triggering when SWR serves a persisted cache

- On reload the sidebar feed may serve `useClientDataSWRWithSync`'s persisted
  cache with NO network fetch — a fresh `getTopics` only fires when the SWR key
  changes. Force one via the Topics sort/filter menu (Organize → By
  status/By time changes `sortBy`), the All-Topics drawer (Load More →
  `loadMoreTopics` + its own search field), or the post-send `internal_updateTopics`
  merge.

## CDP eval helper (reliable store reads, zero page-focus risk)

- pnpm does not hoist playwright-core: `require('playwright-core')` fails even
  with NODE_PATH. Require the absolute path:
  `require('<repo>/node_modules/.pnpm/playwright-core@*/node_modules/playwright-core')`
  (check `ls node_modules/.pnpm | grep playwright-core` for the version).
- Pattern: `chromium.connectOverCDP('http://127.0.0.1:9222')`, pick the page
  whose URL contains `_dangerous_local_dev_proxy`, `page.evaluate(expr)`.
  This avoids GUI DevTools entirely — no focus transfer, no `g>i` hotkey risk.

## Sidecar watch for screen recordings

- To make store transitions visible IN the recording: run a polling eval loop
  in a visible Terminal window beside Chrome (e.g. `while` + `setInterval`
  every \~1.2s printing `lu=… cp=… rt=… tp=…`, with a `<<< CHANGED` marker when
  a watched field flips). Position via
  `osascript -e 'tell application "Terminal" to set bounds of window 1 to {960,40,1600,780}'`
  and Chrome at `{0,0,960,1200}`. Viewers see persisted-state transitions live
  (e.g. lastUsedAgentId rehydrating across a reload).

## Correction — "Cloud credentials required" banner does NOT block sends

- The earlier note that sends fail with "Cloud credentials required" /
  "No device" is only partially true on the ORVILO_TEST_USER account: the
  banner coexists with WORKING sends — the message POSTed, a real server-side
  topic was created and bound to the composer-picked agent, and
  `composerAgentId` was consumed. What fails is the agent's _response_ step
  ("No bound device for hetero agent" / "Agent service is currently
  unavailable"). So send-path store effects (topic binding, lastUsedAgentId,
  draft consumption) ARE testable; only the streamed AI reply is not.

## Agent-selector / cosmetic gotcha

- The composer's agent chip may label the builtin task agent "Untitled Agent"
  on a room where its meta lacks `title` and `builtinAgentSelectors.taskAgentId`
  hasn't resolved yet — a label fallback, not a wrong agentId. Verify the
  resolved agent via the store, not the chip text, when it says "Untitled Agent".

## Verifying NEW server input fields on prod (zod-strip detection)

- Prod zod **silently strips unknown input fields** rather than erroring —
  `scope`, `value.agentId` (updateTopic), `metadata.agentHandoffs`
  (updateTopicMetadata), `cloneTopic.targetAgentId` are all new-server fields.
  Decisive probe: run the mutation yourself with the client's exact input and
  compare the **echoed topic in the response** to what you asked — prod
  mutations return the topic object (or id); a stripped field comes back
  unchanged/absent. Used to prove updateTopic{agentId} and
  updateTopicMetadata{agentHandoffs} are no-ops on prod while "succeeding".
- tRPC input shapes differ per procedure: `updateTopic` wraps fields in
  `{id, value:{...}}` (flat `{id, agentId}` fails "expected object at path
  value"); `updateTopicMetadata` is `{id, metadata:{...}}`; `cloneTopic` is
  `{id, newTitle?, targetAgentId?}` and returns only `data.topic.id`.
- Raw `getTopicDetail{id}` returns `agentId:null` for unfiled topics even when
  they're really owned — it is NOT a reliable owner probe. Per-agent
  `getTopics{agentId}` lists only session-filed rows; unfiled workspace topics
  never appear regardless of owner. `getMessages{topicId}` needs more context —
  plain calls return \[] even when messages exist. Read store maps
  (`topicDetailMap`, `dbMessagesMap` keyed `main_<agentId>_<topicId>`) instead.
- Some mutations resolve the topic in the CALLER's scope
  (`assertCreatorTopicTargets`): a raw `cloneTopic` call can 500
  "Topic not found" for an id the app just used — your raw fetch lacks the
  app's context headers; that error is scope, not absence.

## Handoff-marker render path (PR3)

- `AgentHandoffMarker` only renders when the topic ROW's
  `metadata.agentHandoffs` reaches the store — `updateTopicMetadata`'s
  optimistic `updateTopic{metadata:merged}` dispatch does NOT land on the row
  (metadata is server-owned in the reducer). So the divider appears only after
  `refreshTopic` returns persisted metadata — on prod the key is stripped, so
  the marker can never render live; emulate by stamping
  `metadata.agentHandoffs` into the real getTopics response via the fetch
  patch (same technique as agentId).
- Client navigation is unconditional: Continue/Fork build the URL with
  `toAgentId` and navigate even if the server write stripped fields — a
  forked clone can sit under the SOURCE agent while the URL shows the target
  room. Verify real ownership separately; don't trust the URL.
- Draft keys are `topic_<topicId>` (conversation-scoped) in localStorage
  `orvilo:chat-input-drafts:v1` (flat map, also holds `main_<agent>_new`
  blank-composer keys). The draft survives Continue because topicId is
  unchanged — verify via the key, not just the visible composer text.
- Clicking a feed row with `agentId:null` navigates within the CURRENT room
  (fallback to activeAgentId) — to hand off from an unfiled topic, first open
  it via URL on its owner's room so the chip resolves the owner.
- The in-page fetch patch guard (`window.__feedPatchV1`) blocks re-apply —
  bump the flag name after editing the patch file, or the old wrapped fetch
  stays armed.

## /chat canonical routes + new-shell navigation (PR4)

- The workspace shell IA changed: the sidebar no longer hosts the topics
  feed — it lives in the **"Chat history" dropdown** under the topic-title
  button at the top of the /chat page ("New Topic ∨" on the blank composer,
  "<title> ∨" on a topic). Clicking a row navigates to `/chat/<id>` —
  deterministic alternative: type the `/duptest-ws9/chat/<id>` URL directly.
- **beforeunload dialogs fire on FULL-page navigations** (typed URL / reload)
  whenever an unsent draft exists — in-app router nav (dropdown clicks) does
  NOT trigger them. These dialogs crash any `page.evaluate`/CDP script that
  lacks a dialog handler (`Page.handleJavaScriptDialog` uncaughtException) —
  attach `page.on('dialog', d => d.accept().catch(() => {}))` inside your
  CDP helper once per page handle. Accepting is correct for your own navs.
- Persisted `activeTopicId` + the `useChatRouteSync` subscription can restore
  a stale topic onto `/chat` and even `/chat/new` (bare `/chat` landed on the
  last-flushed topic twice in testing — documented intent is blank composer).
  When asserting a blank composer, verify the URL says `/chat/new` AND the
  composer is actually empty — not just the header label.
- Draft-storage truth: `orvilo:chat-input-drafts:v1` flat map — keys
  `topic_<id>` per conversation, `topic_new` for the blank composer
  (workspace-scoped, survives agent picks), legacy `main_<agent>_new` may
  remain. `topic_new` is consumed on send. A "\[Draft]" hint shows on feed rows.
- Chip identity vs meta gap: the agent dropdown labels come from the LIST
  data, but the handoff modal + chip read `agentMap` via `getAgentMetaById` —
  an agent missing from agentMap shows as "Untitled Agent" even when the
  dropdown named it (observed for "Jack"). Report as cosmetic meta gap, not
  a wrong-target bug — the picked id is still correct.
- TopicOwnerSync owner binding on prod: rows lack agentId → owner resolves
  via `topicDetailMap`/deep-link `getTopicDetail` (works for session-filed
  topics like moved vHwl; returns null for unfiled → chip shows whatever
  activeAgentId was left). Feed-patch agentId stamps exercise the real sync.

## Tracing zustand action names (writer identification)

- `src/store/middleware/createDevtools.ts` wraps zustand `devtools` behind `optionalDevtools(showDevtools)` — OFF unless the page URL has `?debug=<name>` (name = store key e.g. `chat`; extension name becomes `Orvilo_<name>_DEV`). To trace every named write on the LIVE store without a store handle: `page.addInitScript` a fake `window.__REDUX_DEVTOOLS_EXTENSION__ = { connect(opts){ return {init(s){...}, send(action,s){log(action, s.activeTopicId)}, subscribe(){}, error(){}, unsubscribe(){}} } }` before app eval, then load `…?debug=chat`. Every `setState(partial,false,'Action/label')` arrives as `send(label,nextState)` — instance-proof.
- DO NOT `import('http://localhost:9877/src/store/chat/store.ts')` to grab `useChatStore`: when the app loaded the module via a `?t=<ts>` HMR specifier, a bare-URL import evaluates a SECOND store instance — `expose('chat')` re-runs and poisons `window.__ORVILO_STORES.chat` with the stale instance (reads null forever, patches never see writes). Prefer devtools injection; read state via `__ORVILO_STORES.chat()` only if you never imported the module.

## Omnibox "restore" false positive

- Typing `…/chat` in the address bar and pressing Enter can land on `…/chat/tpc_<id>`: Chrome's omnibox ranks visited `/chat/tpc_*` URLs in the suggestion list alongside bare `/chat`/`/chat/new`. Verify `location.pathname` history with pushState/replaceState hooks + store writes before attributing a landing to app code. Signal: store tp goes EMPTY at landing (reload wipe), then `ChatHydration/syncTopicFromUrl` binds the URL's topic \~6s later — vs a true in-app restore where tp never empties.
- For deterministic route tests use `page.goto` (no autocomplete) or SPA `navigate` via clicking real UI links.

## Repro-ing CI e2e failures on the Debug Proxy build

- **Download CI artifacts directly**: `gh api repos/<owner>/<repo>/actions/jobs/<job>/logs --allow-escape-sequences` for the raw log; `gh api repos/.../actions/runs/<run_id>/artifacts` + `gh api repos/.../actions/artifacts/<id>/zip` for uploaded e2e screenshots (failure frames in `screenshots/` are often decisive — e.g. showed a created-but-empty topic, not a swallowed send). Token file: `~/.devin/.devin-integration-gh-credentials` (actions read scope).
- **"Send did nothing" diagnosis ladder**: (1) zero `devtools.send` writes after Enter = composer gate before `sendMessage` (check `resolveSendBlocked`: `sendButtonProps.disabled`/`customSendButtonProps.disabled`/`inputDisabled` hetero gate, `disableQueue && isInputQueueBlocked`, `!message.trim()` stale-editor read); (2) send fired but topic invisible = `activeAgentId`/`context.agentId` unresolved → `messageMapKey` loses the agent segment → messages orphaned under `main_<aid>_<id>` (check `chat().activeAgentId`, `getTopicById(id)?.agentId`, composer chip label — generic "Agent" = unresolved); (3) topic exists + rows missing = `replaceTopicId` never rekeys `dbMessagesMap` — only bites when server id ≠ client-minted id.
- **Prod send gate**: accounts with zero paired devices (`device().devices.length===0`) have every hetero agent send-disabled — UI Enter is a silent no-op. Bypass for store-path verification: `__ORVILO_STORES.chat().sendMessage({message, context:{agentId,scope:'main',topicId:null,workspaceSlug},files:[],contextSelections:[],pageSelections:[]})` — the optimistic mint/commit runs client-side before any device call, so the post-Enter path (mint→switchTopic→nav→replaceTopicId→row commit) is fully testable even device-less.
- **Editor-remount probes**: tag the contenteditable node (`el.__mid=random`) on a 150ms interval across a route transition — identity swaps prove composer remounts (the "Enter fired during remount" hypothesis). On f1cf02106: 0 swaps on /chat/new mount.
