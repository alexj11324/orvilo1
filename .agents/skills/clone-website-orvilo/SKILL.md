---
name: clone-website-orvilo
description: Inspect live reference applications and implement UI and behavior parity in the existing Orvilo repository using evidence-backed specifications and isolated worktrees.
---

# Clone Website — Orvilo adaptation

Adapted from upstream commit `0fc4dca34fcfcfd32108fb67118aa897a6045414`.
The original files and MIT license are retained under `upstream/` and `LICENSE`.
Read [references/orvilo-contract.md](references/orvilo-contract.md) before the phases below; it defines the repository-specific execution and acceptance contract.

You are about to inspect **the target URL or URLs in the user's request** and align their corresponding existing Orvilo surfaces in appearance and behavior, preserving Orvilo branding and real domain models.

When multiple URLs are provided, preserve every pathname as a distinct route and isolate each target's research, screenshots, components, and assets. URLs that differ only by query string or fragment share a pathname, so resolve their route and state behavior explicitly in the output plan. Parallelize page work only after the shared foundation and output plan are fixed so concurrent builders cannot overwrite one another.

This is not a two-phase process (inspect then build). You are a **foreman walking the job site** — as you inspect each section of the page, you write a detailed specification to a file, then hand that file to a specialist builder agent with everything they need. Extraction and construction happen in parallel, but extraction is meticulous and produces auditable artifacts.

## Scope Defaults

The target is the page and relevant states represented by the requested URL, not only its initial screenshot. Unless the user specifies otherwise, use these defaults:

- **Fidelity level:** Pixel-perfect — exact match in colors, spacing, typography, animations
- **In scope:** Visual layout, component structure, interactions, responsive design, real persistence, permissions, authentication-dependent states and relevant real-time behavior. Test fixtures are for verification, never substitutes for delivered functionality.
- **Out of scope:** Unrequested stack replacement, deployment changes, copying private reference data into product fixtures, and unapproved external mutations. Preserve accessibility while matching the reference.
- **Customization:** No unrequested redesign; preserve agreed Orvilo branding and domain exceptions.

If the user provides additional instructions (specific fidelity level, customizations, extra context), honor those over the defaults.

## Output Isolation and Route Preservation

Treat every target URL as durable project output, not as permission to replace whatever was built previously.

Use the current Orvilo worktree as `<app-root>`; do not replace its scaffold.
Assign each page a unique site/page key and research/screenshot directory. Existing
approved artifact paths may be retained. Map source routes to existing feature and
SPA route owners before creating files. Business UI belongs in `src/features`;
`src/routes` stays thin. Read the repository spa-routes skill before route edits.
Preserve query/fragment state and distinguish entity identity from destination
page semantics. Never normalize different page destinations into one value.

Do not overwrite unrelated routes, artifacts, themes or uncommitted work. Use
existing shared components and tokens; do not introduce a parallel shadcn/Tailwind
component tree. Resolve shared-file ownership before dispatching worktrees.

## Pre-Flight

1. **CDP browser inspection is required.** Use the existing authenticated Linear reference and actual Electron candidate. Do not use native computer control or request Accessibility/Screen Recording. Verify endpoint, tab and route before actions; coordinate one navigation owner per shared target.
2. Parse the target URL or URLs from the user's request. Normalize and validate each URL; if any are invalid, ask the user to correct them before proceeding. For each valid URL, verify it is accessible via your CDP tool.
3. Inspect git state, running services and existing Orvilo architecture. Do not scaffold another app or restart services blindly. Use repository-scoped checks; respect the user's final-only full-CI gate.
4. Inventory existing SPA routes, feature owners, research artifacts, screenshots and assets. Distinguish task-owned changes from unrelated user work; this is an existing product, not an untouched template.
5. Write an output plan listing every target URL, `<app-root>`, `<site-key>`, `<page-key>`, destination route, artifact roots, and whether any shared foundation file must change. Resolve collisions across every planned output, same-path query/fragment behavior, and multi-origin layout decisions with the user before editing.
6. Create only the planned per-page/per-site directories plus `scripts/` if needed. Use unique asset-download script names such as `scripts/download-assets-<site-key>-<page-key>.mjs`; do not overwrite another page's downloader.
7. For multiple pages from one origin, build the shared foundation once, sequentially, before parallel page work. Optionally confirm whether to run page builders in parallel (recommended if resources allow) or sequentially to avoid overload.

Before the inspection pass, read [references/inspection-guide.md](references/inspection-guide.md) for the reusable visual, component, layout, and technical audit checklist.

## Guiding Principles

These are the truths that separate a successful clone from a "close enough" mess. Internalize them — they should inform every decision you make.

### 1. Completeness Beats Speed

Every builder must receive the evidence needed for its bounded implementation: screenshots, measured CSS, permitted assets, content structure and state conditions. Dispatch only evidence-complete slices after primary-agent approval; inventory unknown states as gaps, without guessing or blocking unrelated evidenced work. Parallel construction starts only after the shared output plan and necessary foundation are fixed.

### 2. Small Tasks, Perfect Results

Broad assignments can encourage approximation. Give builders bounded capabilities and measured specifications, then independently verify the result; specificity does not guarantee correctness.

Look at each section and judge its complexity. A simple banner with a heading and a button? One agent. A complex section with 3 different card variants, each with unique hover states and internal layouts? One agent per card variant plus one for the section wrapper. When in doubt, make it smaller.

**Complexity budget rule:** If a builder prompt exceeds \~150 lines of spec content, the section is too complex for one agent. Break it into smaller pieces. This is a mechanical check — don't override it with "but it's all related."

### 3. Real Content, Real Assets

Inspect actual text, images, videos, and SVGs from the live site. Use `element.textContent` and inventory every `<img>` and `<video>`; reuse only authorized assets. Keep private content in authorized local evidence, not distributed specs or fixtures. Use synthetic layout-equivalent data for test fixtures, explicitly labeled as such; preserve product copy through Orvilo's i18n conventions.

**Layered assets matter.** A section that looks like one image is often multiple layers — a background watercolor/gradient, a foreground UI mockup PNG, an overlay icon. Inspect each container's full DOM tree and enumerate ALL `<img>` elements and background images within it, including absolutely-positioned overlays. Missing an overlay image makes the clone look empty even if the background is correct.

### 4. Foundation First

Inventory and reuse the existing foundation: theme tokens, typography, domain types and shared components. Only proven shared gaps require sequential foundation changes before dependent builders start. Do not create global CSS, duplicate types, or copy favicons merely because the upstream template starts from an empty app.

### 5. Extract How It Looks AND How It Behaves

A website is not a screenshot — it's a living thing. Elements move, change, appear, and disappear in response to scrolling, hovering, clicking, resizing, and time. If you only extract the static CSS of each element, your clone will look right in a screenshot but feel dead when someone actually uses it.

For every element, extract its **appearance** (exact computed CSS via `getComputedStyle()`) AND its **behavior** (what changes, what triggers the change, and how the transition happens). Not "it looks like 16px" — extract the actual computed value. Not "the nav changes on scroll" — document the exact trigger (scroll position, IntersectionObserver threshold, viewport intersection), the before and after states (both sets of CSS values), and the transition (duration, easing, CSS transition vs. JS-driven vs. CSS `animation-timeline`).

Examples of behaviors to watch for — these are illustrative, not exhaustive. The page may do things not on this list, and you must catch those too:

- A navbar that shrinks, changes background, or gains a shadow after scrolling past a threshold
- Elements that animate into view when they enter the viewport (fade-up, slide-in, stagger delays)
- Sections that snap into place on scroll (`scroll-snap-type`)
- Parallax layers that move at different rates than the scroll
- Hover states that animate (not just change — the transition duration and easing matter)
- Dropdowns, modals, accordions with enter/exit animations
- Scroll-driven progress indicators or opacity transitions
- Auto-playing carousels or cycling content
- Dark-to-light (or any theme) transitions between page sections
- **Tabbed/pill content that cycles** — buttons that switch visible card sets with transitions
- **Scroll-driven tab/accordion switching** — sidebars where the active item auto-changes as content scrolls past (IntersectionObserver, NOT click handlers)
- **Smooth scroll libraries** (Lenis, Locomotive Scroll) — check for `.lenis` class or scroll container wrappers

### 6. Identify the Interaction Model Before Building

This is the single most expensive mistake in cloning: building a click-based UI when the original is scroll-driven, or vice versa. Before writing any builder prompt for an interactive section, you must definitively answer: **Is this section driven by clicks, scrolls, hovers, time, or some combination?**

How to determine this:

1. **Don't click first.** Scroll through the section slowly and observe if things change on their own as you scroll.
2. If they do, it's scroll-driven. Extract the mechanism: `IntersectionObserver`, `scroll-snap`, `position: sticky`, `animation-timeline`, or JS scroll listeners.
3. If nothing changes on scroll, THEN click/hover to test for click/hover-driven interactivity.
4. Document the interaction model explicitly in the component spec: "INTERACTION MODEL: scroll-driven with IntersectionObserver" or "INTERACTION MODEL: click-to-switch with opacity transition."

A section with a sticky sidebar and scrolling content panels is fundamentally different from a tabbed interface where clicking switches content. Getting this wrong means a complete rewrite, not a CSS tweak.

### 7. Extract Every State, Not Just the Default

Many components have multiple visual states — a tab bar shows different cards per tab, a header looks different at scroll position 0 vs 100, a card has hover effects. Inventory all relevant states, then capture those safely observable. Missing evidence remains unknown, never evidence of absence or permission to fabricate a state.

For tabbed/stateful content:

- Inspect each tab/button; exercise only authorized read-only reference actions via CDP
- Extract the content, images, and card data for EACH state
- Record which content belongs to which state
- Note the transition animation between states (opacity, slide, fade, etc.)

For scroll-dependent elements:

- Capture computed styles at scroll position 0 (initial state)
- Scroll past the trigger threshold and capture computed styles again (scrolled state)
- Diff the two to identify exactly which CSS properties change
- Record the transition CSS (duration, easing, properties)
- Record the exact trigger threshold (scroll position in px, or viewport intersection ratio)

### 8. Spec Files Are the Evidence Contract

Every component gets a specification file under that page's artifact root (`docs/research/<site-key>/<page-key>/components/`) BEFORE any builder is dispatched. This file is the contract between your extraction work and the builder agent. The builder receives the spec file contents inline in its prompt — the file also persists as an auditable artifact that the user (or you) can review if something looks wrong.

A specification is a derived interpretation, not authority over live evidence or user corrections. Primary-agent approval is required before implementing destructive structural conclusions. The spec file is not optional. It is not a nice-to-have. If you dispatch a builder without first writing a spec file, you are shipping incomplete instructions based on whatever you can remember from a CDP session, and the builder will guess to fill gaps.

### 9. Build Must Always Compile

Every builder must run applicable scoped checks and report exact coverage. After integration, run the affected scoped checks again when integration changes behavior. Full root typecheck remains CI-only; do not claim a full build passed when only scoped checks ran.

## Phase 1: Reconnaissance

Navigate to the target URL with CDP.

### Screenshots

- Take **full-page screenshots** at desktop (1440px) and mobile (390px) viewports
- Save to that page's screenshot root (`docs/design-references/<site-key>/<page-key>/`) with descriptive names
- These are your master reference — builders will receive section-specific crops/screenshots later

### Global Extraction

Extract these from the page before doing anything else:

**Fonts** — Inspect font loading and the computed font-family on actual text-bearing elements, including nested spans. Document every family, weight and style actually used. Integrate permitted fonts through Orvilo's existing font/theme infrastructure; do not replace root layout or download proprietary font files without authorization.

**Colors** — Extract the palette and its light/dark states from computed styles across the page. Map it into existing theme tokens and scoped component styles. Do not replace global CSS or introduce shadcn tokens. Shared token changes need whole-surface impact checks; no unrequested application-wide recoloring.

**Favicons & Meta** — Inspect reference metadata if relevant, but preserve Orvilo branding. SEO asset copying and root metadata replacement are not defaults for application UI parity.

**Global UI patterns** — Identify scrollbar, scroll-container, motion, overlay and backdrop behavior. Determine observable semantics without assuming a library from appearance. Implement through existing shared owners, keeping page-specific behavior scoped and preserving unrelated surfaces.

### Mandatory Interaction Sweep

This is a dedicated pass AFTER screenshots and BEFORE anything else. Its purpose is to discover every behavior on the page — many of which are invisible in a static screenshot.

**Scroll sweep:** Scroll the page slowly from top to bottom via CDP. At each section, pause and observe:

- Does the header change appearance? Record the scroll position where it triggers.
- Do elements animate into view? Record which ones and the animation type.
- Does a sidebar or tab indicator auto-switch as you scroll? Record the mechanism.
- Are there scroll-snap points? Record which containers.
- Is there a smooth scroll library active? Check for non-native scroll behavior.

**Click sweep:** Inventory every interactive element, classify its side effects, then exercise only authorized actions. On the live reference, do not click create/submit/delete or unknown actions merely to discover what they do:

- Every button, tab, pill, link and card must appear in the coverage inventory, including those unsafe to exercise
- Record what happens: does content change? Does a modal open? Does a dropdown appear?
- For tabs/pills: exercise EACH authorized read-only control and record the content that appears for each state

**Hover sweep:** Hover over every element that might have hover states:

- Buttons, cards, links, images, nav items
- Record what changes: color, scale, shadow, underline, opacity

**Responsive sweep:** Test at 3 viewport widths via CDP:

- Desktop: 1440px
- Tablet: 768px
- Mobile: 390px
- At each width, note which sections change layout (column → stack, sidebar disappears, etc.) and at approximately which breakpoint the change occurs.

Save all findings to `<artifact-root>/BEHAVIORS.md`. This is your behavior bible — reference it when writing every component spec.

### Page Topology

Map out every distinct section of the page from top to bottom. Give each a working name. Document:

- Their visual order
- Which are fixed/sticky overlays vs. flow content
- The overall page layout (scroll container, column structure, z-index layers)
- Dependencies between sections (e.g., a floating nav that overlays everything)
- **The interaction model** of each section (static, click-driven, scroll-driven, time-driven)

Save this as `<artifact-root>/PAGE_TOPOLOGY.md` — it becomes your assembly blueprint.

## Phase 2: Foundation Build

This is sequential per origin. Do it yourself (not delegated to an agent) since it touches shared files. Re-read the output plan and preserve every existing route before editing:

1. **Reuse fonts and shared layout behavior**; change existing owners only for measured gaps without deleting requirements of existing routes.
2. **Reuse theme tokens and component styles**; scope necessary page-specific changes and verify shared changes against affected surfaces.
3. **Reuse domain TypeScript interfaces**; extend their existing owners only when the observed behavior requires it.
4. **Inspect icons** — compare actual geometry and reuse existing Orvilo icon owners where equivalent. Add permitted page-specific icons under the owning feature, not a second site component tree.
5. **Reuse authorized assets**, downloading only missing permitted assets into the approved asset directory. Never overwrite another page's asset or copy private reference data.
6. Inspect affected route preservation and run repository-required scoped checks. Report their actual scope; do not claim every route builds without running that gate.

### Asset Discovery Script Pattern

Use CDP to enumerate all assets on the page:

```javascript
// Run this via CDP to discover all assets
JSON.stringify({
  images: [...document.querySelectorAll('img')].map((img) => ({
    src: img.src || img.currentSrc,
    alt: img.alt,
    width: img.naturalWidth,
    height: img.naturalHeight,
    // Include parent info to detect layered compositions
    parentClasses: img.parentElement?.className,
    siblings: img.parentElement ? [...img.parentElement.querySelectorAll('img')].length : 0,
    position: getComputedStyle(img).position,
    zIndex: getComputedStyle(img).zIndex,
  })),
  videos: [...document.querySelectorAll('video')].map((v) => ({
    src: v.src || v.querySelector('source')?.src,
    poster: v.poster,
    autoplay: v.autoplay,
    loop: v.loop,
    muted: v.muted,
  })),
  backgroundImages: [...document.querySelectorAll('*')]
    .filter((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      return bg && bg !== 'none';
    })
    .map((el) => ({
      url: getComputedStyle(el).backgroundImage,
      element: el.tagName + '.' + el.className?.split(' ')[0],
    })),
  svgCount: document.querySelectorAll('svg').length,
  fonts: [
    ...new Set(
      [...document.querySelectorAll('*')]
        .slice(0, 200)
        .map((el) => getComputedStyle(el).fontFamily),
    ),
  ],
  favicons: [...document.querySelectorAll('link[rel*="icon"]')].map((l) => ({
    href: l.href,
    sizes: l.sizes?.toString(),
  })),
});
```

Then use the uniquely named page download script to fetch only authorized reusable assets into the planned asset root. Use batched parallel downloads (4 at a time) with proper error handling.

## Phase 3: Component Specification & Dispatch

This is the core loop. For each section in your page topology (top to bottom), you do THREE things: **extract**, **write the spec file**, then **dispatch builders**.

### Step 1: Extract

For each section, use CDP to extract everything:

1. **Screenshot** the section in isolation (scroll to it, screenshot the viewport). Save to the page's screenshot root.

2. **Extract CSS** for every element in the section. Use the extraction script below — don't hand-measure individual properties. Run it once per component container and capture the full output:

```javascript
// Per-component extraction — run via CDP
// Replace SELECTOR with the actual CSS selector for the component
(function (selector) {
  const el = document.querySelector(selector);
  if (!el) return JSON.stringify({ error: 'Element not found: ' + selector });
  const props = [
    'fontSize',
    'fontWeight',
    'fontFamily',
    'lineHeight',
    'letterSpacing',
    'color',
    'textTransform',
    'textDecoration',
    'backgroundColor',
    'background',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'width',
    'height',
    'maxWidth',
    'minWidth',
    'maxHeight',
    'minHeight',
    'display',
    'flexDirection',
    'justifyContent',
    'alignItems',
    'gap',
    'gridTemplateColumns',
    'gridTemplateRows',
    'borderRadius',
    'border',
    'borderTop',
    'borderBottom',
    'borderLeft',
    'borderRight',
    'boxShadow',
    'overflow',
    'overflowX',
    'overflowY',
    'position',
    'top',
    'right',
    'bottom',
    'left',
    'zIndex',
    'opacity',
    'transform',
    'transition',
    'cursor',
    'objectFit',
    'objectPosition',
    'mixBlendMode',
    'filter',
    'backdropFilter',
    'whiteSpace',
    'textOverflow',
    'WebkitLineClamp',
  ];
  function extractStyles(element) {
    const cs = getComputedStyle(element);
    const styles = {};
    props.forEach((p) => {
      const v = cs[p];
      if (
        v &&
        v !== 'none' &&
        v !== 'normal' &&
        v !== 'auto' &&
        v !== '0px' &&
        v !== 'rgba(0, 0, 0, 0)'
      )
        styles[p] = v;
    });
    return styles;
  }
  function walk(element, depth) {
    if (depth > 4) return { truncated: true, reason: 'depth', childCount: element.children.length };
    const children = [...element.children];
    return {
      tag: element.tagName.toLowerCase(),
      classes: element.className?.toString().split(' ').slice(0, 5).join(' '),
      text:
        element.childNodes.length === 1 && element.childNodes[0].nodeType === 3
          ? element.textContent.trim().slice(0, 200)
          : null,
      styles: extractStyles(element),
      images:
        element.tagName === 'IMG'
          ? {
              src: element.src,
              alt: element.alt,
              naturalWidth: element.naturalWidth,
              naturalHeight: element.naturalHeight,
            }
          : null,
      childCount: children.length,
      omittedChildren: Math.max(0, children.length - 20),
      children: children
        .slice(0, 20)
        .map((c) => walk(c, depth + 1))
        .filter(Boolean),
    };
  }
  return JSON.stringify(walk(el, 0), null, 2);
})('SELECTOR');
```

3. **Extract multi-state styles** — for any element with multiple states (scroll-triggered, hover, active tab), capture BOTH states:

```javascript
// State A: capture styles at current state (e.g., scroll position 0)
// Then trigger the state change (scroll, click, hover via CDP)
// State B: re-run the extraction script on the same element
// The diff between A and B IS the behavior specification
```

Record the diff explicitly: "Property X changes from VALUE\_A to VALUE\_B, triggered by TRIGGER, with transition: TRANSITION\_CSS."

4. **Extract real content** — all text, alt attributes, aria labels, placeholder text. Use `element.textContent` for each text node. For tabbed/stateful content, **exercise authorized read-only tabs and extract content per state**.

5. **Identify assets** this section uses — which namespaced downloaded images/videos and which site/page icon components. Check for **layered images** (multiple `<img>` or background-images stacked in the same container).

6. **Assess complexity** — how many distinct sub-components does this section contain? A distinct sub-component is an element with its own unique styling, structure, and behavior (e.g., a card, a nav item, a search panel).

### Step 2: Write the Component Spec File

For each section (or sub-component, if you're breaking it up), create a spec file inside the page's component-spec directory. This is NOT optional — every builder must have a corresponding spec file.

**File path:** `docs/research/<site-key>/<page-key>/components/<component-name>.spec.md`

**Template:**

```markdown
# <ComponentName> Specification

## Overview

- **Target file:** existing owning feature/component path from the repository inventory
- **Screenshot:** `docs/design-references/<site-key>/<page-key>/<screenshot-name>.png`
- **Interaction model:** <static | click-driven | scroll-driven | time-driven>

## DOM Structure

<Describe the element hierarchy — what contains what>

## Computed Styles (exact values from getComputedStyle)

### Container

- display: ...
- padding: ...
- maxWidth: ...
- (every relevant property with exact values)

### <Child element 1>

- fontSize: ...
- color: ...
- (every relevant property)

### <Child element N>

...

## States & Behaviors

### <Behavior name, e.g., "Scroll-triggered floating mode">

- **Trigger:** <exact mechanism — scroll position 50px, IntersectionObserver rootMargin "-30% 0px", click on .tab-button, hover>
- **State A (before):** maxWidth: 100vw, boxShadow: none, borderRadius: 0
- **State B (after):** maxWidth: 1200px, boxShadow: 0 4px 20px rgba(0,0,0,0.1), borderRadius: 16px
- **Transition:** transition: all 0.3s ease
- **Implementation approach:** <CSS transition + scroll listener | IntersectionObserver | CSS animation-timeline | etc.>

### Hover states

- **<Element>:** <property>: <before> → <after>, transition: <value>

## Per-State Content (if applicable)

### State: "Featured"

- Title: "..."
- Subtitle: "..."
- Cards: [{ title, description, image, link }, ...]

### State: "Productivity"

- Title: "..."
- Cards: [...]

## Assets

- Background image: `public/sites/<site-key>/<page-key>/images/<file>.webp`
- Overlay image: `public/sites/<site-key>/<page-key>/images/<file>.png`
- Icons used: <ArrowIcon>, <SearchIcon> from the planned page or same-site shared icon module

## Text Content

<Product UI copy; private content replaced with labeled layout-equivalent samples in distributed specs>

## Responsive Behavior

- **Desktop (1440px):** <layout description>
- **Tablet (768px):** <what changes — e.g., "maintains 2-column, gap reduces to 16px">
- **Mobile (390px):** <what changes — e.g., "stacks to single column, images full-width">
- **Breakpoint:** layout switches at ~<N>px
```

Fill every section. If a section doesn't apply (e.g., no states for a static footer), write "N/A" — but think twice before marking States & Behaviors as N/A. Even a footer might have hover states on links.

### Step 3: Dispatch Builders

Based on complexity, dispatch builder agent(s) in worktree(s):

**Simple section** (1-2 sub-components): One builder agent gets the entire section.

**Complex section** (3+ distinct sub-components): Break it up. One agent per sub-component, plus one agent for the section wrapper that imports them. Sub-component builders go first since the wrapper depends on them.

**What every builder agent receives:**

- The full contents of its component spec file (inline in the prompt — don't say "go read the spec file")
- Path to the section screenshot in the page's namespaced screenshot root
- Which existing Orvilo components, theme tokens, domain services and route helpers to reuse (follow the repository React skill)
- The exact existing feature/component target path and shared-file ownership boundary
- Instruction to verify with the applicable scoped checks (full root typecheck remains CI-only) before finishing
- For responsive behavior: the specific breakpoint values and what changes

**Don't wait.** As soon as you've dispatched the builder(s) for one section, move to extracting the next section. Builders work in parallel in their worktrees while you continue extraction.

### Step 4: Merge

As builder agents complete their work:

- Independently review and verify each worktree change, then integrate into the active task branch; never write directly to protected trunk
- You have full context on what each agent built, so resolve any conflicts intelligently
- Reject or repair any merge that deletes or rewrites an unrelated existing route or another page's namespace
- After each merge, verify the build still passes: the repository-required scoped checks
- If a merge introduces type errors, fix them immediately

The extract → spec → dispatch → merge cycle continues until all sections are built.

## Phase 4: Page Assembly

After independently accepted sections are integrated, compose them through the existing Orvilo feature and shared SPA route owners from the approved output plan. Do not replace a Next.js root page or introduce parallel routing:

- Import all section components
- Implement the page-level layout from your topology doc (scroll containers, column structures, sticky positioning, z-index layering)
- Connect real content to component props
- Implement page-level behaviors: scroll snap, scroll-driven animations, dark-to-light transitions, intersection observers, smooth scroll (Lenis etc.)
- Confirm all routes that existed before this run are still present and were not unintentionally changed
- Verify: the repository-required scoped checks passes clean

## Phase 5: Visual QA Diff

After assembly, do NOT declare the clone complete. Take side-by-side comparison screenshots:

1. Open the original site and the clone at its planned local route side-by-side (or take screenshots at the same viewport widths)
2. Compare section by section, top to bottom, at desktop (1440px)
3. Compare again at mobile (390px)
4. For each discrepancy found:
   - Check the component spec file — was the value extracted correctly?
   - If the spec was wrong: re-extract from CDP, update the spec, fix the component
   - If the spec was right but the builder got it wrong: fix the component to match the spec
5. Test inventoried behaviors within the authorized action boundary; use local disposable fixtures for mutation journeys and do not blindly click every reference control
6. Verify smooth scroll feels right, header transitions work, tab switching works, animations play

Visual QA alone is not completion. Apply the structural, interaction, persistence, permission and evidence gates in references/orvilo-contract.md; unobserved states stay incomplete.

## Pre-Dispatch Checklist

Before dispatching ANY builder agent, verify you can check every box. If you can't, go back and extract more.

- [ ] Spec file written to `docs/research/<site-key>/<page-key>/components/<name>.spec.md` with ALL sections filled
- [ ] Every CSS value in the spec is from `getComputedStyle()`, not estimated
- [ ] Interaction model is identified and documented (static / click / scroll / time)
- [ ] Every relevant state is inventoried; the implementation's covered states have captured content/styles, and unobserved states remain explicit gaps rather than inferred absence
- [ ] For scroll-driven components: trigger threshold, before/after styles, and transition are recorded
- [ ] For hover states: before/after values and transition timing are recorded
- [ ] All images in the section are identified (including overlays and layered compositions)
- [ ] Responsive behavior is documented for at least desktop and mobile
- [ ] Product UI copy is recorded accurately; private content is kept local or replaced with explicitly labeled synthetic samples
- [ ] The builder prompt is under \~150 lines of spec; if over, the section needs to be split

## What NOT to Do

These are lessons from previous failed clones — each one cost hours of rework:

- **Don't build click-based tabs when the original is scroll-driven (or vice versa).** Determine the interaction model FIRST by scrolling before clicking. This is the #1 most expensive mistake — it requires a complete rewrite, not a CSS fix.
- **Don't extract only the default state.** If there are tabs showing "Featured" on load, click Productivity, Creative, Lifestyle and extract each one's cards/content. If the header changes on scroll, capture styles at position 0 AND position 100+.
- **Don't miss overlay/layered images.** A background watercolor + foreground UI mockup = 2 images. Check every container's DOM tree for multiple `<img>` elements and positioned overlays.
- **Don't build mockup components for content that's actually videos/animations.** Check if a section uses `<video>`, Lottie, or canvas before building elaborate HTML mockups of what the video shows.
- **Don't approximate CSS classes.** "It looks like `text-lg`" is wrong if the computed value is `18px` and `text-lg` is `18px/28px` but the actual line-height is `24px`. Extract exact values.
- **Don't build everything in one monolithic commit.** The whole point of this pipeline is incremental progress with verified builds at each step.
- **Don't treat a new target as permission to replace the current app.** Preserve existing routes and namespaced artifacts; ask before updating a route that already exists.
- **Don't omit evidence from builder prompts.** Include the relevant measured spec inline; builders must still read applicable repository skills and inspect existing code owners.
- **Don't skip asset extraction.** Without real images, videos, and fonts, the clone will always look fake regardless of how perfect the CSS is.
- **Don't give a builder agent too much scope.** If you're writing a builder prompt and it's getting long because the section is complex, that's a signal to break it into smaller tasks.
- **Don't bundle unrelated sections into one agent.** A CTA section and a footer are different components with different designs — don't hand them both to one agent and hope for the best.
- **Don't skip responsive extraction.** If you only inspect at desktop width, the clone will break at tablet and mobile. Test at 1440, 768, and 390 during extraction.
- **Don't forget smooth scroll libraries.** Check for Lenis (`.lenis` class), Locomotive Scroll, or similar. Default browser scrolling feels noticeably different and the user will spot it immediately.
- **Don't dispatch builders without a spec file.** The spec file forces exhaustive extraction and creates an auditable artifact. Skipping it means the builder gets whatever you can fit in a prompt from memory.

## Completion

When done, report:

- Source URL to destination-route mapping for every page built
- Existing routes preserved and any explicitly approved replacements
- Total sections built
- Total components created
- Total spec files written (should match components)
- Total assets downloaded (images, videos, SVGs, fonts)
- Build status (the repository-required scoped checks result)
- Visual QA results (any remaining discrepancies)
- Any known gaps or limitations
