'use client';

import { SkillsIcon } from '@lobehub/ui/icons';
import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ClaudeCodeApiName, type SkillArgs } from '../../types';

const styles = {
  chip: 'overflow-hidden inline-flex shrink gap-1.5 items-center min-w-0 ms-1.5 py-0.5 px-2.5 rounded-[999px] bg-accent',
  skillIcon: 'shrink-0 text-[var(--ant-color-text-description)]',
  skillName: 'overflow-hidden min-w-0 text-[12px] text-foreground text-ellipsis whitespace-nowrap',
};

export const SkillInspector = memo<BuiltinInspectorProps<SkillArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t(ClaudeCodeApiName.Skill as any);
    const skillName = args?.skill || partialArgs?.skill;

    if (isArgumentsStreaming && !skillName) {
      return <div className={cn(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{label}</div>;
    }

    return (
      <div className={inspectorTextStyles.root}>
        <span className={cn((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {label}
        </span>
        {skillName && (
          <span className={styles.chip}>
            <SkillsIcon className={styles.skillIcon} size={12} />
            <span className={styles.skillName}>{skillName}</span>
          </span>
        )}
      </div>
    );
  },
);

SkillInspector.displayName = 'ClaudeCodeSkillInspector';
