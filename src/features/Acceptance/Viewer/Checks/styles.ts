export const styles = {
  // Superseded evidence stays subordinate to the current checklist.
  staleRegions: 'mt-1 border-s-2 border-sidebar-border py-2.5 ps-3 opacity-75 hover:opacity-100',
  chip: 'rounded-[4px] bg-accent px-1.5 text-[11px] leading-[18px] whitespace-nowrap text-(--ant-color-text-tertiary)',
  chipClickable: 'cursor-pointer hover:bg-selected hover:text-foreground',
  emptyCard: 'rounded-(--ant-border-radius-lg) border border-sidebar-border bg-card px-4 py-12',
  celebrateIcon: 'animate-[acceptance-celebrate-pop_0.45s_cubic-bezier(0.34,1.56,0.64,1)_both]',
  groupCard: 'bg-card',
  groupHeader:
    'cursor-pointer bg-(--ant-color-fill-quaternary) px-4 py-2.5 [&_.acceptance-group-actions]:opacity-0 [&_.acceptance-group-actions]:transition-opacity [&_.acceptance-group-actions]:duration-200 [&_.acceptance-group-actions]:ease-[ease] hover:[&_.acceptance-group-actions]:opacity-100',
  historyToggle:
    'inline-flex w-fit cursor-pointer items-center gap-1 text-[12px] text-(--ant-color-text-tertiary) hover:text-foreground',
  // Group headers remain the first child, so grouped rows retain their top border.
  row: 'border-t border-sidebar-border first:border-t-0',
  seqChip: 'flex-none font-mono text-[11px] leading-[22px] tracking-[0.02em] text-muted-foreground',
  seqChipClickable: 'cursor-copy hover:text-foreground',
  rowActions: 'opacity-0 transition-opacity duration-200 ease-[ease]',
  rowChevron: '[@media(width<=767px)]:[grid-area:1/4]',
  rowMeta:
    'transition-opacity duration-200 ease-[ease] [@media(width<=767px)]:min-w-0 [@media(width<=767px)]:flex-wrap [@media(width<=767px)]:justify-end [@media(width<=767px)]:[grid-area:1/3] [@media(width<=767px)]:empty:hidden [@media(hover:hover)_and_(pointer:fine)]:pointer-events-none [@media(hover:hover)_and_(pointer:fine)]:opacity-0',
  rowTitle: '[@media(width<=767px)]:[grid-area:2/1/auto/-1]',
  rowHeader:
    'cursor-pointer px-4 py-3 hover:[&_.acceptance-row-actions]:opacity-100 focus-within:[&_.acceptance-row-actions]:opacity-100 hover:[&_.acceptance-row-meta]:pointer-events-auto hover:[&_.acceptance-row-meta]:opacity-100 focus-within:[&_.acceptance-row-meta]:pointer-events-auto focus-within:[&_.acceptance-row-meta]:opacity-100 [&:not([data-expanded]):hover]:bg-(--ant-color-fill-quaternary) [@media(width<=767px)]:grid [@media(width<=767px)]:grid-cols-[16px_max-content_minmax(0,1fr)_14px] [@media(width<=767px)]:gap-y-1 [@media(width<=767px)]:px-0 [@media(width<=767px)]:py-2',
  stepDot:
    'mt-[5px] size-[9px] flex-none rounded-full border-2 border-solid border-current bg-card',
  stepRail: 'mt-1.5 w-px flex-1 bg-sidebar-border',
  titleEllipsis: 'truncate',
};
