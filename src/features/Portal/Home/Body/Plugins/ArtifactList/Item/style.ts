import { createStaticStyles } from 'antd-style';

const registeredStyles = createStaticStyles(({ css, cssVar }) => ({
  tagGreen: css`
    color: ${cssVar.green};
    background: ${cssVar.green1};
  `,
}));

export const styles = {
  container:
    'w-full cursor-pointer rounded-(--radius-card) bg-popover px-2 py-2.5 pe-3 text-sm text-foreground hover:bg-selected',
  plugin: 'flex w-fit items-center gap-1',
  tag: 'flex size-6 cursor-default items-center justify-center rounded-(--radius-chip) text-base leading-6',
  tagBlue: 'bg-muted text-muted-foreground',
  tagGreen: registeredStyles.tagGreen,
};
