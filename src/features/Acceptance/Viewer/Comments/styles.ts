/** Opaque positioned boxes and event dots paint above the timeline rail. */
export const TIMELINE_NODE = 32;

// Rail: 32px avatar + 12px gutter + 19px inset; its 2px line begins at 62px.
// The tail's repeated selector outranks the first/last-entry truncation.
export const styles = {
  body: 'min-h-20 py-3 px-3.5 text-[14px] leading-[1.7] wrap-anywhere whitespace-pre-wrap',
  box: 'relative flex-1 min-w-0 border border-sidebar-border rounded-(--ant-border-radius) bg-card',
  boxSelf: 'border-[color-mix(in_srgb,var(--ant-color-info-border)_45%,transparent)]',
  boxHeader: 'py-2 px-3.5 rounded-ss-(--ant-border-radius) rounded-se-(--ant-border-radius)',
  boxAnchored: 'outline-2 outline-solid outline-(--ant-color-info-border) outline-offset-2',
  attachments: 'pt-2.5',
  composerBlock: 'relative p-3 border border-sidebar-border rounded-(--ant-border-radius) bg-card',
  deleted: 'italic text-(--ant-color-text-tertiary)',
  event: 'py-0.5 text-[13px] text-muted-foreground',
  eventDot:
    'relative inline-flex flex-none items-center justify-center size-5 border border-sidebar-border rounded-[50%] text-(--ant-color-text-tertiary) bg-popover',
  meta: 'flex-none text-[12px] text-(--ant-color-text-tertiary)',
  timeLink:
    'cursor-pointer p-0 border-none bg-none bg-transparent transition-colors duration-(--ant-motion-duration-fast) ease-[ease] hover:text-foreground hover:underline',
  panelBody: 'pt-1.5 text-[13px] leading-[1.65] wrap-anywhere whitespace-pre-wrap',
  panelActions: '-mb-1 pt-2.5',
  panelReply: 'pt-2.5',
  resolvedSummary:
    'cursor-pointer w-full p-0 border-none text-[13px] text-(--ant-color-text-tertiary) text-start bg-none bg-transparent hover:text-muted-foreground',
  resolvedThread: 'text-(--ant-color-text-tertiary)',
  authorName: 'truncate flex-none max-w-[180px]',
  headline: 'min-w-0',
  rowActions:
    'flex-none ms-auto opacity-0 transition-opacity duration-(--ant-motion-duration-fast) ease-[ease] [@media(hover:none)]:opacity-100',
  nodelessEntry: 'ps-11',
  eventEntry: 'ps-[53px]',
  tailEntry: '[&&&]:before:[inset-block:0_14px] [&&&]:before:h-auto',
  timelineEntry:
    "relative pb-3.5 before:content-[''] before:absolute before:inset-y-0 before:start-[62px] before:w-0.5 before:bg-sidebar-border [&:hover_[data-comment-actions]]:opacity-100 first-of-type:before:top-2.5 last-of-type:before:bottom-auto last-of-type:before:h-2.5",
  timelineNode: 'flex flex-none justify-center w-8 leading-[0]',
};
