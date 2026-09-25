# Inbox Agent new-chat specification

## Overview

- Target: existing inbox Agent conversation route, candidate
  `/ws-useragenttes/agent/inbox`.
- Intended owning boundary:
  `src/routes/(main)/agent/features/Conversation/ConversationArea.tsx` plus one Agent-specific
  presentational component if needed.
- Interaction model: click-driven composer using the existing Agent topic/message actions.
- Fidelity exception: preserve Orvilo branding and existing product capabilities.

## Observable success

When the inbox Agent has no active topic, the route shows a calm centered new-chat surface: faint
Orvilo brand art behind the existing composer, no large Agent identity/welcome card, and responsive
side padding matching the reference proportions. Sending still uses the current real topic creation
and message persistence flow. Once a topic becomes active, the existing populated conversation
surface renders unchanged.

## Invariants

- The change applies only to the built-in inbox Agent with no active topic.
- Non-inbox agents and populated inbox topics retain the current conversation renderer.
- The current `ChatInput`, `ConversationProvider`, permission checks, upload behavior, message URL
  dispatch, draft receiver, hydration, and topic persistence remain mounted through their existing
  owners.
- Use semantic Orvilo theme tokens and an existing Orvilo brand component. Do not copy Linear's
  logo or proprietary assets.

## Structure

1. A flex container fills the conversation route body.
2. A decorative brand mark sits centered behind the composer, 336 px square on desktop/tablet and
   capped to available mobile width. It is ignored by assistive technology and cannot intercept
   pointer input.
3. The existing main chat input sits above it in a width-capped wrapper.
4. Auxiliary Agent conversation drivers remain mounted outside the visual layer.

## Computed-style target

- Root: `position: relative`, `overflow: hidden`, full available width/height.
- Brand mark: 336x336; `position: absolute`; centered horizontally; low opacity; no pointer events.
- Composer wrapper: `width: min(712px, calc(100% - 48px))`, centered, above the mark.
- Vertical placement: center group near the reference's y=395 composer top at a 900 px viewport;
  remain usable in shorter windows instead of using a fixed pixel offset.
- Do not override the ChatInput's own editor, menus, attachment, send, focus, or disabled styles.

## Responsive behavior

- Desktop/tablet: 712 px composer cap; 24-28 px side margin at constrained widths.
- Mobile: minimum 24 px side margin, brand mark capped to the available width.
- No horizontal scroll at 390 px.

## Failure conditions

- The old 64 px inbox avatar, `Orvilo AI` heading, or long welcome copy still occupies the landing
  surface.
- The centered treatment appears on an existing conversation or on a user-created Agent.
- Sending no longer creates/selects a real topic through the current store/service path.
- The page loses upload, URL-message, draft, hydration, or permission behavior.

## Verification

- Focused component test for inbox/no-topic vs populated/non-inbox branching.
- `bun run check --lint --test` scoped to changed Agent files.
- Real Electron replay at `/ws-useragenttes/agent/inbox`, including existing-chat selection and
  returning to new chat, captured after the shared candidate target is released.
