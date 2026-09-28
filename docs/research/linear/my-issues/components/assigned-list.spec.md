# Assigned list component specification

## User task

When a person opens My issues, they need to scan work that is assigned to them, understand why it needs attention, and retain parent-child context without opening each issue.

## Evidence-backed contract

- The initial reference route is Assigned.
- The server-derived ordering is attention first: urgent, blocking, then ordinary statuses.
- Attention headers are collapsible, display a count, and use 13px labels.
- Rows span the full collection width and repeat every 44px.
- A child row is indented and connected to its parent. The relationship comes from `parentTaskId`; visual nesting must not be inferred from title text.
- The row reuses the product's task identity, status, priority, assignee, project and date semantics. A local fixture may omit some metadata, but the component must not invent it.
- Fetch failure wins over empty. A zero-row successful result may show the existing empty state.

## Synthetic verification state

The local fixture adds six projectless tasks assigned to the synthetic test user:

- two urgent tasks in a parent-child chain;
- two blocking tasks in a parent-child chain, each backed by a real open downstream `blocks` edge;
- one ordinary backlog task;
- one completed task.

The projectless choice prevents this page fixture from changing the separately verified Project Overview milestone totals or adding a second project to the Projects page.

## Layout

- Collection body padding: 0 inline for My issues lists.
- Row minimum height: 44px.
- Attention group header: transparent by default, full width, 16px inline padding, 13px label/count.
- Attention group header omits the extra status glyph; it keeps the collapse chevron, label and count.
- Child indentation uses the existing `TaskRowIndent` primitive and its 20px step/connector.

## Known gaps after this slice

- The candidate toolbar still differs from the reference icon menus.
- Display-option defaults are not yet persisted per tab.
- The candidate row still inherits metadata and typography from `AgentTaskItem`; exact property visibility remains to be paired field by field.
- Open-details selected-issue behavior remains unmeasured.
- Board visual parity and drag outcomes remain separate acceptance work.
