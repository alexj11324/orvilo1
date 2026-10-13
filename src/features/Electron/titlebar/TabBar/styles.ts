import nativeStyles from './styles.module.css';

export const useStyles = {
  closeIcon: nativeStyles.closeIcon,
  runningDot: nativeStyles.runningDot,
  strip: nativeStyles.strip,
  tab: nativeStyles.tab,
  pinnedDivider: nativeStyles.pinnedDivider,
  tabPinned: nativeStyles.tabPinned,
  tabSplitVisible: nativeStyles.tabSplitVisible,
  tabDragging: nativeStyles.tabDragging,
  tabActive: nativeStyles.tabActive,
  tabTitle: nativeStyles.tabTitle,
  avatarWrapper: 'relative flex flex-none items-center justify-center size-4 leading-0',
  unreadDot:
    'absolute -inset-be-0.5 -end-0.5 size-2 border-[length:calc(var(--spacing)_*_3_/_8)] border-background rounded-full bg-info',
  container: `${nativeStyles.container} flex-1 min-w-0`,
  overflowButton:
    'cursor-default shrink-0 justify-center h-8 rounded-(--radius-button) text-xs leading-5 text-muted-foreground hover:text-foreground hover:bg-accent',
  previewCard: 'flex flex-col gap-1.5 w-60',
  previewImage:
    'block aspect-[16/10] w-full border border-divider rounded-(--radius-card) object-cover object-top',
  previewTitle: 'truncate text-xs leading-5',
  tabIcon: 'shrink-0 text-muted-foreground',
  newTabButton:
    'inline-flex shrink-0 items-center justify-center rounded-(--radius-button) text-muted-foreground transition-[color,background-color] duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-in-out) hover:text-foreground hover:bg-accent motion-reduce:transition-none',
};
