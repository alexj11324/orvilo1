'use client';

import { type BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { type TFunction } from 'i18next';
import { type ComponentProps, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { inspectorTextStyles, shinyTextStyles } from '@/styles';

import type { ActivateSkillParams, ActivateSkillSource, ActivateSkillState } from '../../../types';

/** Exact Skills vector; MIT Copyright (c) 2023 LobeHub, see SkillsIcon.LICENSE. */
const SkillsIcon = memo<ComponentProps<'svg'> & { size?: number | string }>(
  ({ size = 24, className, children, ...props }) => (
    <svg
      aria-hidden={props.role || props['aria-label'] || props['aria-labelledby'] ? undefined : true}
      className={cn('lucide lucide-skills', className)}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M15.4434 2.31193C14.545 1.80659 13.4501 1.79785 12.5438 2.28878L3.04743 7.43264C2.40205 7.78222 2 8.45724 2 9.19122V16.8303C2 17.5529 2.38972 18.2192 3.01948 18.5735L8.55657 21.6881C9.45496 22.1934 10.5499 22.2022 11.4562 21.7112L20.9526 16.5674C21.598 16.2178 22 15.5428 22 14.8088V7.1697C22 6.44715 21.6103 5.78078 20.9805 5.42654L15.4434 2.31193Z" />
      <path d="M22 6 11.456 11.711C10.55 12.202 9.455 12.193 8.557 11.688L2 8M22 11 11.456 16.711C10.55 17.202 9.455 17.193 8.557 16.688L2 13M10 12V22" />
      {children}
    </svg>
  ),
);
SkillsIcon.displayName = 'SkillsIcon';

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
  chip: 'overflow-hidden inline-flex shrink gap-1.5 items-center min-w-0 max-w-full ms-1.5 py-0.75 ps-2.5 pe-2.5 border border-sidebar-border rounded-full bg-card',
  skillIcon: 'shrink-0 text-foreground-description',
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
