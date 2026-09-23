# Inbox master-detail specification

## Overview

- Target file: `src/features/WorkInbox/WorkInboxPage.tsx`
- Interaction model: click and keyboard selection; independent pane scrolling
- Reference viewport: 1440x900, light theme, populated Priority Inbox
- Candidate viewport: 1440x900, light theme, empty local fixture

## DOM structure

- Page header remains outside the split frame.
- Split frame contains one list scroll owner and, on desktop, one persistent detail scroll owner.
- List content is a full-height flex column containing the segment/actions header and one body state.
- Each populated row is a semantic button that writes the selected notification id to Inbox URL state.
- The desktop detail body is either the unselected placeholder or the selected card detail.

## Computed reference geometry

### Desktop split

- Shared navigation width: `244px`
- Main panel top: `8px`
- List width: `400px`
- Split divider: `0.5px` reference hairline; candidate uses the semantic border token
- Detail width: remaining surface width
- Main overflow: hidden
- List/detail overflow: independent vertical scrolling

### Row

- Row cadence: about `55px`
- Avatar/type glyph: about `28px`
- Title: `13px`, medium weight, single-line ellipsis
- Metadata: `12px`, regular weight, single-line ellipsis
- Time: `12px`, fixed trailing column
- Unread state: dot plus text, never color alone
- Hover: subtle fill
- Active: stronger subtle fill

### Placeholder

- Horizontally and vertically centered in the detail pane
- Inbox illustration above one line of unread-count text
- Default Priority uses the product's authoritative unread/pending badge count, which excludes archived and snoozed rows and includes read-but-pending actions
- Default Other uses `unreadOtherCount`; filtered views label the number of loaded rows instead of presenting it as a complete total
- No hard-coded fixture count

## States and behaviors

### No selection, desktop

- Trigger: Inbox route with no `item` query parameter
- Before this slice: list expands to full width; detail absent
- Required: list remains 400px; detail placeholder is visible

### Selected row, desktop

- Trigger: click a populated row or select through the existing keyboard handler
- Result: `item=<notificationId>` is written to the Inbox URL, row is active, detail renders, list remains visible
- Read receipt continuity: if the selected unread mention no longer belongs to Priority after it is marked read, keep that active row at its prior index while the selection is open
- Transition: existing fast background transition on the row

### Narrow surface

- Trigger: existing mobile breakpoint
- Result: list fills available width before selection; selected detail uses the existing overlay and back action

## Content and domain constraints

- Titles, actor snapshots, content, times, actions and navigation come from `NotificationFeedCard`.
- Unread count comes from `NotificationFeedSummary.unreadBadgeCount`.
- The priority-inbox banner IS implemented (2026-09-23, commit e8d43bf5f): title + `Keep priority inbox ▾` + `Disable`, persisted per user:workspace in `SystemStatus.inboxPriorityMode`. Issue/review detail schema remains uncopied — Orvilo does not model those as notification types.

## Accessibility

- Rows use native buttons with visible `:focus-visible` treatment.
- Selection is also available through the existing list keyboard handler.
- Placeholder detail pane has an accessible label even before selection.

## Responsive behavior

- Desktop: fixed 400px list plus detail.
- Tablet 768px: list-first single column.
- Mobile 390px: list-first single column; detail overlay after selection.

## Verification boundary

Synthetic local cards may validate row layout and selection. Production data, ACL, projection, live updates and mutation persistence remain separate verification gates.
