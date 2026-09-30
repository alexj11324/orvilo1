import { memo } from 'react';

import { useActivityTime } from '@/hooks/useActivityTime';

interface TimeProps {
  capturedAt?: Date | number | string;
}

const Time = memo<TimeProps>(({ capturedAt }) => {
  const { text, title } = useActivityTime(capturedAt);
  if (!text) return null;

  return (
    <time
      className="text-[12px] text-muted-foreground"
      style={{ display: 'block', flex: 'none' }}
      title={title}
    >
      {text}
    </time>
  );
});

export default Time;
