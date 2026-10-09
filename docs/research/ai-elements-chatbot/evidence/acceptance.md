# Native Electron acceptance

Final source: `9ec2b3fe249f8457cd67ef43d94aed4c9f56e3f7`. Core screenshots were recaptured after the merge completed and a cold renderer reload. Composer interaction receipts were collected on `0df5405d54c5f9dff17e73e9b0698527a33dd3bc`; the intervening merge changes only the non-Chatbot timestamp condition. Actual Electron 43.2.0, app\://renderer, Linux Xvfb, 1440×1000 and 900×720. No browser-only substitute or DOM styling override.

Every retained `final-*.png` was visually inspected. No Vite overlay remains. Empty dark/light/narrow/reduced-motion images were replaced after a transient merge-conflict overlay; provisional and superseded pictures were moved outside the repository. Reference images remain separately labeled `reference-*`.

## Confirmed

- Main page uses full available width, no author/avatar/time rows, user bubble and plain assistant content, divided non-overlay footer. Composer and conversation use 16px horizontal inset.
- Native composer body measures 64px minimum, max192px, padding12px, font14px/20px; group radius8px. Agent is on the left, Send on right, and disabled Send does not dim the whole input card.
- Settings opens real device/workdir/access controls. Regular-agent fullscreen reaches1408×968 inside a1440×1000 viewport, exits through Settings→Collapse, and preserves draft. OpenCode has no Expand because its existing allowExpand gate disallows it; no state override was used.
- Native Plus menu and slash Skills menu open. Slash includes agent-browser/artifacts/orvilo. Topic switch and return restore the typed draft. Starter suggestion fills the draft without sending.
- Native Jump to latest appears after scrolling up in the long code fixture; clicking it reaches bottom and hides the button. See candidate-scroll-suggestion.json.
- Reasoning expands/collapses. Native Tool header has only wrench/status/chevron, no legacy bug/delete/toggle toolbar. Tool collapse/reopen works. Parameters precede compact inline Confirmation; composer remains mounted. At900px the actions remain reachable through actual conversation scrolling and wrap correctly.
- Approval UI dispatch checked with supported host veto hooks: approve, reject, reject reason, remember key, native Enter once, numeric focus, and arrow navigation. Stop dispatch was intercepted. No tool execution or persisted approval-success claim. See final-extras-callbacks.json.
- Empty-state actual thinking-orbs canvas measures64×64; captured in both themes, narrow width and prefers-reduced-motion mode. The pass verifies reduced-motion rendering and media preference, not a frame-by-frame proof that all animation stops.

## Real model attempt and limit

One actual Electron Send was attempted with OpenCode/Step5 and the text “UI acceptance probe: reply only READY. Do not use tools or execute commands.” It persisted the user message and returned: **“Connect a device, then pick it in the device selector before sending again.”**

Read-only device inspection found only `e2e-mock-device`, supplied by the existing fake gateway, `registered:false`, personal scope, Darwin platform. No registered current Linux Electron device is available, and the Workspace Devices control is read-only. That synthetic device was not selected as a supposed real execution target. Real Step5 inference/streaming/cancellation therefore remains unverified. No auth bypass or invented model response was used. See real-send-probe.json and device-inventory.json.

## Fixture provenance and retained coverage

Reasoning/tool/planning/approval messages are explicitly labeled synthetic database fixtures. Mock Clerk authenticates the disposable test user through the repository's normal session helper; the expired fixture session was renewed. Existing backend was restored against the disposable orvilo database after inherited environment variables targeted a nonexistent database. A generated Next/pdfkit dependency link was repaired; no product source or package manifest was changed for environment repair. Transient HMR duplicate-store state disappeared after runtime restart and session renewal.

Parent-branch acceptance already covers unchanged attachments, Artifact, special HTML/Mermaid fences, code controls and operation-indicator states. This page pass rendered long code, sources, Terminal, Snippet, goal and todo adapters, but did not repeat all their engine/control tests. Custom-question approval, streaming20px Orbs lifecycle, IME, real upload, queue/real cancellation, multi-thousand-row history and non-main chat surfaces were not newly exercised here. These are coverage limits, not claimed passes.

## Retained final images

- final-rich-light.png, final-rich-dark.png, final-rich-narrow\.png
- final-approval-light.png, final-approval-dark.png, final-approval-narrow\.png (scrolled to actions)
- final-empty-light.png, final-empty-dark.png, final-empty-narrow\.png, final-empty-reduced-motion.png
- final-settings.png, final-fullscreen.png, final-plus.png, final-slash.png

The application's sidebar/header and optional workspace overview are outside the reference component and remain visible. Some narrow or expanded rich screenshots show only part of the scrollable history; this is real viewport clipping, not overlap by the footer. No confirmed new source defect was found in the exercised scope.
