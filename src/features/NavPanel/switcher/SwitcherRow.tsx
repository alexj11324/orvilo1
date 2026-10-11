import { cn } from 'cn';
import { CheckIcon } from 'lucide-react';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';

import type { SwitcherItem } from './switcherItems';

const styles = {
  current: 'bg-selected hover:bg-selected',
  row: 'cursor-pointer overflow-hidden flex-none px-2 rounded-(--radius-button) hover:bg-accent',
};

interface SwitcherRowProps {
  active?: boolean;
  item: SwitcherItem;
  onSelect: (id: string) => void;
  privateLabel?: string;
}

const SwitcherRow = memo<SwitcherRowProps>(({ active, item, onSelect, privateLabel }) => (
  <Button
    aria-current={active ? 'true' : undefined}
    size="compact"
    type="button"
    variant="ghost"
    className={cn(
      active ? `${styles.row} ${styles.current}` : styles.row,
      'flex w-full flex-none cursor-pointer items-center justify-start gap-2 border-0 text-start text-sm font-normal focus-visible:outline-none focus-visible:ring-0 focus-visible:inset-ring-3 focus-visible:inset-ring-ring/50 active:translate-y-0 [@media(pointer:coarse)]:min-h-11',
    )}
    onClick={() => onSelect(item.id)}
  >
    <Avatar avatar={item.avatar} background={item.background} shape={'square'} size={28} />
    <span
      className={cn(
        'flex-1 truncate',
        active ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}
    >
      {item.title}
      {item.subtitle && <span className="ms-1.5 text-xs opacity-60">{item.subtitle}</span>}
    </span>
    {item.private && privateLabel && (
      <span className="text-xs text-foreground-tertiary">{privateLabel}</span>
    )}
    {active && <CheckIcon className="text-foreground" size={16} />}
  </Button>
));

SwitcherRow.displayName = 'SwitcherRow';

export default SwitcherRow;
