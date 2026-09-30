import { formatElapsedClockTime } from '@orvilo/utils';
import { memo, useEffect, useState } from 'react';

interface RunningElapsedTimeProps {
  startTime?: Date | number | string | null;
}

export const resolveTopicTriggerTime = (
  startTime: Date | number | string | null | undefined,
  fallbackTime: Date | number | string,
) => startTime ?? fallbackTime;

export const RunningElapsedTime = memo<RunningElapsedTimeProps>(({ startTime }) => {
  const startTimeMs = startTime == null ? undefined : new Date(startTime).getTime();
  const hasValidStartTime = startTimeMs !== undefined && Number.isFinite(startTimeMs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasValidStartTime) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [hasValidStartTime, startTimeMs]);

  if (!hasValidStartTime) return null;

  return (
    <div
      className="text-[12px] text-muted-foreground"
      style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}
    >
      {formatElapsedClockTime(now - startTimeMs)}
    </div>
  );
});

RunningElapsedTime.displayName = 'RunningElapsedTime';
