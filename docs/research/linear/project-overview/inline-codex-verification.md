# Main project property row — Codex runtime checkpoint, 2026-09-22

This checkpoint was measured on the parent application revision `b8e008890` plus the UI diff committed beside this report, against the actual Linear project Overview in the signed-in Brave session. Candidate was the Electron renderer on CDP 9222, synthetic workspace `ws-useragenttes`, project `parity-test-project`. The two sides currently have different locales and entity data; text widths are not a pixel parity verdict.

## Observed results

- Before the change, the candidate main status was a static tag. After the change it is a 28px, radius-9999 button with 13px/500 text, 3px 6px padding and a 16px status glyph. Real CDP pointer click opens a six-item menu including Canceled. See `inline-codex-status-menu.png`.
- On the disposable synthetic project, chose Planned from the **main** status menu. Main label changed, and a cold reload still showed Planned. Chose In Progress afterward; the original state was restored.
- Start-date input in the main row has a rendered 16px calendar SVG with path geometry in the generic CDP snapshot. Real pointer click opened the five precision tabs and calendar. Clicked outside without saving. The target-date icon is also rendered.
- Generic `cdp-snapshot.cjs` captured 6,554 actual candidate elements in `/tmp/candidate-inline-snapshot.json`: the main status node contains computed radius/font/padding/gap and nearest interactive ancestor, and calendar SVG descendants contain exact path geometry. `cdp-probe.test.cjs` and `parity-pairs.test.cjs` cover icon, font, spacing, nonzero diff exit and unreadable measurements. This captures structure and computed style; interaction still needs the separate pointer/CDP checks above.
- The reference main status/priority/lead controls measured 28px height, 9999px radius, 3px 6px padding and 16px SVG. Reference start/target date controls were 28px tall with 16px icons. Candidate status is 28px/radius9999/padding3px6px; both date glyphs are 16px. Locale-specific width prevents an absolute width comparison here.
- Scoped check over the four changed TS/TSX files: lint clean, 62 tests passed. Independent final read-only review found no current status-transition defect after Canceled and terminal-state fixes.

## Still open for 1:1 parity

- Reference main row has Team and overflow controls; candidate main row still has Members and Public. Members editing remains available in the right rail. The main row's content and full responsive wrap remain unaccepted.
- Linear has a Completed transition in its project menu; Orvilo's current project lifecycle does not permit direct Completed writes. This needs a domain decision/implementation, not a visual-only menu option.
- Reference and candidate were not captured at the same locale/viewport for pixel scoring. This checkpoint proves the named behavior and styling properties only, not whole-page visual parity.
