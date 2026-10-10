'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { SubAgentRunStats } from '../../types';

const styles = {
  root: 'shrink-0 truncate text-[12px] text-(--ant-color-text-tertiary)',
};

const formatTokens = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
};

/**
 * Compact one-line sub-agent run stats: tool count · model · token count.
 * Fed live during the run (streamed totals) and by the persisted state after it,
 * so the same row serves both. Renders nothing until the first stat arrives.
 */
export const SubAgentStats = memo<SubAgentRunStats>(({ model, totalToolCalls, totalTokens }) => {
  const { t } = useTranslation('plugin');

  const items = [
    model || null,
    typeof totalToolCalls === 'number' && totalToolCalls > 0
      ? t('builtins.orvilo-agent.subAgent.stats.tools', { count: totalToolCalls })
      : null,
    typeof totalTokens === 'number' && totalTokens > 0
      ? t('builtins.orvilo-agent.subAgent.stats.tokens', { count: formatTokens(totalTokens) })
      : null,
  ].filter(Boolean);

  if (items.length === 0) return null;

  return <span className={styles.root}>{items.join(' · ')}</span>;
});

SubAgentStats.displayName = 'SubAgentStats';

export default SubAgentStats;
