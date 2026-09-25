# Chinese UI font runtime verification — 2026-09-22

Implementation revision: `0ac85db9bc5ce0845e911c327e519f28deaeb1d0`. The Project layout no longer applies its local `Inter Variable` override; it inherits the application's original Chinese font stack. Required CI checks that stack and rejects local UI font overrides.

On the running Electron renderer at `app://renderer/ws-useragenttes/project/parity-test-project/overview`, 1440 × 900 CSS pixels at DPR 2, a read-only CDP `DOM.getDocument` traversal found 93 Chinese text nodes. `CSS.getPlatformFontsForNode` on the first 12 text-bearing parent nodes returned `HarmonyOS Sans SC` as the actual rendered family for all 12, with `isCustomFont: true`. Samples included Project, Inbox, My issues, Reviews, Agent, Drafts, and Workspace navigation labels. This is a browser glyph result, beyond the CSS fallback declaration.

The source guard passed against the repository; six focused guard fixtures passed, including missing-semicolon `font-family`, numeric-weight `font` shorthand, `initial`, and UI `monospace` rejection. Focused ESLint passed. The sample confirms font selection on this local page and navigation; it does not certify font rendering on every page, state, or platform.
