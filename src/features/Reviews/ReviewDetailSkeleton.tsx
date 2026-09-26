import { Flexbox } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';

import SkeletonBar from '@/components/Skeleton/Bar';

const styles = createStaticStyles(({ css }) => ({
  diff: css`
    width: 100%;
    max-width: 1500px;
    margin-inline: auto;
    padding-block: 16px 48px;
    padding-inline: 24px;

    @media (width <= 768px) {
      padding-inline: 8px;
    }
  `,
  file: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  fileHeader: css`
    padding: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorFillQuaternary};
  `,
  main: css`
    min-width: 0;
  `,
  overview: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(200px, 24%);
    gap: 32px;

    width: 100%;
    max-width: 1500px;
    margin-inline: auto;
    padding-block: 24px;
    padding-inline: 32px;

    @media (width <= 768px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
      padding-inline: 16px;
    }
  `,
}));

const ReviewDetailSkeleton = ({ view }: { view: 'overview' | 'diff' }) =>
  view === 'overview' ? (
    <div aria-busy className={styles.overview}>
      <Flexbox className={styles.main} gap={12}>
        <SkeletonBar height={30} width={'75%'} />
        <Flexbox horizontal align={'center'} gap={8}>
          <SkeletonBar height={20} radius={'50%'} width={20} />
          <SkeletonBar height={12} width={100} />
          <SkeletonBar height={12} width={160} />
        </Flexbox>
        <Flexbox gap={12} style={{ marginBlockStart: 32 }}>
          <SkeletonBar height={12} width={90} />
          <SkeletonBar height={14} width={'94%'} />
          <SkeletonBar height={14} width={'82%'} />
          <SkeletonBar height={14} width={'65%'} />
        </Flexbox>
      </Flexbox>
      <Flexbox gap={24}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Flexbox gap={8} key={index}>
            <SkeletonBar height={12} width={80} />
            <SkeletonBar height={14} width={index === 3 ? '90%' : 130} />
          </Flexbox>
        ))}
      </Flexbox>
    </div>
  ) : (
    <Flexbox aria-busy className={styles.diff} gap={16}>
      {Array.from({ length: 2 }).map((_, index) => (
        <Flexbox className={styles.file} key={index}>
          <Flexbox className={styles.fileHeader}>
            <SkeletonBar height={14} width={'min(420px, 65%)'} />
          </Flexbox>
          <Flexbox gap={10} padding={16}>
            <SkeletonBar height={12} width={'88%'} />
            <SkeletonBar height={12} width={'72%'} />
            <SkeletonBar height={12} width={'94%'} />
            <SkeletonBar height={12} width={'58%'} />
          </Flexbox>
        </Flexbox>
      ))}
    </Flexbox>
  );

export default ReviewDetailSkeleton;
