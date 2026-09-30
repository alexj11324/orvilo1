'use client';

import { Avatar } from '@lobehub/ui/base-ui';
import { DEFAULT_AVATAR } from '@orvilo/const';
import { HETEROGENEOUS_TYPE_LABELS } from '@orvilo/heterogeneous-agents';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cx, useTheme } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentSearchItem, SearchAgentParams, SearchAgentState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  agentItem: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: 6px;
    background: ${cssVar.colorFillQuaternary};
  `,
  agentTitle: css`
    font-size: 13px;
    font-weight: 500;
  `,
  container: css`
    display: flex;
    flex-direction: column;
    gap: 8px;

    padding: 12px;
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
  `,
  description: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  heteroBadge: css`
    padding-block: 2px;
    padding-inline: 6px;
    border-radius: 4px;

    font-size: 10px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
  marketBadge: css`
    padding-block: 2px;
    padding-inline: 6px;
    border-radius: 4px;

    font-size: 10px;
    color: ${cssVar.colorPrimary};

    background: ${cssVar.colorPrimaryBg};
  `,
  noResults: css`
    padding: 12px;
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
    text-align: center;
  `,
}));

export const SearchAgentRender = memo<BuiltinRenderProps<SearchAgentParams, SearchAgentState>>(
  ({ pluginState }) => {
    const { t } = useTranslation('plugin');
    const theme = useTheme();
    const agents = pluginState?.agents || [];

    if (agents.length === 0) {
      return (
        <div className={styles.noResults}>
          {t('builtins.orvilo-agent-builder.inspector.noResults')}
        </div>
      );
    }

    return (
      <div className={styles.container}>
        {agents.map((agent: AgentSearchItem) => (
          <div className={cx('flex flex-row items-center gap-3', styles.agentItem)} key={agent.id}>
            <Avatar
              avatar={agent.avatar || DEFAULT_AVATAR}
              background={agent.backgroundColor || theme.colorBgContainer}
              shape={'square'}
              size={32}
              title={agent.title || undefined}
            />
            <div className="flex flex-col flex-1 gap-0.5">
              <div className="flex flex-row items-center gap-2">
                <span className={styles.agentTitle}>{agent.title || agent.id}</span>
                {agent.heteroType && (
                  <span className={styles.heteroBadge}>
                    {HETEROGENEOUS_TYPE_LABELS[agent.heteroType] ?? agent.heteroType}
                  </span>
                )}
                {agent.isMarket && <span className={styles.marketBadge}>Market</span>}
              </div>
              {agent.description && <span className={styles.description}>{agent.description}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  },
);

SearchAgentRender.displayName = 'SearchAgentRender';

export default SearchAgentRender;
