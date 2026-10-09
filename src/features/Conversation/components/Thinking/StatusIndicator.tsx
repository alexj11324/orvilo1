import { BrainIcon } from 'lucide-react';
import { memo } from 'react';
// eslint-disable-next-line no-restricted-imports -- User-requested Libraries.dev visual replacement; keep the upstream orb implementation.
import { ThinkingOrb } from 'thinking-orbs';

interface StatusIndicatorProps {
  thinking?: boolean;
}

const StatusIndicator = memo<StatusIndicatorProps>(({ thinking }) => (
  <span aria-hidden className="inline-flex size-5 shrink-0 items-center justify-center">
    {thinking ? (
      <ThinkingOrb aria-hidden size={20} state="solving" />
    ) : (
      <BrainIcon className="size-4" />
    )}
  </span>
));

export default StatusIndicator;
