import { BrainOffIcon } from '@lobehub/ui/icons';
import { type UserMemoryEffort } from '@orvilo/types';
import { cn } from 'cn';
import { type LucideIcon } from 'lucide-react';
import { Brain } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import LevelSlider from '@/components/LevelSlider';
import { Separator } from '@/components/ui/separator';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useAgentId } from '../../hooks/useAgentId';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';
import { useMemoryEnabled } from './useMemoryEnabled';

const MEMORY_EFFORT_LEVELS: readonly UserMemoryEffort[] = ['low', 'medium', 'high'];

const styles = {
  active: 'bg-accent',
  description: 'text-[12px] text-(--ant-color-text-description)',
  icon: 'border border-accent rounded-(--ant-border-radius) bg-popover',
  option:
    'cursor-pointer w-full p-2 rounded-(--ant-border-radius) transition-[background-color] duration-200 ease-[ease] hover:bg-accent',
  title: 'text-[14px] font-medium text-foreground',
};

interface ToggleOption {
  description: string;
  icon: LucideIcon;
  label: string;
  value: 'off' | 'on';
}

const ToggleItem = memo<ToggleOption>(({ value, description, icon, label }) => {
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();
  const isEnabled = useMemoryEnabled(agentId);
  const { allowed: canCreate } = usePermission('create_content');

  const isActive = value === 'on' ? isEnabled : !isEnabled;

  return (
    <div
      {...clickableProps()}
      className={cn(
        cn('flex flex-row items-start gap-3', cn(styles.option, isActive && styles.active)),
        CLICKABLE_FOCUS_RING,
      )}
      style={{
        cursor: canCreate ? undefined : 'not-allowed',
        opacity: canCreate ? undefined : 0.5,
      }}
      onClick={async () => {
        if (!canCreate) return;
        await updateAgentChatConfig({ memory: { enabled: value === 'on' } });
      }}
    >
      <div
        className={cn(
          'flex flex-col items-center justify-center flex-none h-[32px] w-[32px]',
          styles.icon,
        )}
      >
        <span className="anticon" role="img">
          {createElement(icon, { size: '1em', width: '1em', height: '1em', fill: 'transparent' })}
        </span>
      </div>
      <div className="flex flex-col flex-1">
        <div className={styles.title}>{label}</div>
        <div className={styles.description}>{description}</div>
      </div>
    </div>
  );
});

const Controls = memo(() => {
  const { t } = useTranslation('chat');
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();
  const isEnabled = useMemoryEnabled(agentId);
  const { allowed: canCreate } = usePermission('create_content');
  const effort = useAgentStore((s) => chatConfigByIdSelectors.getMemoryToolEffortById(agentId)(s));

  const toggleOptions: ToggleOption[] = [
    {
      description: t('memory.off.desc'),
      icon: BrainOffIcon,
      label: t('memory.off.title'),
      value: 'off',
    },
    {
      description: t('memory.on.desc'),
      icon: Brain,
      label: t('memory.on.title'),
      value: 'on',
    },
  ];

  return (
    <div className="flex flex-col gap-1">
      {toggleOptions.map((option) => (
        <ToggleItem {...option} key={option.value} />
      ))}
      {isEnabled && (
        <>
          <Separator style={{ margin: 0 }} />
          <div className="flex flex-row items-center gap-4 p-2">
            <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 100 }}>
              <div className={styles.title}>{t('memory.effort.title')}</div>
              <div className={styles.description}>{t('memory.effort.desc')}</div>
            </div>
            <div
              className="flex flex-col flex-1"
              style={{
                opacity: canCreate ? undefined : 0.5,
                pointerEvents: canCreate ? undefined : 'none',
              }}
            >
              <LevelSlider<UserMemoryEffort>
                defaultValue="medium"
                levels={MEMORY_EFFORT_LEVELS}
                value={effort}
                marks={{
                  0: t('memory.effort.low.title'),
                  1: t('memory.effort.medium.title'),
                  2: t('memory.effort.high.title'),
                }}
                onChange={async (value) => {
                  if (!canCreate) return;
                  await updateAgentChatConfig({ memory: { effort: value, enabled: true } });
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default Controls;
