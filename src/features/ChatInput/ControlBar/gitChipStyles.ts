/**
 * Chips shared by the live git status and by the snapshot that stands in for it
 * once the recorded directory is gone. Both render into the same composer bar,
 * so the separator and the PR chip must be pixel-identical — and `staleTrigger`,
 * the deliberately muted variant of `trigger`, lives next to the live one so the
 * two can't drift apart.
 */
export const gitChipStyles = {
  prTrigger:
    'cursor-pointer flex flex-none gap-1 items-center py-0.5 px-1 rounded-(--radius-chip) text-[12px] text-muted-foreground whitespace-nowrap [transition:background_0.2s] hover:text-foreground hover:bg-accent hover:bg-none',
  separator: 'flex-none w-[1px] h-2.5 bg-[var(--ant-color-split)] bg-none',
  staleTrigger:
    'cursor-pointer flex flex-none gap-1 items-center max-w-50 py-0.5 px-1 rounded-(--radius-chip) text-[12px] text-[var(--ant-color-text-quaternary)] whitespace-nowrap [transition:background_0.2s] hover:bg-accent hover:bg-none',
  trigger:
    'cursor-pointer flex flex-none gap-1 items-center py-0.5 px-1 rounded-(--radius-chip) text-[12px] text-muted-foreground whitespace-nowrap [transition:background_0.2s] hover:bg-accent hover:bg-none',
};
