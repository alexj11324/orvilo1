# Absolute date format

Every user-visible absolute date is numeric and language independent: `YYYY/MM/DD`, with time `YYYY/MM/DD HH:mm` (`HH:mm:ss` only for log-style rows). Never render month names or `M月D日`. Relative times ("3 天前") are unchanged.

## One helper

`packages/utils/src/time.ts` (import `@orvilo/utils/time`) owns the format:

- `ABSOLUTE_DATE_FORMAT` / `ABSOLUTE_DATE_TIME_FORMAT`
- `formatAbsoluteDate(value)` and `formatAbsoluteDateTime(value)`, returning `''` for missing or invalid input.

`formatActivityTime` and `formatTaskItemDate` default to the same format, and the `common` keys `time.formatThisYear` / `time.formatOtherYear` and `chat` key `taskSchedule.nextRun.format` are now numeric, so every `useActivityTime`, `PublishedTime` and Issue row consumer follows. `formatProjectDay` (`src/features/Projects/projectPlanningDate.ts`) is the Projects alias of `ABSOLUTE_DATE_FORMAT`.

Other locales still carry the old month-name strings for the three keys above until the daily i18n workflow regenerates them; they fall back to the numeric default once those keys are retranslated.

## Deliberately unchanged

- Values sent to APIs, storage keys and file names (`YYYY-MM-DD` day keys, `dueDate`, export file names).
- Month-only labels (`MMMM`, `MMMM YYYY` group headers, calendar month dropdowns) and weekday/time-only labels.
- Text fed to models or the CLI (`packages/mecha`, `packages/context-engine`, `parserPlaceholder`, `agent-tracing`).
- Editable date text inputs that must round-trip through a parser (API key expiry `EditableCell`, `issueMenuDates`).
- The compact `M/D` range label in the quota calendar cell.

## Inbox custom snooze

The row menu opens the custom snooze dialog from `onOpenChangeComplete` of the menu (after it has fully closed) instead of inside the item click, so the menu teardown cannot race the dialog mount.

## How to verify

1. Issue list, My Issues and a project Issue tab: row dates read `2026/09/26`.
2. Settings > General: workspace created date reads `2026/09/22`.
3. Inbox row clock menu > Custom (mouse and keyboard) opens the snooze dialog.
4. Unit tests: `bun run check packages/utils/src/time.ts src/features/AgentTasks/features/formatTaskItemDate.ts`.
