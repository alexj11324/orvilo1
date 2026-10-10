'use client';

import { Markdown } from '@lobehub/ui';
import { DEFAULT_AVATAR } from '@orvilo/const';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import { Badge as Tag } from '@/components/reui/badge';

import type { GetAgentDetailParams, GetAgentDetailState } from '../../../types';

export const GetAgentDetailRender = memo<
  BuiltinRenderProps<GetAgentDetailParams, GetAgentDetailState>
>(({ pluginState }) => {
  const meta = pluginState?.meta;
  const config = pluginState?.config;

  if (!meta && !config) return null;

  return (
    <div className="py-1">
      {meta && (
        <div className="flex items-center gap-3 [margin-block-end:12px] [padding-block-end:12px] [border-block-end:1px_solid_var(--sidebar-border)]">
          <Avatar
            avatar={meta.avatar || DEFAULT_AVATAR}
            background={meta.backgroundColor || 'var(--card)'}
            shape={'square'}
            size={36}
            title={meta.title || undefined}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm leading-[inherit] font-semibold">
              {meta.title || 'Untitled'}
            </span>
            {meta.description && <span className="text-[13px]">{meta.description}</span>}
          </div>
        </div>
      )}
      {(config?.model || config?.provider) && (
        <div className="[margin-block-end:8px] last:[margin-block-end:0]">
          <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
            Model
          </div>
          <div className="text-[13px]">
            {config.provider && `${config.provider}/`}
            {config.model}
          </div>
        </div>
      )}
      {config?.plugins && config.plugins.length > 0 && (
        <div className="[margin-block-end:8px] last:[margin-block-end:0]">
          <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
            Plugins
          </div>
          <div className="flex flex-row gap-1 flex-wrap">
            {config.plugins.map((plugin) => (
              <Tag key={plugin}>{plugin}</Tag>
            ))}
          </div>
        </div>
      )}
      {meta?.tags && meta.tags.length > 0 && (
        <div className="[margin-block-end:8px] last:[margin-block-end:0]">
          <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
            Tags
          </div>
          <div className="flex flex-row gap-1 flex-wrap">
            {meta.tags.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </div>
        </div>
      )}
      {config?.systemRole && (
        <div className="[margin-block-end:8px] last:[margin-block-end:0]">
          <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
            System Prompt
          </div>
          <div
            className="rounded-md border bg-card"
            style={{ paddingBlock: 8, paddingInline: 12, width: '100%' }}
          >
            <Markdown fontSize={13} variant={'chat'}>
              {config.systemRole}
            </Markdown>
          </div>
        </div>
      )}
    </div>
  );
});

GetAgentDetailRender.displayName = 'GetAgentDetailRender';

export default GetAgentDetailRender;
