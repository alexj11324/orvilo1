/**
 * The Issue rail's value control: a 28px ghost Button that fills the property
 * row, so the whole value cell is the hit area. The `-ms-1.5` / `+0.375rem`
 * pair pulls the hover wash 6px past the rail's left edge while the glyph
 * keeps the rail's alignment (the same inset the due-date button uses).
 *
 * Same look as the project property pill (`PROPERTY_CONTROL_CLASS` on
 * `origin/fix/project-date-property`, `src/features/Projects/Workspace/propertyControl.ts`):
 * `bg-accent` hover wash, `focus-visible` wash, open-state wash. That file is
 * not on canary yet; dedupe the two once it lands. Type stays the rail's 13px
 * regular, not the pill's `text-sm font-medium`.
 */
export const RAIL_CONTROL_CLASS =
  'h-7 w-[calc(100%+0.375rem)] max-w-none min-w-0 -ms-1.5 justify-start gap-1.5 overflow-hidden rounded-(--radius-input) border-0 bg-transparent px-1.5 text-[13px] font-normal shadow-none hover:bg-accent focus-visible:bg-accent data-popup-open:bg-accent'; // linear-token-override: retain DESIGN.md's 13px railText role and compensate the existing 6px propertyButton inset.

/** Placeholder text and its glyph; `--muted-foreground` is 5.74:1 on white (#666). */
export const RAIL_PLACEHOLDER_CLASS = 'text-muted-foreground';
