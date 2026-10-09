import { cn } from 'cn';
import { type ReactNode } from 'react';

/** Muted sub-header row inside the models panel ("Enabled", "Disabled", search result count). */
const GroupHeader = ({
  actions,
  children,
  className,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      'flex min-h-8 items-center justify-between gap-2 border-t border-border bg-accent px-4 text-xs text-muted-foreground first:border-t-0',
      className,
    )}
  >
    <span>{children}</span>
    {actions ? <div className="flex items-center">{actions}</div> : null}
  </div>
);

export default GroupHeader;
