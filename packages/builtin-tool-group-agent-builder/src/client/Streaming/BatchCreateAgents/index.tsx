'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import { Separator } from '@/components/ui/separator';
import ToolTag from '@/features/ToolTag';

import type { BatchCreateAgentsParams } from '../../../types';

const styles = {
  description: 'line-clamp-1 text-ellipsis leading-[1.5] text-[var(--ant-color-text-description)]',
  index: 'shrink-0 text-[12px] text-[var(--ant-color-text-quaternary)]',
  item: 'px-3 py-2.5 not-last:[border-block-end:1px_dashed_var(--sidebar-border)]',
  systemRole:
    'line-clamp-3 text-ellipsis text-[12px] leading-[1.5] text-[var(--ant-color-text-tertiary)]',
  title: 'truncate text-[13px] font-medium',
};

export const BatchCreateAgentsStreaming = memo<BuiltinStreamingProps<BatchCreateAgentsParams>>(
  ({ args }) => {
    const { agents } = args || {};

    if (!agents || agents.length === 0) return null;

    return (
      <div className="w-full rounded-[var(--ant-border-radius)] border border-sidebar-border bg-card">
        {agents.map((agent, index) => (
          <div className={cn('flex', 'items-start', 'gap-2', styles.item)} key={index}>
            <div className={styles.index}>{index + 1}.</div>
            <Avatar
              avatar={agent.avatar}
              size={24}
              style={{ flexShrink: 0, marginTop: 4 }}
              title={agent.title}
            />
            <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 0, overflow: 'hidden' }}>
              <span className={styles.title}>{agent.title}</span>
              {agent.description && <span className={styles.description}>{agent.description}</span>}
              {agent.tools && agent.tools.length > 0 && (
                <div className="flex gap-1 flex-wrap" style={{ marginTop: 8 }}>
                  {agent.tools.map((tool) => (
                    <ToolTag identifier={tool} key={tool} />
                  ))}
                </div>
              )}
              <Separator />
              {agent.systemRole && (
                <div className={styles.systemRole}>
                  <Markdown animated variant={'chat'}>
                    {agent.systemRole}
                  </Markdown>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  },
);

BatchCreateAgentsStreaming.displayName = 'BatchCreateAgentsStreaming';

export default BatchCreateAgentsStreaming;
