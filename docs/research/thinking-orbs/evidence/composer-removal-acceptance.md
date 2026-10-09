# Composer status row removal — Electron recheck

2026-10-09. Source revision: `ce421a26b951eb5993c85bcf64d7bd46072b5cfa` (captured from its working tree before commit; formatting-only hooks). Actual Electron HMR, same local
synthetic operation fixture as prior acceptance; no model inference claim.

While runtime + callLLM operations are running, the conversation composer no
longer has the rotating phrase/time status row above it. DOM inspection found
zero OpStatusTray source nodes. Message-level Generating label and 20px Orb,
actual BotAvatar, and active input BorderBeam remain present. The sidebar's
existing topic timer is a separate unchanged surface.

Input retained the same editor DOM, exact draft, and focus during activation.
No pageerror observed. Latest visual evidence: `latest-composer-dark.png` and
`latest-composer-light.png`; state output: `composer-removal-runtime.json`.
The task-detail feedback input surface was not changed or tested in this check.

## Follow-up: remove Blocks Tools button

Source revision: `ce421a26b951eb5993c85bcf64d7bd46072b5cfa` (captured from its working tree before commit; formatting-only hooks). Existing OpenCode fixture `agt_acceptance_cli`
was opened without changing database identity. Actual composer has zero
`lucide-blocks` icons, retains the plus button (accessible label `Formatting and
scheduling`), and still has no OpStatusTray nodes. Latest-composer light/dark
screenshots above were replaced to reflect both removals.

Typing `/` with actual keyboard input opens the slash menu: Send in new topic,
Compact context, and skill entries `agent-browser`, `artifacts`, `orvilo`.
Clicking `agent-browser` inserts the skill into the editor. Nothing was sent;
the disposable fixture draft was restored afterward. Programmatic fill('/')
alone did not open the menu, so verification used real keyboard input.
Evidence: `slash-after-tools-removal.png`, `tools-removal-runtime.json`.
