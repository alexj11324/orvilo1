import { getHeterogeneousTypeLabel } from '@orvilo/heterogeneous-agents';
import type { CSSProperties } from 'react';
import { memo } from 'react';

import { Badge as Tag } from '@/components/reui/badge';

interface HeterogeneousTagProps {
  style?: CSSProperties;
  /**
   * Heterogeneous runtime type (e.g. `claude-code`). `null`/`undefined` renders
   * nothing, so callers can pass it unconditionally.
   */
  type?: string | null;
}

/**
 * Small pill that labels a heterogeneous agent by its runtime (Claude Code,
 * Codex, …) using the shared runtime label resolver.
 */
const HeterogeneousTag = memo<HeterogeneousTagProps>(({ type, style }) => {
  const label = getHeterogeneousTypeLabel(type);
  if (!label) return null;

  return (
    <Tag size="sm" style={{ flexShrink: 0, ...style }}>
      {label}
    </Tag>
  );
});

export default HeterogeneousTag;
