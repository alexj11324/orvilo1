import { cssVar } from 'antd-style';
import { type LucideIcon } from 'lucide-react';
import { createElement, memo } from 'react';

import { Spinner } from '@/components/ui/spinner';

const TimeLabel = memo<{
  date?: string;
  icon: LucideIcon;
  /** Omit when the icon already says what the value is. */
  title?: string;
}>(({ date, icon, title }) => {
  return (
    <div
      className={'flex min-w-0'}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        color: cssVar.colorTextDescription,
        fontSize: 12,
      }}
    >
      {createElement(icon, {})}
      {title ? `${title}: ` : null}
      {date ? <span style={{ fontWeight: 'bold' }}>{date}</span> : <Spinner />}
    </div>
  );
});

export default TimeLabel;
