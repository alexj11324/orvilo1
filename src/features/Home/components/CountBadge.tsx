import { cn } from 'cn';
import { memo } from 'react';

import { homeType } from './homeType';

const styles = {
  badge:
    'inline-flex items-center justify-center min-w-5 min-h-5 px-1.25 rounded-(--radius-chip) bg-secondary',
};

const CountBadge = memo<{ count: number }>(({ count }) => (
  <span className={cn(styles.badge, homeType.badge)}>{count}</span>
));

export default CountBadge;
