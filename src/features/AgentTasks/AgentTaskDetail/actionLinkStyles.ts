import { createStaticStyles } from 'antd-style';

/**
 * The muted text-link buttons Linear scatters across the issue feed
 * ("Attach images, files, or videos", "Add reaction", "Subscribe", "Change
 * subscribers") — 13px tertiary copy that darkens on hover.
 */
export const actionLinkStyles = createStaticStyles(({ css, cssVar }) => ({
  actionLink: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    width: fit-content;
    padding-block: 2px;
    border: none;

    font-size: 13px;
    color: ${cssVar.colorTextTertiary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  iconActionBtn: css`
    cursor: pointer;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: ${cssVar.borderRadiusSM};

    color: ${cssVar.colorTextTertiary};

    background: transparent;

    transition: all ${cssVar.motionDurationFast};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));
