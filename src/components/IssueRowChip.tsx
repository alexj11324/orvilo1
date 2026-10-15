'use client';

import { cn } from 'cn';
import type { HTMLAttributes, ReactNode, Ref } from 'react';

/** Issue-row metadata and interactive properties consume DESIGN.md roles. */
const styles = {
  chip: 'inline-flex box-border max-w-50 flex-none items-center gap-1.5 rounded-(--radius-chip) border border-border bg-fill-quaternary px-2 py-0 text-xs leading-5 font-normal whitespace-nowrap text-muted-foreground',
  icon: 'inline-flex size-3.5 flex-none items-center justify-center',
  interactive: 'cursor-pointer hover:bg-accent hover:text-foreground',
  suffix: 'flex-none',
  text: 'min-w-0 truncate',
};

export interface IssueRowChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children?: ReactNode;
  /** Leading 14px glyph; the chip centres it in a fixed box. */
  icon?: ReactNode;
  ref?: Ref<HTMLSpanElement>;
  /** Trailing text that never truncates (a milestone's date) — the name gives way first. */
  suffix?: ReactNode;
}

/**
 * The one pill every issue-row property chip uses. Rest props land on the
 * root span so it can sit directly inside a dropdown / tooltip trigger.
 */
const IssueRowChip = ({
  children,
  className,
  icon,
  onClick,
  ref,
  suffix,
  ...rest
}: IssueRowChipProps) => (
  <span
    data-issue-row-chip
    className={cn(styles.chip, onClick ? 'h-7' : 'h-6', onClick && styles.interactive, className)}
    ref={ref}
    onClick={onClick}
    {...rest}
  >
    {icon ? <span className={styles.icon}>{icon}</span> : null}
    {children === undefined || children === null ? null : (
      <span className={styles.text}>{children}</span>
    )}
    {suffix ? <span className={styles.suffix}>{suffix}</span> : null}
  </span>
);

export default IssueRowChip;
