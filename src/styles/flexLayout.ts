import { css } from 'antd-style';

// Preserve explicit Flex padding props against late resets, without overriding
// padding owned by surface classes (whose stylesheet may load before this one).
export const flexLayout = css`
  .lobe-flex[style*='--lobe-flex-padding'] {
    padding: var(--lobe-flex-padding, 0);
    padding-block: var(--lobe-flex-padding-block, var(--lobe-flex-padding, 0));
    padding-inline: var(--lobe-flex-padding-inline, var(--lobe-flex-padding, 0));
  }
`;
