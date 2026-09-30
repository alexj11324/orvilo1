import { Skeleton } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';

const styles = createStaticStyles(({ css, cssVar }) => ({
  card: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  grid: css`
    display: grid;
    gap: 16px;
    padding-block: 12px;
  `,
}));

interface MasonrySkeletonProps {
  columnCount: number;
}

const MasonrySkeleton = memo<MasonrySkeletonProps>(({ columnCount }) => {
  // Generate varying heights for more natural masonry look
  const heights = [160, 180, 170, 160, 190, 170, 160, 180];

  // Calculate number of items based on column count (max 2 columns for modal)
  const itemCount = Math.min(columnCount * 3, 8);

  return (
    <div
      className={styles.grid}
      style={{
        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
      }}
    >
      {Array.from({ length: itemCount }).map((_, index) => (
        <div className={styles.card} key={index}>
          <div className="flex flex-row items-start gap-4 w-[100%]">
            <Skeleton.Avatar size={48} />
            <div
              className="flex flex-col gap-4 w-[100%]"
              style={{ height: heights[index % heights.length] }}
            >
              <Skeleton.Text width={'80%'} />
              <Skeleton.Text rows={3} width={['100%', '90%', '70%']} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

MasonrySkeleton.displayName = 'MasonrySkeleton';

export default MasonrySkeleton;
