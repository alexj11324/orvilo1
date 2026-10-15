export const styles = {
  bar: 'h-1 rounded-full bg-selected',
  barFill: 'h-full rounded-full bg-info',
  caption: 'py-1.5 px-3 text-xs leading-5 text-foreground-quaternary',
  cell: 'flex flex-col gap-0.5',
  error: 'text-destructive-text',
  key: 'text-xs leading-5 text-foreground-quaternary',
  legend:
    'shrink-0 pbs-2 pbe-3 px-3 border-bs border-divider text-xs leading-5 text-foreground-quaternary',
  mono: 'font-mono text-xs leading-5 tabular-nums text-muted-foreground',
  muted: 'text-foreground-tertiary',
  popover: 'w-[min(640px,calc(100vw-32px))] max-h-[min(70vh,720px)]',
  overview: 'grid grid-cols-4 shrink-0 gap-y-2 gap-x-3 py-2.5 px-3 border-be border-divider',
  row: 'grid grid-cols-[1fr_96px_120px] gap-2 items-center py-1 px-3 border-be border-divider',
  rowClickable: 'cursor-pointer min-h-8 hover:bg-fill-quaternary',
  scroll: 'overflow-auto flex-1 min-h-0 max-h-90',
  sectionTitle:
    'flex gap-2 items-center py-2 px-3 border-be border-divider text-sm leading-5.5 font-semibold text-foreground',
  value: 'font-mono text-xs leading-5 tabular-nums text-foreground whitespace-nowrap',
};
