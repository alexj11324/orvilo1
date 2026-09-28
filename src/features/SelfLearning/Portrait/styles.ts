import { createStaticStyles, cssVar } from 'antd-style';

/**
 * 规则清单共用的几处样式：一行的排版与悬停，命中点的圆点，以及「全部经验」链接。
 *
 * 这里原来还有成长画像的一套（可靠度条、等级分段、判断句标题、按层画像）。S60 把画像改成
 * 规则清单后，那些只服务于「它成长得怎么样」的样式一并删掉了 —— 留下的都只描述事实。
 */
export const portraitStyles = createStaticStyles(({ css }) => ({
  dot: css`
    display: inline-block;

    box-sizing: border-box;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  `,
  dotBad: css`
    background: ${cssVar.colorWarning};
  `,
  dotNone: css`
    border: 1px solid ${cssVar.colorBorder};
    background: transparent;
  `,
  dotOk: css`
    background: ${cssVar.colorTextQuaternary};
  `,
  previewTarget: css`
    cursor: pointer;
    text-align: start;

    &:focus-visible {
      border-radius: 4px;
      outline: 2px solid ${cssVar.colorPrimaryBorder};
      outline-offset: 2px;
    }
  `,
  viewAll: css`
    font-size: 12.5px;
    color: ${cssVar.colorTextSecondary};
    white-space: nowrap;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  row: css`
    padding-block: 10px;
    padding-inline: 14px;
    border: 0;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font: inherit;

    &:last-child {
      border-block-end: none;
    }

    .teach {
      opacity: 0;
      transition: opacity 0.15s;
    }

    &:hover,
    &:focus-within {
      background: ${cssVar.colorFillQuaternary};

      .teach {
        opacity: 1;
      }
    }
  `,
}));
