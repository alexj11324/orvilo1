# UI alignment regression CI

The `UI alignment / Browser geometry` workflow renders the real `ActionIcon`,
`Accordion`, and ResourceManager `ActionIconWithChevron` in a standalone,
authentication-free Vite fixture. It imports `src/app/globals.css` through the
repository's Tailwind/PostCSS pipeline and loads the same unlayered
`antd/dist/reset.css` used by `AppTheme`. The real `@lobehub/ui`
`ThemeProvider` supplies the app font metrics and light/dark colors. Custom
fonts are disabled to keep this fixture independent of external font requests;
app-store providers and the app viewport overflow rules are not mounted. No production route or duplicated
component stylesheet is involved.

The Chromium matrix covers light/dark themes, 360/1024px viewports, English,
Chinese, and long labels. It checks named, numeric and custom icon sizes,
loading sizes, caller glyph style overrides, filled/outlined variants, zero
icon-button padding, centers within 0.5 CSS pixels, 24px accordion label/action row geometry and zero heading margins,
resource toolbar glyphs, both accordion arrow states, keyboard focus and
tooltips. A separate plain-span project wrapper records baseline offsets in
the diagnostics. The fixture uses representative row composition and real
primitives; it does not mount the full authenticated project page.

CI runs `bun run test:ui-alignment`. Browser automation is maintained and run
in remote CI. The Playwright spec and runner have a separate TypeScript project
checked by this workflow: Playwright imports Electron's global DOM overloads,
so these runner files are excluded from the application's Vitest type program.
The browser fixture and Vite config remain covered by the root Typecheck job.
Vitest excludes this directory; Playwright owns its browser test execution.
For manual inspection, start only the fixture server:

```sh
pnpm exec vite --config tests/ui-alignment/vite.config.ts
```

Open `http://127.0.0.1:5188/?theme=dark&language=zh&text=long` in a browser.

Each CI artifact contains the tested Git revision, per-case measured geometry,
screenshots, an HTML report and failure traces. Inspect those artifacts when a
check fails. Screenshots are review evidence; there are no platform-dependent
pixel baselines. These primitive checks complement real page acceptance and
cannot certify every authenticated product layout.

## Component ownership rules

- `ActionIcon` owns the button block and the glyph size through its existing
  size map. Its loading spinner uses the same glyph dimensions. The underlying
  `Button` supplies interaction states, not text-button padding or glyph size.
  Explicit caller `styles.icon` overrides remain supported.
- Ordinary text buttons keep `Button`'s default icon sizing. A compound icon
  control with a different size must declare a CSS size on its glyph, as the
  ResourceManager toolbar does, rather than relying on SVG width attributes
  that descendant CSS can override.
- `AccordionTrigger` centers its label and arrow on the same cross axis.
  Its semantic heading owns zero margins explicitly because the real Ant Design
  reset adds an unlayered bottom margin to headings. The accordion row checks
  compare the label and arrow with a sibling action under that reset.
  Intentional top alignment must be an explicit caller override, and must have
  representative visual coverage.
- A wrapper around an icon-only action in a row should use `inline-flex` so
  text baseline descent does not change the action's geometry. Measure both
  wrapped and unwrapped controls before adding a visual offset.
  CI asserts the `inline-flex` companion wrapper stays 24px tall and centers
  with its label; the plain-span negative control remains diagnostic evidence.
- Keep optical corrections separate from layout geometry. Diagnose rendered
  bounds and computed styles first; do not hide a shared sizing error with a
  page-specific `translateY` or margin adjustment.

When a shared component changes, maintain these browser cases and review the
light/dark screenshots alongside the affected product page. Update an expected
size only when the component contract intentionally changes, not to silence a
failing measurement.

## Required hover feedback

The same Chromium workflow now runs `hover.spec.ts` in light and dark mode. Its 28-control mandatory roster imports the real Button, ActionIcon, dropdown/popover triggers, and detail styles. Every enabled rendered control must change its own visible background or shadow (including an owned pseudo-element); text-color changes and resting fills are insufficient. The judge composites paint over the pre-hover backdrop, excluding parent-only changes and compositing pseudo layers over the control's own fill, and uses a 3/255 color-channel floor. An empty inventory or missing control type fails. Tests click actual controls and verify the click counter, picker open/close, or filter state. Deliberately unstyled, text-only, ancestor-only and same-color pseudo negative controls must fail that same judge in both themes. Screenshots, computed paint diagnostics and revision are uploaded by the existing workflow.

Disabled native/loading controls and aria-disabled permission wrappers are excluded only after verifying they are disabled. Display-only values have no button role and are not click targets. Caller-rendered role buttons reuse the exported `buttonHoverFeedback` CSS class without inheriting Button sizing. Optional handlers apply the class only when actionable; no-op wrappers condition their button role on the handler. Colored swatches, screenshot pins and opaque image buttons use `data-hover-paint="shadow"` with that same class: a restrained semantic shadow preserves the meaningful face color/image instead of covering it with a wash. The colored-shadow fixture verifies this exact contract.

The Native Controls source gate also rejects new raw role-button bypasses and direct overrides that suppress shared Button hover paint. A raw role root must import and apply `buttonHoverFeedback`; a caller background override must opt into the measured shadow contract. No new hover-debt allowlist caps were added. Existing native-control count caps remain architectural migration inventory; those controls now receive the same explicit hover contract when scanned as actionable roots. This fixture checks shared interaction contracts; it does not mount every authenticated route or replace Electron acceptance of those pages.

The source gate parses JSX with the repository's existing TypeScript dependency, including callback arrows, nested props and important utility overrides. Its Native Controls CI job installs the existing workspace dependencies before scanning. Selected data-active rows and opaque thumbnail shadow feedback have actual rendered representatives; no selected row can pass merely by retaining its resting tertiary fill.
