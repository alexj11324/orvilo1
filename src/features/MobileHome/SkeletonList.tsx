'use client';

import { Skeleton } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo } from 'react';

const prefixCls = 'ant';

const styles = createStaticStyles(({ css, cssVar }) => ({
  item: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 12px;
    padding-inline: 16px;
    border-radius: ${cssVar.borderRadius};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    .${prefixCls}-skeleton-header {
      padding: 0;
    }
  `,
  paragraph: css`
    margin-block: 8px 0 !important;

    > li {
      height: 12px !important;
    }
  `,
  title: css`
    height: 16px !important;
    margin-block-end: 0 !important;

    > li {
      height: 16px !important;
    }
  `,
}));

interface SkeletonListProps {
  count?: number;
}

const SkeletonList = memo<SkeletonListProps>(({ count = 4 }) => {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: count }).map((_, index) => (
        <div className={cx(styles.item, 'flex items-center gap-3')} key={index}>
          <Skeleton.Avatar
            shape="square"
            size={40}
            style={{ borderRadius: cssVar.borderRadius, flex: 'none' }}
          />
          <div className="flex flex-col flex-1" style={{ overflow: 'hidden' }}>
            <div className="flex flex-col gap-4 w-full">
              <Skeleton.Text className={styles.title} width={'60%'} />
              <Skeleton.Text className={styles.paragraph} width={'80%'} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

export default SkeletonList;
