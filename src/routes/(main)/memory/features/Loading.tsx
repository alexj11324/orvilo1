import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import { type ViewMode } from './ViewModeSwitcher';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
}));

const Loading = memo<{ rows?: number; viewMode?: ViewMode }>(({ viewMode, rows = 3 }) => {
  if (viewMode === 'timeline') {
    return (
      <div className="flex flex-col gap-6 py-6" style={{ paddingLeft: 32 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="flex flex-col gap-2" key={i}>
            <Skeleton style={{ height: 18, marginBlock: 2, width: '30%' }} />
            <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
            <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
            <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
            <Skeleton style={{ height: 18, marginBlock: 2, width: '66%' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(max(240px, calc((100% - 12px * ${rows - 1}) / ${rows})), 1fr))`,
        paddingBlock: 8,
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div className={cn('flex flex-col', styles.card)} key={i}>
          <Skeleton style={{ height: 18, marginBlock: 2, width: '80%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '100%' }} />
          <Skeleton style={{ height: 18, marginBlock: 2, width: '66%' }} />
          <div className="flex gap-2">
            <Skeleton style={{ height: 20, width: 60 }} />
            <Skeleton style={{ height: 20, width: 50 }} />
          </div>
        </div>
      ))}
    </div>
  );
});

export default Loading;
