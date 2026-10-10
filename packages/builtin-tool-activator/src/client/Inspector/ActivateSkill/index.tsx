'use client';

import { SkillsIcon } from '@lobehub/ui/icons';
import { type BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { type TFunction } from 'i18next';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ActivateSkillParams, ActivateSkillSource, ActivateSkillState } from '../../../types';

/**
 * `t` is invoked with literal keys per branch so i18next's typed-key map can
 * still validate the call site.
 */
const resolveLabel = (t: TFunction<'plugin'>, source: ActivateSkillSource | undefined): string => {
  switch (source) {
    case 'agent': {
      return t('builtins.orvilo-skills.apiName.activateAgentSkill');
    }
    case 'device': {
      return t('builtins.orvilo-skills.apiName.activateDeviceSkill');
    }
    case 'project': {
      return t('builtins.orvilo-skills.apiName.activateProjectSkill');
    }
    default: {
      return t('builtins.orvilo-skills.apiName.activateSkill');
    }
  }
};

const styles = {
  chip: 'overflow-hidden inline-flex shrink gap-1.5 items-center min-w-0 max-w-full ms-1.5 py-[3px] ps-2.5 pe-2.5 border border-sidebar-border rounded-full bg-card',
  skillIcon: 'shrink-0 text-[var(--ant-color-text-description)]',
  skillName: 'truncate min-w-0 text-xs leading-[inherit] text-foreground',
};

export const ActivateSkillInspector = memo<
  BuiltinInspectorProps<ActivateSkillParams, ActivateSkillState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const name = args?.name || partialArgs?.name;
  const displayName = pluginState?.title || pluginState?.name || name;
  const label = resolveLabel(t, pluginState?.source);

  if (isArgumentsStreaming) {
    if (!displayName)
      return (
        <div className={inspectorTextStyles.root}>
          <span className={shinyTextStyles.shinyText}>{label}</span>
        </div>
      );

    return (
      <div className={inspectorTextStyles.root}>
        <span className={shinyTextStyles.shinyText}>{label}:</span>
        <span className={styles.chip}>
          <SkillsIcon className={styles.skillIcon} size={12} />
          <span className={styles.skillName}>{displayName}</span>
        </span>
      </div>
    );
  }

  return (
    <div className={inspectorTextStyles.root}>
      <span className={cn(isLoading && shinyTextStyles.shinyText)}>{label}:</span>
      {displayName && (
        <span className={styles.chip}>
          <SkillsIcon className={styles.skillIcon} size={12} />
          <span className={styles.skillName}>{displayName}</span>
        </span>
      )}
    </div>
  );
});

ActivateSkillInspector.displayName = 'ActivateSkillInspector';
