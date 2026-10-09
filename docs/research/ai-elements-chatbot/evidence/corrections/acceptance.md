# Avatar and surface correction

Electron verification on 2026-10-09 used source
`7b947d199da657cafa3b68f587babcc82ad11c5d`, containing UI correction
`08d8614ceb8367dcb6798001a63cdefb82588fe0` and the separately delivered local
gateway/cache integration work. That tested revision is retained on
`fix/desktop-real-model-dev`.

After discovering that #580 had already merged, only the four-file UI correction
was ported onto canary `e38170ee9`. The Composer conflict retained canary's
`data-testid="chat-input"`; no existing input selector was removed. The source
revision above remains the screenshot provenance, not a claim that every
unrelated canary change received another native acceptance run.

Verified in the actual Electron app:

- Libraries.dev BotAvatar appears on assistant messages; requested user/custom
  avatars retain their existing rendering path. The old author/time row remains
  absent on the Chatbot surface.
- The page and composer use the existing content-surface token. Light background
  measures `rgb(255, 255, 255)` and dark background `rgb(13, 13, 13)`.
- The 20px ThinkingOrb appears while a real Step5 request is pending. The actual
  reply `ORBS_VISIBLE_OK` follows. There is no simulated generation response.
- Dark mode was activated through the application's persisted `next-themes`
  preference and the prior preference was restored afterward.

Screenshots: [light](./avatar-surface-light.png), [real generation with Orb](./orbs-real-generation.png),
[dark](./avatar-surface-dark.png). Measurements: [verification.json](./verification.json).

Checks on the original correction: 10 existing message/error tests passed;
four-file scoped lint passed. Independent light review reported no findings.
The pure background change is verified through actual computed colors and
screenshots rather than tests asserting CSS class strings.
