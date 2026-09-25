# Shared priority icons — runtime verification 2026-09-22

Implementation revision: `fcbad6e8d48e554a9ff24cf9a0f48d7f349955f0`.

Reference CDP on Linear Projects showed a 16 × 16 priority SVG in each row. A No Priority row had an icon-only 28 × 28 property button with empty visible text and `aria-label="No Priority"`; this is why the candidate project list now shows the same icon without a long label that exceeded its priority column.

On the running Electron renderer, the synthetic project's High priority trigger measured 57.28 × 28 CSS pixels at x=471.83, y=287. Pointer activation opened a real listbox with all five localized values (0–4), each using the shared 16 × 16 SVG path; Urgent retained its orange color. The Projects list High row rendered the same path, and the Create Project dialog's default No priority used the shared none path. The dialog was closed without submission and no priority value was changed. The renderer was restored to Inbox afterward.

The scoped repository check reported lint clean and 62 related tests passing; a further scoped check of the icon-only Projects list cell reported lint clean. Separate Electron verification of a task priority control and a No Priority project row remains open; this evidence does not claim those states or full Projects list parity.
