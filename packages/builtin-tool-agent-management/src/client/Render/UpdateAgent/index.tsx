'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import type { UpdateAgentParams } from '../../../types';

const safeParse = (val: unknown): Record<string, any> | undefined => {
  if (!val) return undefined;
  if (typeof val === 'object') return val as Record<string, any>;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const UpdateAgentRender = memo<BuiltinRenderProps<UpdateAgentParams>>(({ args }) => {
  const config = safeParse(args?.config);
  const meta = safeParse(args?.meta);

  const hasConfig = config && Object.keys(config).length > 0;
  const hasMeta = meta && Object.keys(meta).length > 0;

  if (!hasConfig && !hasMeta) return null;

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] p-3">
      {meta?.title && (
        <div className="[margin-block-end:8px] last:[margin-block-end:0]">
          <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
            Title
          </div>
          <div className="text-[13px]">{meta.title}</div>
        </div>
      )}
      {meta?.description && (
        <div className="[margin-block-end:8px] last:[margin-block-end:0]">
          <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
            Description
          </div>
          <div className="text-[13px]">{meta.description}</div>
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
              {config.systemRole as string}
            </Markdown>
          </div>
        </div>
      )}
      {config?.model && (
        <div className="[margin-block-end:8px] last:[margin-block-end:0]">
          <div className="[margin-block-end:4px] text-xs leading-[inherit] font-medium text-muted-foreground">
            Model
          </div>
          <div className="text-[13px]">{config.model as string}</div>
        </div>
      )}
    </div>
  );
});

UpdateAgentRender.displayName = 'UpdateAgentRender';

export default UpdateAgentRender;
