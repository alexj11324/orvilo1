import { agentDisplayName } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

const styles = createStaticStyles(({ css }) => ({
  label: css`
    flex: none;

    font-size: 12px;
    line-height: 1;
    color: ${cssVar.colorTextDescription};
    white-space: nowrap;
  `,
  line: css`
    flex: 1;
    height: 1px;
    background: ${cssVar.colorBorderSecondary};
  `,
  root: css`
    display: flex;
    gap: 12px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 16px;
  `,
}));

/**
 * Weak in-flow separator inserted where the topic's bound agent changed —
 * the mid-conversation handoff marker from the topic-centric workspace model.
 * Looks up the target agent's display name; no model/runtime metadata, the
 * handoff is a conversation fact, not a config dump.
 */
const AgentHandoffMarker = memo<{ toAgentId: string }>(({ toAgentId }) => {
  const { t } = useTranslation('chat');
  const meta = useAgentStore(agentSelectors.getAgentMetaById(toAgentId));
  const name = agentDisplayName(meta, t('untitledAgent'));

  return (
    <div aria-hidden className={styles.root}>
      <span className={styles.line} />
      <span className={styles.label}>{t('agentHandoffMarker', { name })}</span>
      <span className={styles.line} />
    </div>
  );
});

AgentHandoffMarker.displayName = 'AgentHandoffMarker';

export default AgentHandoffMarker;
