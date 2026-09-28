# Agent page candidate verification

Verified 2026-09-22 against the shared authenticated Electron target on CDP `:9222`.
Evidence was produced from base revision `c5f45c9a329245a1f3a9474ed279bcd412ded535` plus the
uncommitted Agent diff listed in this directory. The later commit SHA is recorded in the handoff.

## Route identity

1. Started from `app://renderer/ws-useragenttes/inbox` at 1440x900, DPR 2.
2. Navigated to `/ws-useragenttes/agent/inbox`.
3. The built-in slug settled to
   `app://renderer/ws-useragenttes/agent/agt_cxOmOVkEcj4t`.
4. The standardized topic probe reported the same Agent ID and `activeTopicId: null`.

The former broken result ended with a synthetic `/ws-useragenttes` topic segment. The corrected
runtime URL contains no such suffix.

## Landing geometry

At 1440x900:

- Composer card: `x=296, y=400.5, width=712, height=106`.
- Visible editor: `x=309, y=409.5, width=686, height=56`.
- Orvilo watermark: `x=484, y=221.5, width=336, height=336`.
- The former 64 px avatar, `Orvilo AI` heading, and welcome paragraph were absent from the
  landing body.

At 390x844:

- Composer card: `x=25, y=372.5, width=332, height=106`.
- Visible editor: `x=38, y=381.5, width=306, height=56`.
- Watermark: `x=28, y=198.5, width=326, height=326`.
- No horizontal clipping occurred within the route surface.

Screenshots:

- `/tmp/orvilo-agent-new-chat.png`
- `/tmp/orvilo-agent-new-chat-mobile.png`
- `/tmp/orvilo-agent-new-chat-returned.png`

## Real topic path and click outcomes

A disposable topic was created through the live chat store's `createTopic`, `updateTopicTitle`, and
`refreshTopic` actions. This exercises the product's normal topic service and cache path rather
than injecting DOM fixture data.

- The rendered topic row was a real 236x28 `<a>`.
- A hit-tested pointer click selected topic `tpc_yj6y9ETXaCnz`.
- The URL became
  `app://renderer/ws-useragenttes/agent/agt_cxOmOVkEcj4t/tpc_yj6y9ETXaCnz`.
- The standardized topic probe returned `ok: true`, the exact topic ID, the expected Agent ID, and
  persisted execution metadata.
- The composer moved from the centered landing to the conversation footer (`y=730`).
- A hit-tested click on the 236x28 `开启新话题` row restored `activeTopicId: null`, the ID-only URL,
  and the centered watermark/composer geometry.

The topic was then removed through the real `removeTopic` action. Final checks confirmed its label
was absent, the app was restored to `app://renderer/ws-useragenttes/inbox`, and the viewport was
restored to 1440x900.

## Automated checks

- Red proof: with the previous suffix logic restored temporarily, the AgentIdSync regression
  failed because navigation received `/agent/agt-inbox/ws-useragenttes`.
- Green proof: 2 focused files, 11 tests passed.
- Scoped repository lint: 5 Agent files clean.
- Local root `tsgo` was not run, per repository policy.

## Short-height authorization overflow follow-up

An independent review found that the initial centered landing used `overflow: hidden` while
`ToolAuthAlert` can render multiple authorization rows above the composer. The landing now keeps
horizontal clipping but exposes vertical scrolling, adds 16 px block padding, and uses auto block
margins on non-shrinking content. Short content remains centered; tall content starts at the safe
top padding and becomes scrollable.

Electron was replayed at 390x420 using a DOM-only eight-row authorization probe inserted before
the real composer inside the actual landing content boundary:

- scroll region client height: 299 px;
- content scroll height: 588 px;
- computed overflow: `hidden auto` (`overflow-x: hidden`, `overflow-y: auto`);
- the first authorization action was visible at scroll position 0;
- the last action was initially below the viewport, proving the fixture overflowed;
- at the maximum scroll position (289), both the last authorization action and the real composer
  were visible.

Evidence:

- `/tmp/orvilo-agent-auth-overflow-top.png`
- `/tmp/orvilo-agent-auth-overflow-bottom.png`

The probe was removed, Electron was restored to 1440x900, and the shared route was restored to
`app://renderer/ws-useragenttes/projects`. No real connector/plugin authorization state was created,
so the live `ToolAuthAlert` row styling and OAuth actions remain unverified; the actual landing
scroll boundary and multiline reachability are verified.

## Remaining gaps

- The candidate still uses its Agent-specific left navigation, dense header actions, control bar,
  and optional Working Sidebar. This slice does not claim whole-page parity.
- The reference's example-card state had already been dismissed in the current account. Earlier
  same-day evidence proves the state exists, but its mutation and persistence contract remain
  unverified.
- The disposable candidate topic had no messages. Existing populated conversation rendering was
  preserved by the branch test and topic click, but message-card/work-disclosure visual parity was
  not certified.
- Reference history/Skills/options menus were inspected read-only; equivalent candidate menu
  consolidation is a separate slice.
