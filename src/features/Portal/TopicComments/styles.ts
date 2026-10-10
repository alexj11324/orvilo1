export const styles = {
  anchor:
    'cursor-pointer py-2 px-2.5 border-s-2 border-border rounded-[0_var(--ant-border-radius)_var(--ant-border-radius)_0] text-muted-foreground bg-(--ant-color-fill-quaternary) hover:text-foreground hover:bg-accent aria-disabled:cursor-default aria-disabled:hover:text-muted-foreground aria-disabled:hover:bg-(--ant-color-fill-quaternary)',
  body: 'overflow-hidden flex-1 min-h-0',
  card: 'relative py-3.5 [border-block-end:1px_solid_var(--sidebar-border)] [&:hover_.topic-comment-actions]:opacity-100',
  cardActions:
    'absolute [inset-block-start:8px] end-0 opacity-100 transition-opacity duration-(--ant-motion-duration-fast) ease-[ease] [@media(hover:hover)]:opacity-0',
  composer: 'shrink-0 [margin-block:12px_16px] mx-4',
  deleted: 'italic text-(--ant-color-text-tertiary)',
  editEditor:
    'py-2 px-2.5 border border-border rounded-(--ant-border-radius) bg-card focus-within:border-primary',
  edited: 'text-(--ant-color-text-tertiary)',
  empty: 'flex-1 min-h-60',
  list: 'overflow-y-auto overscroll-contain flex-1 min-h-0 px-4',
  moderatedContent: 'opacity-[0.62]',
  reply: 'ms-5 ps-3 border-s border-sidebar-border',
};
