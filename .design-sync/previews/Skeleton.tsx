import { Skeleton } from '@orvilo/ui';

export const ListRow = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 320 }}>
    <Skeleton style={{ width: 40, height: 40, borderRadius: 999 }} />
    <div style={{ display: 'grid', gap: 8, flex: 1 }}>
      <Skeleton style={{ height: 14, width: '70%' }} />
      <Skeleton style={{ height: 12, width: '45%' }} />
    </div>
  </div>
);

export const Card = () => (
  <div style={{ display: 'grid', gap: 12, width: 320 }}>
    <Skeleton style={{ height: 120, width: '100%' }} />
    <Skeleton style={{ height: 14, width: '80%' }} />
    <Skeleton style={{ height: 14, width: '60%' }} />
  </div>
);
