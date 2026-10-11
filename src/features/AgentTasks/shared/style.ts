export const styles = {
  titleText:
    'm-0 text-xl leading-7 font-semibold text-foreground wrap-anywhere whitespace-pre-wrap',
  titleInput:
    'resize-none min-h-0 p-0 border-0 rounded-none text-xl md:text-xl leading-7 font-semibold bg-transparent dark:bg-transparent shadow-none focus:border-0 focus:outline-none focus:shadow-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none disabled:cursor-text disabled:opacity-100 disabled:bg-transparent dark:disabled:bg-transparent',
  breadcrumb:
    'overflow-hidden min-w-0 [&_ol]:flex-nowrap [&_ol]:items-center [&_ol]:min-w-0 [&_ol]:m-0 [&_li]:overflow-hidden [&_li]:flex [&_li]:shrink [&_li]:items-center [&_li]:min-w-0 [&_li.ant-breadcrumb-separator]:overflow-visible [&_li.ant-breadcrumb-separator]:shrink-0 [&_li.ant-breadcrumb-separator]:min-w-auto [&_li.ant-breadcrumb-separator]:mx-0.5 [&_li[data-slot=breadcrumb-separator]]:overflow-visible [&_li[data-slot=breadcrumb-separator]]:shrink-0 [&_li[data-slot=breadcrumb-separator]]:min-w-auto [&_li[data-slot=breadcrumb-separator]]:mx-0.5 [&_.ant-breadcrumb-link]:overflow-hidden [&_.ant-breadcrumb-link]:flex [&_.ant-breadcrumb-link]:items-center [&_.ant-breadcrumb-link]:min-w-0 [&_.ant-breadcrumb-link]:py-0.5 [&_.ant-breadcrumb-link]:px-1.5 [&_.ant-breadcrumb-link]:rounded-(--radius-button) [&_.ant-breadcrumb-link>a]:overflow-hidden [&_.ant-breadcrumb-link>a]:flex [&_.ant-breadcrumb-link>a]:items-center [&_.ant-breadcrumb-link>a]:min-w-0 [&_.ant-breadcrumb-link>a]:py-0.5 [&_.ant-breadcrumb-link>a]:px-1.5 [&_.ant-breadcrumb-link>a]:rounded-(--radius-button)',
  subtaskTreeTitle: 'text-muted-foreground',
  activityLine:
    "relative py-1.25 ps-3 before:content-[''] before:absolute before:inset-y-0 before:start-[calc(var(--spacing)*4.875)] before:w-px before:bg-divider first:before:top-1/2 last:before:bottom-1/2 only:before:hidden",
  activityMark:
    'relative z-1 flex shrink-0 items-center justify-center size-4 rounded-full bg-card',
  activityTimeline: '-my-1',
  activityAvatar:
    'flex shrink-0 items-center justify-center size-6 rounded-full text-foreground-quaternary bg-muted',
  commentCard:
    'relative [&_.comment-actions]:opacity-0 [&_.comment-actions]:transition-opacity [&_.comment-actions]:duration-(--orvilo-motion-fast) hover:[&_.comment-actions]:opacity-100 focus-within:[&_.comment-actions]:opacity-100 coarse:[&_.comment-actions]:opacity-100 motion-reduce:[&_.comment-actions]:transition-none',
  commentActions: 'absolute top-2 end-2',
  agentAuthorName:
    'cursor-pointer transition-colors duration-(--orvilo-motion-fast) hover:text-foreground motion-reduce:transition-none',
  commentInputCard:
    'py-1 px-2 border border-transparent rounded-(--radius-input) bg-muted transition-[background-color,border-color] duration-(--orvilo-motion-fast) hover:bg-selected focus-within:border-border focus-within:bg-muted motion-reduce:transition-none',
};
