'use client';

import { Markdown } from '@lobehub/ui';
import { AGENT_CHAT_URL } from '@orvilo/const';
import type { BuiltinRenderProps } from '@orvilo/types';
import { ArrowRight } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router';

import Avatar from '@/components/Avatar';
import { Badge as Tag } from '@/components/reui/badge';

import type { CreateAgentParams, CreateAgentState } from '../../../types';

export const CreateAgentRender = memo<BuiltinRenderProps<CreateAgentParams, CreateAgentState>>(
  ({ args, pluginState }) => {
    const navigate = useNavigate();
    const { title, description, systemRole, plugins, model, provider, avatar, backgroundColor } =
      args || {};

    const handleNavigateToAgent = useCallback(() => {
      const targetId = pluginState?.agentId;
      if (!targetId) return;
      navigate(AGENT_CHAT_URL(targetId));
    }, [navigate, pluginState?.agentId]);

    // After tool execution succeeds, render a clickable agent card
    if (pluginState?.success && pluginState.agentId) {
      return (
        <div
          className="flex flex-row items-center gap-3 cursor-pointer rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] py-2.5 ps-3 pe-3 [transition:background_0.2s] hover:bg-accent"
          onClick={handleNavigateToAgent}
        >
          <Avatar
            avatar={avatar || '🤖'}
            background={backgroundColor}
            shape={'square'}
            size={36}
            title={title || undefined}
          />
          <div className="flex flex-col flex-1 gap-0.5">
            <span className="text-[13px] font-medium">{title}</span>
            {description && (
              <span className="truncate text-xs leading-[inherit] text-muted-foreground">
                {description}
              </span>
            )}
          </div>
          <ArrowRight className="text-[var(--ant-color-text-tertiary)]" size={16} />
        </div>
      );
    }

    // While tool is still executing (no pluginState yet), show args preview
    if (!title && !description && !systemRole && !plugins?.length) return null;

    return (
      <div className="py-1">
        {title && (
          <div className="[margin-block-end:8px] last:[margin-block-end:0]">
            <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
              Title
            </div>
            <div className="text-[13px]">{title}</div>
          </div>
        )}
        {description && (
          <div className="[margin-block-end:8px] last:[margin-block-end:0]">
            <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
              Description
            </div>
            <div className="text-[13px]">{description}</div>
          </div>
        )}
        {(model || provider) && (
          <div className="[margin-block-end:8px] last:[margin-block-end:0]">
            <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
              Model
            </div>
            <div className="text-[13px]">
              {provider && `${provider}/`}
              {model}
            </div>
          </div>
        )}
        {plugins && plugins.length > 0 && (
          <div className="[margin-block-end:8px] last:[margin-block-end:0]">
            <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
              Plugins
            </div>
            <div className="flex flex-row gap-1 flex-wrap">
              {plugins.map((plugin) => (
                <Tag key={plugin}>{plugin}</Tag>
              ))}
            </div>
          </div>
        )}
        {systemRole && (
          <div className="[margin-block-end:8px] last:[margin-block-end:0]">
            <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
              System Prompt
            </div>
            <div
              className="rounded-md border bg-card"
              style={{ paddingBlock: 8, paddingInline: 12, width: '100%' }}
            >
              <Markdown fontSize={13} variant={'chat'}>
                {systemRole}
              </Markdown>
            </div>
          </div>
        )}
      </div>
    );
  },
);

CreateAgentRender.displayName = 'CreateAgentRender';

export default CreateAgentRender;
