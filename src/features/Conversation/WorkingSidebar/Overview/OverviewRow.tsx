import { cn } from 'cn';
import type { LucideProps } from 'lucide-react';
import { ChevronRightIcon, ChevronsUpDownIcon } from 'lucide-react';
import { type ComponentType, createElement, memo, type ReactNode } from 'react';

export const rowStyles = {
  changeAdditions: 'tabular-nums text-xs leading-5 text-success-text',
  changeDeletions: 'tabular-nums text-xs leading-5 text-destructive-text',
  icon: 'shrink-0 text-foreground-tertiary',
  num: 'me-1 font-mono text-xs leading-5 font-medium text-foreground-tertiary',
  row: 'cursor-pointer shrink-0 min-h-8 py-1 px-2 rounded-(--radius-button) transition-colors duration-(--orvilo-motion-fast) hover:bg-accent',
  rowAction: 'text-xs leading-5 font-medium text-muted-foreground',
  rowStatic: 'cursor-default hover:bg-transparent',
  rowTrailing:
    'flex shrink-0 gap-1.5 items-center text-xs leading-5 tabular-nums text-foreground-tertiary',
  rowValue:
    'overflow-hidden flex-1 min-w-0 text-sm leading-5.5 text-foreground text-ellipsis whitespace-nowrap',
  rowValueDanger: 'text-destructive-text',
  rowValueWeak: 'text-muted-foreground',
};

export interface OverviewRowProps {
  danger?: boolean;
  icon?: ComponentType<LucideProps>;
  iconColor?: string;
  iconNode?: ReactNode;
  iconSize?: number;
  interactive?: boolean;
  onClick?: () => void;
  title?: string;
  trailing?: ReactNode;
  value: ReactNode;
  weak?: boolean;
}

export const OverviewRow = memo<OverviewRowProps>(
  ({
    danger,
    icon,
    iconColor,
    iconNode,
    iconSize = 16,
    interactive,
    onClick,
    title,
    trailing,
    value,
    weak,
  }) => (
    <div
      role={onClick || interactive ? 'button' : undefined}
      className={cn(
        'flex items-center gap-2.5',
        cn(rowStyles.row, !onClick && !interactive && rowStyles.rowStatic),
      )}
      onClick={onClick}
    >
      {iconNode ??
        createElement(icon!, {
          className: rowStyles.icon,
          size: iconSize,
          style: iconColor ? { color: iconColor } : undefined,
        })}
      <span
        title={title}
        className={cn(
          rowStyles.rowValue,
          danger && rowStyles.rowValueDanger,
          weak && rowStyles.rowValueWeak,
        )}
      >
        {value}
      </span>
      {trailing ? <span className={rowStyles.rowTrailing}>{trailing}</span> : null}
    </div>
  ),
);

OverviewRow.displayName = 'OverviewRow';

export const PickerGlyph = () => <ChevronsUpDownIcon className="opacity-60" size={13} />;
export const ChevronRight = () => <ChevronRightIcon className="opacity-60" size={14} />;
