import { createStaticStyles } from 'antd-style';

/**
 * The editor sizes headings off its own 16px rem base (an h2 computes to
 * 25.6px), which makes a heading in the description larger than the 20px issue
 * title above it. Inside an issue body every heading stays below the title.
 */
export const taskInstructionStyles = createStaticStyles(({ css }) => ({
  content: css`
    h1,
    h2,
    h3,
    h4 {
      margin-block: 16px 8px;
      font-weight: 600;
      line-height: 1.4;
    }

    h1 {
      font-size: 18px;
    }

    h2 {
      font-size: 16px;
    }

    h3,
    h4 {
      font-size: 15px;
    }
  `,
}));
