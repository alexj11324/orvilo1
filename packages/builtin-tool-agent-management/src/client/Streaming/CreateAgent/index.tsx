'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo } from 'react';

import { Badge as Tag } from '@/components/reui/badge';

import type { CreateAgentParams } from '../../../types';

export const CreateAgentStreaming = memo<BuiltinStreamingProps<CreateAgentParams>>(({ args }) => {
  const { title, description, systemRole, plugins, model, provider } = args || {};

  if (!title && !description && !systemRole && !plugins?.length) return null;

  return (
    <div className="flex flex-col gap-3">
      {title && (
        <div className="flex flex-col gap-1">
          <div className="text-xs leading-[inherit] font-medium text-muted-foreground">Title</div>
          <div className="text-[13px]">{title}</div>
        </div>
      )}
      {description && (
        <div className="flex flex-col gap-1">
          <div className="text-xs leading-[inherit] font-medium text-muted-foreground">
            Description
          </div>
          <div className="text-[13px]">{description}</div>
        </div>
      )}
      {(model || provider) && (
        <div className="flex flex-col gap-1">
          <div className="text-xs leading-[inherit] font-medium text-muted-foreground">Model</div>
          <div className="text-[13px]">
            {provider && `${provider}/`}
            {model}
          </div>
        </div>
      )}
      {plugins && plugins.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-xs leading-[inherit] font-medium text-muted-foreground">Plugins</div>
          <div className="flex flex-row gap-1 flex-wrap">
            {plugins.map((plugin) => (
              <Tag key={plugin}>{plugin}</Tag>
            ))}
          </div>
        </div>
      )}
      {systemRole && (
        <div className="flex flex-col gap-1">
          <div className="text-xs leading-[inherit] font-medium text-muted-foreground">
            System Prompt
          </div>
          <div
            className="rounded-md border bg-card"
            style={{ paddingBlock: 8, paddingInline: 12, width: '100%' }}
          >
            <Markdown animated variant={'chat'}>
              {systemRole}
            </Markdown>
          </div>
        </div>
      )}
    </div>
  );
});

CreateAgentStreaming.displayName = 'CreateAgentStreaming';

export default CreateAgentStreaming;
