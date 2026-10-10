import { cn } from 'cn';
import { GlobeOff, type LucideIcon, SparkleIcon } from 'lucide-react';
import { createElement, memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Separator } from '@/components/ui/separator';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';
import { aiModelSelectors, aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { type SearchMode } from '@/types/search';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useAgentId } from '../../hooks/useAgentId';
import { useEffectiveModel } from '../../hooks/useEffectiveModel';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';
import ModelBuiltinSearch from './ModelBuiltinSearch';

const styles = {
  active: 'bg-accent',
  description: 'text-[12px] text-(--ant-color-text-description)',
  icon: 'border border-accent rounded-(--ant-border-radius) bg-popover',
  option:
    'cursor-pointer w-full p-2 rounded-(--ant-border-radius) transition-[background-color] duration-200 ease-[ease] hover:bg-accent',
  title: 'text-[14px] font-medium text-foreground',
  check: 'ms-3 text-[16px] text-primary',
};

interface NetworkOption {
  description: string;
  disable?: boolean;
  icon: LucideIcon;
  label: string;
  value: SearchMode;
}

const Item = memo<NetworkOption>(({ value, description, icon, label }) => {
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();
  const mode = useAgentStore((s) => chatConfigByIdSelectors.getSearchModeById(agentId)(s));
  const { allowed: canCreate } = usePermission('create_content');

  return (
    <div
      {...clickableProps()}
      key={value}
      className={cn(
        cn('flex flex-row items-start gap-3', cn(styles.option, mode === value && styles.active)),
        CLICKABLE_FOCUS_RING,
      )}
      style={{
        cursor: canCreate ? undefined : 'not-allowed',
        opacity: canCreate ? undefined : 0.5,
      }}
      onClick={async () => {
        if (!canCreate) return;
        await updateAgentChatConfig({ searchMode: value });
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
  const { allowed: canCreate } = usePermission('create_content');

  const { model, provider } = useEffectiveModel(agentId);
  const searchMode = useAgentStore(
    (s) => chatConfigByIdSelectors.getChatConfigById(agentId)(s).searchMode,
  );
  const isProviderHasBuiltinSearchConfig = useAiInfraStore(
    aiProviderSelectors.isProviderHasBuiltinSearchConfig(provider),
  );
  const isModelHasBuiltinSearchConfig = useAiInfraStore(
    aiModelSelectors.isModelHasBuiltinSearchConfig(model, provider),
  );
  const isModelBuiltinSearchInternal = useAiInfraStore(
    aiModelSelectors.isModelBuiltinSearchInternal(model, provider),
  );

  useEffect(() => {
    if (!canCreate) return;
    if (isModelBuiltinSearchInternal && (searchMode ?? 'auto') === 'off') {
      // Auto-correction for a model whose search can't be turned off — the user
      // didn't touch the toggle, so a rejected write must stay silent instead of
      // reporting a change they never made (automatic corrections must not trigger phantom save-error toasts).
      updateAgentChatConfig({ searchMode: 'auto' }, { showErrorMessage: false });
    }
  }, [canCreate, isModelBuiltinSearchInternal, searchMode, updateAgentChatConfig]);

  const options: NetworkOption[] = isModelBuiltinSearchInternal
    ? [
        {
          description: t('search.mode.auto.desc'),
          icon: SparkleIcon,
          label: t('search.mode.auto.title'),
          value: 'auto',
        },
      ]
    : [
        {
          description: t('search.mode.off.desc'),
          icon: GlobeOff,
          label: t('search.mode.off.title'),
          value: 'off',
        },
        {
          description: t('search.mode.auto.desc'),
          icon: SparkleIcon,
          label: t('search.mode.auto.title'),
          value: 'auto',
        },
      ];

  const showModelBuiltinSearch =
    searchMode !== 'off' &&
    !isModelBuiltinSearchInternal &&
    (isModelHasBuiltinSearchConfig || isProviderHasBuiltinSearchConfig);

  return (
    <div className="flex flex-col gap-1">
      {options.map((option) => (
        <Item {...option} key={option.value} />
      ))}
      {showModelBuiltinSearch && <Separator style={{ margin: 0 }} />}
      {showModelBuiltinSearch && <ModelBuiltinSearch disabled={!canCreate} />}
    </div>
  );
});

export default Controls;
