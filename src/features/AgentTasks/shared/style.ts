import { createStaticStyles } from 'antd-style';

const stylesRetained = createStaticStyles(({ css, cssVar }) => ({
  breadcrumb: css`
    overflow: hidden;
    min-width: 0;

    ol {
      flex-wrap: nowrap;
      align-items: center;
      min-width: 0;

      /* The global list reset gives every ol a 14px bottom margin, which
         lifted the trail above the star and overflow buttons beside it. */
      margin: 0;
    }

    li {
      overflow: hidden;
      display: flex;
      flex-shrink: 1;
      align-items: center;

      min-width: 0;
    }

    li.ant-breadcrumb-separator {
      overflow: visible;
      flex-shrink: 0;
      min-width: auto;
      margin-inline: 2px;
    }

    .ant-breadcrumb-link,
    .ant-breadcrumb-link > a {
      overflow: hidden;
      display: flex;
      align-items: center;

      min-width: 0;
      padding-block: 2px;
      padding-inline: 6px;
      border-radius: ${cssVar.borderRadius};
    }
  `,
}));

export const styles = {
  titleText:
    'm-0 text-xl leading-7 font-semibold text-foreground wrap-anywhere whitespace-pre-wrap',
  titleInput:
    'resize-none min-h-0 p-0 border-0 rounded-none text-xl md:text-xl leading-7 font-semibold bg-transparent dark:bg-transparent shadow-none focus:border-0 focus:outline-none focus:shadow-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none disabled:cursor-text disabled:opacity-100 disabled:bg-transparent dark:disabled:bg-transparent',
  breadcrumb: stylesRetained.breadcrumb,
  subtaskTreeTitle: 'text-muted-foreground',
  activityLine:
    "relative py-1.25 ps-3 before:content-[''] before:absolute before:inset-y-0 before:start-4.875 before:w-px before:bg-divider first:before:top-1/2 last:before:bottom-1/2 only:before:hidden",
  activityMark:
    'relative z-1 flex shrink-0 items-center justify-center size-4 rounded-full bg-card',
  activityTimeline: '-my-1',
  activityAvatar:
    'flex shrink-0 items-center justify-center size-6 rounded-full text-foreground-quaternary bg-muted',
  commentCard:
    'relative [&_.comment-actions]:opacity-0 [&_.comment-actions]:transition-opacity [&_.comment-actions]:duration-(--orvilo-motion-fast) hover:[&_.comment-actions]:opacity-100 focus-within:[&_.comment-actions]:opacity-100 motion-reduce:[&_.comment-actions]:transition-none',
  commentActions: 'absolute top-2 end-2',
  agentAuthorName:
    'cursor-pointer transition-colors duration-(--orvilo-motion-fast) hover:text-foreground motion-reduce:transition-none',
  commentInputCard:
    'py-1 px-2 border border-transparent rounded-(--radius-input) bg-muted transition-[background-color,border-color] duration-(--orvilo-motion-fast) hover:bg-selected focus-within:border-border focus-within:bg-muted motion-reduce:transition-none',
};
