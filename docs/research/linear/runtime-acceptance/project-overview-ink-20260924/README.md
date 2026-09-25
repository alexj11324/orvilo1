# Project overview header mark and body ink — acceptance evidence

Surface: Voyager Launch → Overview (`/ws-useragenttes/project/parity-voyager-launch/overview`), Electron dev app, 1440×900 @2x, dark theme.

| Revision           | Screenshot                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `b29324431` (base) | `candidate-before.png` — header tile shows the clipped name "Voya / ger / Laun"; every text below the title is full-ink white. |
| `67e12de7d`        | `candidate-after.png` — box mark in the header and the 36px overview tile; title at full ink, body one step down.              |

`typo-probe.js` (`bun run dev:env cdp 9232 app://renderer @typo-probe.js --viewport 1440x900`) lists every visible text node's size, weight and colour.

| Element                   | Linear (measured 2026-09-24, dark)       | Before                   | After                        |
| ------------------------- | ---------------------------------------- | ------------------------ | ---------------------------- |
| Title                     | 24 / 600 / lch 100                       | 24 / 600 / #fff          | unchanged                    |
| Summary                   | 15 / 450 / lch 90.45                     | #fff                     | rgba(255,255,255,.88)        |
| Property values           | 13 / 500 / lch 90.45                     | 13 / 500 / #fff          | 13 / 500 / .88               |
| Resource link             | 13 / 500 / lch 90.45                     | 13 / 400 / #fff          | 13 / 500 / .88               |
| Description prose         | 15 / 450 / lch 90.45                     | #fff                     | .88 (headings stay full ink) |
| Milestone name (overview) | 15 / 600 / lch 90.45 (ProseMirror `<p>`) | 15 / 450 / #fff          | 15 / 600 / .88               |
| Overview tile             | 36×36, radius 6, 24px box glyph          | 44px, initials "VL"      | 36px, 24px box glyph         |
| Header mark               | 16px box glyph                           | name text in a 28px tile | 16px box glyph               |

.88 of white over the panel renders ≈ rgb(226, 227, 230), lch 90.4. Linear screenshots stay local and are not committed.

Not covered here: rail date clipping ("12 月 1, 202…"), overview milestone name wrapping, and milestone date placement.
