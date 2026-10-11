'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { Sparkles } from 'lucide-react';
import { memo } from 'react';

import type { SkillArgs } from '../../../types';

const styles = {
  container: 'py-1 text-sm leading-5.5',
  header: 'px-1 text-muted-foreground',
  previewBox: 'overflow-hidden rounded-(--radius-card) bg-muted px-2 py-1',
};

const Skill = memo<BuiltinRenderProps<SkillArgs>>(({ args, content }) => {
  const skillName = args?.skill;

  return (
    <div className={cn('flex flex-col gap-2', styles.container)}>
      <div className={cn('flex flex-row items-center gap-2', styles.header)}>
        <span className="anticon" role="img">
          <Sparkles fill={'transparent'} height={'14'} size={'14'} width={'14'} />
        </span>
        <div className="font-semibold">{skillName || 'Skill'}</div>
      </div>

      {content && (
        <div className={cn('flex flex-col', styles.previewBox)}>
          <Markdown style={{ maxHeight: 240, overflow: 'auto' }} variant={'chat'}>
            {content}
          </Markdown>
        </div>
      )}
    </div>
  );
});

Skill.displayName = 'ClaudeCodeSkill';

export default Skill;
