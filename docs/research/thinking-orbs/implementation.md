# Libraries.dev chat effects experiment

User requested preserving the assistant-ui worktree and starting an independent
worktree from origin. This branch starts at origin/canary 02352b000. It does not
carry the assistant-ui migration. Source: <https://libraries.dev/> and individual
orbs.html, beam.html, bots.html documentation, inspected 2026-10-09.

## Output and scope

Existing conversation surfaces remain on their existing routes. Reuse actual npm
components, not approximated CSS animations. Evidence lives in this directory.
These libraries are effects, not a complete chat template. No full-page parity
claim, no authentication or backend changes. Preserve custom avatars and all input
behavior. Root owns dependency installation and status loaders; composer builder
owns input beam and assistant fallback avatar integrations. Independent Electron
reviewer owns runtime navigation and acceptance.

## Components and state contract

- thinking-orbs 0.3.2: actual ThinkingOrb, 20px inline beside existing localized
  status labels. reasoning=solving, search=searching, compression=weaving,
  generation=composing, retry=connecting, other active work=working. Remove on
  completed/error operations using existing operation selectors. Retain timing,
  retry error details and existing reasoning collapse. Library owns motion/theme
  detection and offscreen/hidden-tab pause; decorative canvas aria-hidden.
- border-beam 1.4.1: actual BorderBeam around conversation input card. Only show
  animated glow while the existing conversation busy state is true. Keep editor
  mounted, shape, menu anchors, input widths and stop/queue/draft behavior. Use
  upstream colorful preset, strength 0.7 from usage documentation; app theme.
  Respect reduced motion, no pointer interception. Confirm package API locally.
- bot-avatars 0.2.2: actual BotAvatar default clover/fabric visual, existing avatar
  dimensions; only default assistant identity, never user/custom identity.
  Working while that assistant is busy, default otherwise. Keep accessible name
  and existing avatar action. Built-in reduced motion and offscreen pause.

## Reference observations and limits

Public docs specify plain Canvas for Orbs and BotAvatar and independent React
packages. BotAvatar has 18 shapes and default/working/sleeping states; Beam wraps
existing elements. Exact package declarations take precedence over website
snippets. No new global palette or theme toggle. Source-provided colors/effects
are scoped visual exceptions for this user-requested experiment.

Other catalog items considered but not included: voice-glow (audio reactive),
metal-fx (WebGL2 buttons), liquid-gooey (merging controls), img-fx (image loader,
not image inference). They need feature-specific integration, not blanket swaps.

## Acceptance inventory

Actual Electron: light/dark, busy/idle/error transitions, narrow window, draft
survival, click/focus/stop controls, reduced motion, custom/user avatar preserved.
Synthetic operation fixtures must be labelled separately from real model sends.
Full gateway inference remains a separate unverified outcome; screenshots cannot
prove it. Source CDP visual comparison and package motion captures pending.

## Implementation checks

- Scoped `bun run check --lint --test` on all 11 changed/new source files and
  `operationActivity.test.ts`: lint clean, 6 tests passed.
- Independent light review found the added wrapper interrupted fullscreen height
  inheritance. Fixed with fullscreen flex growth, definite height and min-height.
- Border Beam's rotating preset delegates reduced motion to its consumer. Keep
  root transition completion events via a single 0.01ms animation iteration;
  disable only decorative layer animations. Disabling all animations would leave
  the package's fade-out lifecycle waiting forever for animationend.
- One independent follow-up review verified both source fixes and found no further
  confirmed defects. Electron product acceptance is recorded separately.
- Electron inspection subsequently found the existing avatar adapter clipped the
  library's 1.5x overscan canvas during jumps. The default bot alone now permits
  visible overflow; custom/user avatars keep their original clipping and styles.
  The changed avatar file passed scoped lint; final captures use this correction.
