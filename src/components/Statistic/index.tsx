import { cssVar } from 'antd-style';
import { type ReactNode } from 'react';
import { memo } from 'react';

const Statistic = memo<{ title: ReactNode; value: ReactNode }>(({ value, title }) => {
  return (
    <div className={'flex gap-1'} style={{ color: cssVar.colorTextDescription, fontSize: 12 }}>
      <span style={{ fontWeight: 'bold' }}>{value}</span>
      <span style={{ fontWeight: 'normal' }}>{title}</span>
    </div>
  );
});

export default Statistic;
