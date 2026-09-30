import { GlobeOffIcon } from '@lobehub/ui/icons';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { type LucideIcon } from 'lucide-react';
import { SparkleIcon } from 'lucide-react';
import { createElement, memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Separator } from '@/components/ui/separator';
import { usePermission } from '@/hooks/usePermission';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';
import { aiModelSelectors, aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { type SearchMode } from '@/types/search';

import { useAgentId } from '../../hooks/useAgentId';
import { useEffectiveModel } from '../../hooks/useEffectiveModel';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';
import FCSearchModel from './FCSearchModel';
import ModelBuiltinSearch from './ModelBuiltinSearch';

const styles = createStaticStyles(({ css }) => ({
  active: css`
    background: ${cssVar.colorFillTertiary};
  `,
  check: css`
    margin-inline-start: 12px;
    font-size: 16px;
    color: ${cssVar.colorPrimary};
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
      key={value}
      className={cx(
        'flex flex-row items-start gap-3',
        cx(styles.option, mode === value && styles.active),
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
  const { allowed: canCreate } = usePermission('create_content');

  const { model, provider } = useEffectiveModel(agentId);
  const [useModelBuiltinSearch, searchMode] = useAgentStore((s) => [
    chatConfigByIdSelectors.getUseModelBuiltinSearchById(agentId)(s),
    chatConfigByIdSelectors.getChatConfigById(agentId)(s).searchMode,
  ]);

  const supportFC = useAiInfraStore(aiModelSelectors.isModelSupportToolUse(model, provider));
  const isProviderHasBuiltinSearchConfig = useAiInfraStore(
    aiProviderSelectors.isProviderHasBuiltinSearchConfig(provider),
  );
  const isModelHasBuiltinSearchConfig = useAiInfraStore(
    aiModelSelectors.isModelHasBuiltinSearchConfig(model, provider),
  );
  const isModelBuiltinSearchInternal = useAiInfraStore(
    aiModelSelectors.isModelBuiltinSearchInternal(model, provider),
  );
  const modelBuiltinSearchImpl = useAiInfraStore(
    aiModelSelectors.modelBuiltinSearchImpl(model, provider),
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
          icon: GlobeOffIcon,
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

  const showFCSearchModel =
    !supportFC &&
    (!modelBuiltinSearchImpl || (!isModelBuiltinSearchInternal && !useModelBuiltinSearch));

  const showDivider = showModelBuiltinSearch || showFCSearchModel;

  return (
    <div className="flex flex-col gap-1">
      {options.map((option) => (
        <Item {...option} key={option.value} />
      ))}
      {showDivider && <Separator style={{ margin: 0 }} />}
      {showModelBuiltinSearch && <ModelBuiltinSearch disabled={!canCreate} />}
      {showFCSearchModel && <FCSearchModel disabled={!canCreate} />}
    </div>
  );
});

export default Controls;
