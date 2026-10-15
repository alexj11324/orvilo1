export const styles = {
  actionBtn: 'hover:border-border hover:bg-accent hover:text-foreground',
  actionBtnPrimary: 'w-auto px-3',
  expandLink: 'border border-muted text-sm leading-5.5 text-muted-foreground',
  card: 'hover:border-border [@media(hover:hover)_and_(pointer:fine)]:[&_.brief-comment-btn]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:[&_.brief-view-run-btn]:opacity-0 hover:[&_.brief-comment-btn]:opacity-100 hover:[&_.brief-view-run-btn]:opacity-100 focus-within:[&_.brief-comment-btn]:opacity-100 focus-within:[&_.brief-view-run-btn]:opacity-100',
  resolvedTag: 'text-xs leading-5 text-foreground-quaternary',
  clickableHeader: 'cursor-pointer',
} as const;
