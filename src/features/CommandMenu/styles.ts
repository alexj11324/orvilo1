import presentation from './CommandMenu.module.css';

export const styles = {
  backTag: 'text-sm leading-5.5',
  chatContainer: 'flex flex-col gap-3 p-4',
  chatMessage: 'flex flex-col gap-1 p-3 rounded-(--radius-card) bg-card',
  chatMessageContent: 'text-sm leading-5.5 text-foreground',
  chatMessageRole: 'text-xs leading-5 font-medium text-muted-foreground uppercase',
  commandContainer: 'flex flex-col',
  commandFooter:
    'flex flex-wrap items-center justify-center gap-4 py-3 px-4 border-bs border-divider',
  commandRoot: presentation.commandRoot,
  contextTag: 'text-xs leading-5',
  contextWrapper: 'flex flex-wrap items-center gap-2 py-2 px-4',
  icon: 'size-4 shrink-0 text-muted-foreground',
  inputWrapper: 'flex min-w-0 items-center gap-2 py-3 px-4 border-bs border-divider',
  itemActionsButton: presentation.itemActionsButton,
  itemActionsKey: presentation.itemActionsKey,
  itemContent: 'flex flex-1 min-w-0 items-center gap-3',
  itemDescription:
    'overflow-hidden mbs-0.5 text-xs leading-5 text-foreground-tertiary text-ellipsis whitespace-nowrap',
  itemDetails: 'flex-1 min-w-0',
  itemIcon: presentation.itemIcon,
  itemLabel: 'text-sm leading-5.5 font-medium',
  itemTitle: 'overflow-hidden text-sm leading-5.5 font-medium text-ellipsis whitespace-nowrap',
  itemType: 'shrink-0 text-xs leading-5 text-foreground-tertiary capitalize',
  kbd: 'flex items-center gap-1 text-xs leading-5 text-foreground-tertiary',
  kbdIcon: 'size-4 text-foreground-tertiary',
  overlay: presentation.overlay,
  skeleton: presentation.skeleton,
  skeletonItem: 'flex items-center gap-3 py-3 px-4',
};
