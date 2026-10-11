import { createStaticStyles } from 'antd-style';

const retainedStyles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    pointer-events: auto;
    user-select: none;
    overflow: hidden;
    padding: 0 !important;
  `,
  dropdownMenu: css`
    user-select: none;

    [role='menuitem'] {
      margin-block: 1px;
      margin-inline: 4px;
      padding-block: 8px;
      padding-inline: 8px;
      border-radius: ${cssVar.borderRadiusSM};
    }
  `,
  groupHeader: css`
    width: 100%;
    color: ${cssVar.colorTextSecondary};
  `,
  menuItem: css`
    cursor: pointer;

    position: relative;

    gap: 8px;
    align-items: center;

    margin-block: 1px;
    margin-inline: 4px;
    padding-block: 8px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadiusSM};
  `,
  menuItemActive: css`
    background: ${cssVar.colorFillSecondary};
  `,
  footer: css`
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  toolbar: css`
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

export const styles = {
  ...retainedStyles,
  detailPopup: 'w-100 select-none overscroll-contain',
  empty:
    'flex min-h-24 items-center justify-center px-4 py-6 text-sm leading-5.5 text-muted-foreground text-center',
  list: 'relative w-full overflow-x-hidden overflow-y-auto overscroll-contain',
  trigger: 'inline-flex outline-none [&_svg:focus]:outline-none',
};
