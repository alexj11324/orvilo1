import { createStaticStyles } from 'antd-style';

// Keep the Agent sidebar's section rows consistent without changing the shared accordion.
export const accordionStyles = createStaticStyles(({ css }) => ({
  item: css`
    border-block-end: 0 !important;
  `,
  trigger: css`
    gap: 8px;
    align-items: center;
    justify-content: flex-start;

    &:hover {
      text-decoration: none;
    }

    > div {
      flex: 1;
      min-width: 0;
    }

    > [data-slot='accordion-trigger-icon'] {
      flex: none;
      order: -1;

      width: 14px;
      height: 14px;
      margin-inline-start: 0;

      &:first-of-type {
        transform: rotate(-90deg);
      }

      &:last-of-type {
        transform: rotate(180deg);
      }
    }
  `,
}));
