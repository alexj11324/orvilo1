import { createStaticStyles, cx } from 'antd-style';
import React, { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,

  meta: css`
    font-size: 12px;
  `,
}));

const ReadFileSkeleton = memo(() => {
  return (
    <div className={cx('flex flex-col gap-0.5', styles.container)}>
      <div className="flex flex-row items-center gap-6 justify-between">
        <div className="flex flex-row items-center flex-1 gap-2" style={{ overflow: 'hidden' }}>
          <Skeleton style={{ flex: 1, height: 16, width: 20 }} />

          <Skeleton style={{ flex: 1, minWidth: 100, height: 16 }} />
        </div>
        <div className={cx('flex flex-col items-center gap-4', styles.meta)}>
          <Skeleton style={{ maxWidth: 40, height: 16 }} />
        </div>
      </div>

      <Skeleton style={{ height: 16 }} />
    </div>
  );
});

export default ReadFileSkeleton;
