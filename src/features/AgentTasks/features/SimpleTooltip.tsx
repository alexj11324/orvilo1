import type { ReactNode } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SimpleTooltipProps {
  children?: ReactNode;
  title?: ReactNode;
}

/**
 * The shape the removed lobehub `<Tooltip title={…}>{trigger}</Tooltip>` had:
 * a props-forwarding span wraps any child so the base-ui trigger can attach
 * listeners, and a missing title renders the child bare instead of an empty
 * popup.
 */
export const SimpleTooltip = ({ children, title }: SimpleTooltipProps) =>
  title == null || title === '' ? (
    <>{children}</>
  ) : (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex">{children}</span>} />
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
