import { createStaticStyles } from 'antd-style';

const registeredStyles = createStaticStyles(({ css, cssVar }) => ({
  actionBtn: css`
    &:hover {
      border-color: ${cssVar.colorBorder} !important;
      background: ${cssVar.colorFillQuaternary} !important;
    }
  `,
  actionBtnPrimary: css`
    width: auto !important;
    padding-inline: 12px !important;
  `,
  expandLink: css`
    border: 1px solid ${cssVar.colorFillTertiary} !important;
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
  `,
  card: css`
    .brief-comment-btn,
    .brief-view-run-btn {
      opacity: 0;
    }

    &:hover {
      border-color: ${cssVar.colorBorder} !important;

      .brief-comment-btn,
      .brief-view-run-btn {
        opacity: 1;
      }
    }
  `,
}));

export const styles = {
  ...registeredStyles,
  resolvedTag: 'text-xs leading-5 text-foreground-quaternary',
  clickableHeader: 'cursor-pointer',
};
