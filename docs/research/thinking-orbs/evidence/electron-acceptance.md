# Independent Electron acceptance — Libraries.dev effects

2026-10-09, actual Electron 43.2.0 on Xvfb, `app://renderer` from the independent
`feat/orbs-chat` worktree. Local backend on port 3010, PostgreSQL fixture DB.
Source revision: `345df25cf961f88c5dafe2b836da4d89e2fdec53`. Captured from the corresponding working tree before commit; commit hooks applied formatting only. These are component/state tests, not
proof of successful real inference or approval of the overall chat design.

## Provenance

The visible user prompt explicitly identifies a synthetic operation fixture.
`startOperation`, `completeOperation` on the actual chat store drive runtime
parent and child states; no synthetic model output is passed off as real.
Clerk/auth services are local fixtures. Gateway end-to-end inference remains
unverified: no authenticated bound device/real device gateway in this environment.
The old assistant-ui worktree and its evidence were left untouched.

## Observed

- Actual installed `thinking-orbs` renders an aria-hidden 20 × 20 canvas beside
  localized generation, compression and retry labels. Retry keeps synthetic 503
  details and attempt 1/3. Canvas samples change over 500 ms under normal motion.
- Actual `bot-avatars` renders its default assistant canvas (blue clover/fabric,
  upstream colors). User smiley remains a user avatar. Library uses a 42 px
  overscan canvas for a 28 px avatar. Final computed parent overflow is visible;
  the screenshot detail captures its complete overscan area after the fix.
- Actual BorderBeam appears while the conversation is busy. Under reduced motion,
  its root lifecycle animation is 0.01 ms; decorative continuous beam animations
  are absent. Busy → idle removes the Orb and active beam attribute; idle → busy
  restores both. Existing unrelated editor animations remain.
- Synthetic failOperation on child and runtime parent removes the Orb and active
  beam attribute while keeping editor focus and draft.
- Editor DOM identity and draft text remain unchanged across all those operation
  transitions. Draft also persists when changing synthetic fixture topics.
- Light/dark and 1440 × 1000 / 900 × 720 renders captured. No route crash occurred.
- Regular agent fullscreen: actual Expand click produces input 1180 × 888 inside
  a 1440 × 1000 window; typing succeeds. Collapse returns to 776 × 106 and retains
  appended text. Context menu opens by its actual button. Heterogeneous OpenCode
  composer intentionally has `allowExpand=false` upstream, so a separate regular
  agent fixture was used for this check.

## Limits and existing environment warnings

- Upstream public pages could not be captured in a separate Electron target:
  `Target.createTarget` is unsupported. Source documentation/package API review
  was performed by root; this is not a screenshot parity claim.
- Existing Base UI `nativeButton` warnings from message action bars and editor
  contenteditable flex warning were observed. No new effects exception observed.
- PostgreSQL acceptance setup lacks pg_search/BM25; global search is not validated.
- Actual send/stream/stop against Step 5 gateway is not validated here. Prior
  independent direct Step 5 CLI success is not an Electron end-to-end result.
- Reasoning-specific rendering, custom image-avatar preservation require additional checks beyond the generation/compression/retry and
  completion transitions above; source/unit review is separate evidence.
