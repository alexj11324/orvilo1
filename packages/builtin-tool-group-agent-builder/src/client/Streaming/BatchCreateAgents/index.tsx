'use client';

import { Markdown } from '@lobehub/ui';
import { Avatar } from '@lobehub/ui/base-ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import { Separator } from '@/components/ui/separator';
import ToolTag from '@/features/ToolTag';

import type { BatchCreateAgentsParams } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  description: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    line-height: 1.5;
    color: ${cssVar.colorTextDescription};
    text-overflow: ellipsis;
  `,
  index: css`
    flex-shrink: 0;
    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
  `,
  item: css`
    padding-block: 10px;
    padding-inline: 12px;

    &:not(:last-child) {
      border-block-end: 1px dashed ${cssVar.colorBorderSecondary};
    }
  `,
  systemRole: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;

    font-size: 12px;
    line-height: 1.5;
    color: ${cssVar.colorTextTertiary};
    text-overflow: ellipsis;
  `,
  title: css`
    overflow: hidden;

    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

export const BatchCreateAgentsStreaming = memo<BuiltinStreamingProps<BatchCreateAgentsParams>>(
  ({ args }) => {
    const { agents } = args || {};

    if (!agents || agents.length === 0) return null;

    return (
      <div
        style={{
          background: cssVar.colorBgContainer,
          border: `1px solid ${cssVar.colorBorderSecondary}`,
          borderRadius: cssVar.borderRadius,
          width: '100%',
        }}
      >
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
