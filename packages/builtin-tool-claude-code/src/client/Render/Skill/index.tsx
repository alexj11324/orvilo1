'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { Sparkles } from 'lucide-react';
import { memo } from 'react';

import type { SkillArgs } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    padding-block: 4px;
  `,
  header: css`
    padding-inline: 4px;
    color: ${cssVar.colorTextSecondary};
  `,
  previewBox: css`
    overflow: hidden;

    padding-block: 4px;
    padding-inline: 8px;
    border-radius: 8px;

    background: ${cssVar.colorFillTertiary};
  `,
}));

const Skill = memo<BuiltinRenderProps<SkillArgs>>(({ args, content }) => {
  const skillName = args?.skill;

  return (
    <div className={cx('flex flex-col gap-2', styles.container)}>
      <div className={cx('flex flex-row items-center gap-2', styles.header)}>
        <span className="anticon" role="img">
          <Sparkles fill={'transparent'} height={'14'} size={'14'} width={'14'} />
        </span>
        <div className="font-semibold">{skillName || 'Skill'}</div>
      </div>

      {content && (
        <div className={cx('flex flex-col', styles.previewBox)}>
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
