'use client';

import { Markdown } from '@lobehub/ui';
import { type BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ActivateSkillParams, ActivateSkillState } from '../../../types';

const styles = {
  container:
    'overflow-hidden w-full border border-sidebar-border rounded-[var(--radius-overlay)] bg-card',
  content: 'py-2 ps-4 pe-4 text-sm leading-[inherit]',
  description: 'text-xs leading-[inherit] text-muted-foreground',
  header: 'py-2 ps-3 pe-3 [border-block-end:1px_solid_var(--sidebar-border)]',
  name: 'font-medium',
};

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
