'use client';

import { Markdown } from '@lobehub/ui';
import { type BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ActivateSkillParams, ActivateSkillState } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
  `,
  content: css`
    padding-block: 8px;
    padding-inline: 16px;
    font-size: 14px;
  `,
  description: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  header: css`
    padding-block: 8px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  name: css`
    font-weight: 500;
  `,
}));

const ActivateSkill = memo<BuiltinRenderProps<ActivateSkillParams, ActivateSkillState>>(
  ({ content, pluginState }) => {
    const { description, name, title } = pluginState || {};
    const displayName = title || name;

    if (!displayName) return null;

    return (
      <div className={cn('flex', 'flex-col', styles.container)}>
        <div className={cn('flex', 'flex-col', 'gap-1', styles.header)}>
          <span className={styles.name}>{displayName}</span>
          {description && <span className={styles.description}>{description}</span>}
        </div>
        {content && (
          <ScrollArea className={styles.content} style={{ maxHeight: 400 }}>
            <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
              {content}
            </Markdown>
          </ScrollArea>
        )}
      </div>
    );
  },
);

export default ActivateSkill;
