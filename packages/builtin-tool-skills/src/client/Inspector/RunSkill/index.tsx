'use client';
import { SkillsIcon } from '@lobehub/ui/icons';
import { AGENT_SKILLS_IDENTIFIER_PREFIX } from '@orvilo/const';
import { type BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ActivateSkillParams, ActivateSkillSource, ActivateSkillState } from '../../../types';

type SkillLabelKey =
  | 'builtins.orvilo-skills.apiName.activateAgentSkill'
  | 'builtins.orvilo-skills.apiName.activateDeviceSkill'
  | 'builtins.orvilo-skills.apiName.activateProjectSkill'
  | 'builtins.orvilo-skills.apiName.activateSkill';

/**
 * Resolve the inspector label key. State-side `source` is the authority once the
 * tool result has streamed in; while args are still streaming we only have the
 * raw `name` to go on, so detect agent skills via the identifier prefix as a
 * best-effort fallback. Filesystem skills can't be inferred from the bare name
 * (no prefix), so they show "Activate Skill" until the result lands.
 */
const resolveLabelKey = (
  source: ActivateSkillSource | undefined,
  rawName: string | undefined,
): SkillLabelKey => {
  const effective: ActivateSkillSource =
    source ?? (rawName?.startsWith(AGENT_SKILLS_IDENTIFIER_PREFIX) ? 'agent' : 'builtin');

  switch (effective) {
    case 'agent': {
      return 'builtins.orvilo-skills.apiName.activateAgentSkill';
    }
    case 'device': {
      return 'builtins.orvilo-skills.apiName.activateDeviceSkill';
    }
    case 'project': {
      return 'builtins.orvilo-skills.apiName.activateProjectSkill';
    }
    default: {
      return 'builtins.orvilo-skills.apiName.activateSkill';
    }
  }
};

const styles = {
  chip: 'overflow-hidden inline-flex shrink gap-1.5 items-center min-w-0 max-w-full ms-1.5 py-[3px] ps-2.5 pe-2.5 border border-sidebar-border rounded-full bg-card',
  skillIcon: 'shrink-0 text-[var(--ant-color-text-description)]',
  skillName: 'truncate min-w-0 text-xs leading-[inherit] text-foreground',
};

export const RunSkillInspector = memo<
  BuiltinInspectorProps<ActivateSkillParams, ActivateSkillState>
>(({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
  const { t } = useTranslation('plugin');

  const name = args?.name || partialArgs?.name;
  const displayName = pluginState?.title || pluginState?.name || name;
  const label = t(resolveLabelKey(pluginState?.source, name));

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

RunSkillInspector.displayName = 'RunSkillInspector';
