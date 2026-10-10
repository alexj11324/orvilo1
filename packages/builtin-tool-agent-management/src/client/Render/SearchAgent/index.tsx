'use client';

import { DEFAULT_AVATAR } from '@orvilo/const';
import { HETEROGENEOUS_TYPE_LABELS } from '@orvilo/heterogeneous-agents';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';

import type { AgentSearchItem, SearchAgentParams, SearchAgentState } from '../../../types';

export const SearchAgentRender = memo<BuiltinRenderProps<SearchAgentParams, SearchAgentState>>(
  ({ pluginState }) => {
    const { t } = useTranslation('plugin');
    const agents = pluginState?.agents || [];

    if (agents.length === 0) {
      return (
        <div className="p-3 text-center text-[13px] text-muted-foreground">
          {t('builtins.orvilo-agent-builder.inspector.noResults')}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] p-3">
        {agents.map((agent: AgentSearchItem) => (
          <div
            className="flex flex-row items-center gap-3 rounded-[var(--radius-input)] bg-[var(--ant-color-fill-quaternary)] py-2 ps-3 pe-3"
            key={agent.id}
          >
            <Avatar
              avatar={agent.avatar || DEFAULT_AVATAR}
              background={agent.backgroundColor || 'var(--card)'}
              shape={'square'}
              size={32}
              title={agent.title || undefined}
            />
            <div className="flex flex-col flex-1 gap-0.5">
              <div className="flex flex-row items-center gap-2">
                <span className="text-[13px] font-medium">{agent.title || agent.id}</span>
                {agent.heteroType && (
                  <span className="rounded-[var(--radius-chip)] bg-selected py-0.5 ps-1.5 pe-1.5 text-[10px] text-muted-foreground">
                    {HETEROGENEOUS_TYPE_LABELS[agent.heteroType] ?? agent.heteroType}
                  </span>
                )}
                {agent.isMarket && (
                  <span className="rounded-[var(--radius-chip)] bg-[var(--ant-color-primary-bg)] py-0.5 ps-1.5 pe-1.5 text-[10px] text-[var(--ant-color-primary)]">
                    Market
                  </span>
                )}
              </div>
              {agent.description && (
                <span className="truncate text-xs leading-[inherit] text-muted-foreground">
                  {agent.description}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  },
);

SearchAgentRender.displayName = 'SearchAgentRender';

export default SearchAgentRender;
