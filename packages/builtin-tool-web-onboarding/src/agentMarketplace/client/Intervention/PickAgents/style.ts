export const styles = {
  card: 'flex cursor-pointer flex-col gap-2.5 p-4 border border-solid [border-image:none] rounded-(--radius-card) transition-[border-color,background-color] duration-(--orvilo-motion-mid) motion-reduce:transition-none aria-disabled:cursor-default aria-disabled:opacity-50 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
  cardHeader: 'flex items-center gap-2.5 min-w-0',
  cardDescription: 'line-clamp-4 text-sm leading-5.5 text-muted-foreground',
  cardTitle: 'flex-1 min-w-0 truncate text-sm leading-5.5 font-semibold text-foreground',
  container: 'grid grid-rows-[auto_minmax(0,1fr)] flex-1 gap-3 min-h-0',
  content: 'overflow-y-auto overscroll-contain min-w-0 min-h-0 pie-1',
  categoryItem:
    'flex-none h-8 px-3 py-0 border-none rounded-(--radius-button) text-sm leading-5.5 font-normal text-muted-foreground whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-(--orvilo-motion-mid) motion-reduce:transition-none pointer-coarse:min-bs-11 hover:text-foreground data-active:font-medium data-active:bg-selected data-active:text-foreground data-active:shadow-none group-data-[variant=default]/tabs-list:data-active:shadow-none focus-visible:ring-inset data-active:hover:bg-selected dark:data-active:bg-selected dark:data-active:border-transparent dark:data-active:text-foreground',
  empty:
    'flex flex-1 items-center justify-center min-h-40 p-6 text-sm leading-5.5 text-foreground-tertiary',
  footer: 'flex flex-none items-center justify-between',
  grid: 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 content-start',
  header: 'flex flex-none flex-col gap-2',
  root: 'absolute z-10 -inset-be-0.5 -inset-x-0.5 overflow-hidden h-[min(640px,72vh)] min-h-120 p-4 border border-divider rounded-(--radius-overlay) bg-popover shadow-(--shadow-popover)',
  tabBar:
    'flex flex-none flex-nowrap w-full gap-1.5 overflow-x-auto overflow-y-hidden overscroll-contain -mx-3 p-0 px-3 pbe-2 border-be border-divider bg-transparent rounded-none group-data-horizontal/tabs:h-auto',
  skeletonAvatar:
    'flex-none size-9 rounded-(--radius-button) bg-muted animate-pulse [animation-duration:1.5s] [animation-timing-function:ease-in-out] motion-reduce:animate-none',
  skeletonCard: 'flex flex-col gap-2.5 p-4 border border-divider rounded-(--radius-card) bg-card',
  skeletonLine:
    'h-2.5 rounded-(--radius-chip) bg-muted animate-pulse [animation-duration:1.5s] [animation-timing-function:ease-in-out] motion-reduce:animate-none',
  skeletonTabBarItem:
    'flex-none w-22 h-8 rounded-(--radius-button) bg-muted animate-pulse [animation-duration:1.5s] [animation-timing-function:ease-in-out] motion-reduce:animate-none',
  skipLink:
    'gap-1 font-normal text-muted-foreground hover:text-foreground duration-(--orvilo-motion-mid) motion-reduce:transition-none pointer-coarse:min-bs-11',
};
