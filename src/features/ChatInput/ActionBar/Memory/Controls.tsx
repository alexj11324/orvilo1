import { BrainOffIcon } from '@lobehub/ui/icons';
import { type UserMemoryEffort } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { type LucideIcon } from 'lucide-react';
import { Brain } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import LevelSlider from '@/components/LevelSlider';
import { Separator } from '@/components/ui/separator';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';
import { useMemoryEnabled } from './useMemoryEnabled';

const MEMORY_EFFORT_LEVELS: readonly UserMemoryEffort[] = ['low', 'medium', 'high'];

const styles = createStaticStyles(({ css }) => ({
  active: css`
    background: ${cssVar.colorFillTertiary};
  `,
  description: css`
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
  `,
  icon: css`
    border: 1px solid ${cssVar.colorFillTertiary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorBgElevated};
  `,
  option: css`
    cursor: pointer;

    width: 100%;
    padding-block: 8px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    transition: background-color 0.2s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  title: css`
    font-size: 14px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

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
      className={cx(
        'flex flex-row items-start gap-3',
        cx(styles.option, isActive && styles.active),
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
        className={cx(
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
