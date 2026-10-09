# Project date property

The project `Dates` property (start date → target date) is a normal property control, like Status, Priority and Lead.

## What changed

- Both date controls are content-sized 28px ghost pills that use `PROPERTY_CONTROL_CLASS` (`src/features/Projects/Workspace/propertyControl.ts`), the single class string shared by every project property control, so radius, type, padding, hover wash (`hover:bg-accent`) and focus ring are identical to the siblings. The team chip uses `PROPERTY_LINK_CLASS` (same pill, as a link to the team page).
- `DatePicker` (`src/components/DatePicker`) gained `variant="ghost"` (renders a bare ghost `Button` that takes its look from `className`) and `tooltip`. Do not restyle the trigger with an unlayered antd-style class that sets `background`: it beats the Tailwind hover utility.
- The row has no clear button. The popover has a title, a `YYYY/MM/DD` input (selected on open, with an inside clear button; Enter saves, invalid input stays open with `aria-invalid`), the precision tabs, and the calendar.
- The calendar follows the app language (`calendarLocale.ts`, react-day-picker locales) and starts on Monday. This applies to every `DatePicker` call site.

## Date format rule

Under `src/features/Projects/**` dates are numeric and language independent: day `YYYY/MM/DD`, month `YYYY/MM`, quarter `YYYY Q3`, half-year `YYYY H2`, year `YYYY`. Use `formatProjectDay` / `formatProjectDate` from `projectPlanningDate.ts`; never `MMM D`.

## How to verify

1. Open a project in the Electron app, hover each control in the side panel and the overview row: same wash as Status.
2. At the side-panel width (about 257px) set both dates: one line, arrow visible, nothing clipped.
3. Open the popover in a zh-CN UI: localized month caption and weekdays, Monday first; type `2026/9/21` + Enter saves, `2026/13/01` keeps it open as invalid, the inside clear removes the date.
4. Unit tests: `bun run check src/features/Projects/projectPlanningDate.test.ts`.
