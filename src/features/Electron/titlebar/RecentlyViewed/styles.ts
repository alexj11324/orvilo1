export const useStyles = {
  actionIcon:
    'shrink-0 text-foreground-tertiary opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-out) focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100',
  container: 'overflow-y-auto w-65 max-h-80 p-1',
  divider: 'h-px my-1 bg-divider',
  empty: 'py-4 px-3 text-sm leading-5.5 text-foreground-tertiary text-center',
  icon: 'shrink-0 text-muted-foreground',
  item: 'cursor-default overflow-hidden shrink-0 min-h-8 py-0 px-2 rounded-(--radius-button) transition-[background-color] duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) hover:bg-accent hover:[&_.actionIcon]:text-foreground hover:[&_.actionIcon]:opacity-100 focus-within:[&_.actionIcon]:text-foreground focus-within:[&_.actionIcon]:opacity-100 motion-reduce:transition-none',
  itemActive: 'bg-selected hover:bg-selected',
  itemHovered: 'bg-accent',
  itemTitle: 'truncate flex-1 text-sm leading-5.5 text-foreground',
  title: 'py-1 px-2 text-xs leading-5 font-medium text-foreground-tertiary capitalize',
};
