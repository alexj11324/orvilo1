import { confirmModal, toast } from '@lobehub/ui/base-ui';
import { cn } from 'cn';
import { LucidePencil, TrashIcon } from 'lucide-react';
import { type AiProviderModelListItem } from 'model-bank';
import { AiModelSourceEnum } from 'model-bank/aiModel';
import { memo, use, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { ModelInfoTags } from '@/components/ModelSelect';
import NewModelBadge from '@/components/ModelSelect/NewModelBadge';
import { ModelIcon } from '@/components/OrviloIcons';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePermission } from '@/hooks/usePermission';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';
import { formatPriceByCurrency } from '@/utils/format';
import {
  getAudioInputUnitRate,
  getTextInputUnitRate,
  getTextOutputUnitRate,
} from '@/utils/pricing';

import { createModelConfigModal } from './ModelConfigModal';
import ModelIdChip from './ModelIdChip';
import { ProviderSettingsContext } from './ProviderSettingsContext';

interface ModelItemProps extends AiProviderModelListItem {
  enabled: boolean;
  id: string;
  isAzure?: boolean;
  releasedAt?: string;
  removed?: boolean;
}

const ModelItem = memo<ModelItemProps>(
  ({
    displayName,
    id,
    enabled,
    // removed,
    releasedAt,
    pricing,
    source,
    contextWindowTokens,
    abilities,
    type,
  }) => {
    const { t } = useTranslation(['modelProvider', 'components', 'models', 'common']);
    const { modelEditable, showDeployName } = use(ProviderSettingsContext);
    const { allowed: canManageProvider, reason } = usePermission('manage_provider_key');

    const [activeAiProvider, isModelLoading, toggleModelEnabled, removeAiModel] = useAiInfraStore(
      (s) => [
        s.activeAiProvider,
        aiModelSelectors.isModelLoading(id)(s),
        s.toggleModelEnabled,
        s.removeAiModel,
      ],
    );

    const [checked, setChecked] = useState(enabled);

    const formatPricing = (): string[] => {
      if (!pricing) return [];

      switch (type) {
        case 'chat': {
          const inputRate = getTextInputUnitRate(pricing);
          const outputRate = getTextOutputUnitRate(pricing);
          return [
            typeof inputRate === 'number' &&
              t('providerModels.item.pricing.inputTokens', {
                amount: formatPriceByCurrency(inputRate, pricing?.currency),
              }),
            typeof outputRate === 'number' &&
              t('providerModels.item.pricing.outputTokens', {
                amount: formatPriceByCurrency(outputRate, pricing?.currency),
              }),
          ].filter(Boolean) as string[];
        }
        case 'embedding': {
          const inputRate = getTextInputUnitRate(pricing);
          return [
            typeof inputRate === 'number' &&
              t('providerModels.item.pricing.inputTokens', {
                amount: formatPriceByCurrency(inputRate, pricing?.currency),
              }),
          ].filter(Boolean) as string[];
        }
        case 'tts': {
          const inputRate = getAudioInputUnitRate(pricing);
          return [
            typeof inputRate === 'number' &&
              t('providerModels.item.pricing.inputCharts', {
                amount: formatPriceByCurrency(inputRate, pricing?.currency),
              }),
          ].filter(Boolean) as string[];
        }
        case 'asr': {
          const inputRate = getAudioInputUnitRate(pricing);
          return [
            typeof inputRate === 'number' &&
              t('providerModels.item.pricing.inputMinutes', {
                amount: formatPriceByCurrency(inputRate, pricing?.currency),
              }),
          ].filter(Boolean) as string[];
        }

        case 'image': {
          return [];
        }

        default: {
          return [];
        }
      }
    };

    const content = [
      releasedAt && t('providerModels.item.releasedAt', { releasedAt }),
      ...formatPricing(),
    ].filter(Boolean) as string[];

    const isMobile = useIsMobile();

    const NewTag = <NewModelBadge releasedAt={releasedAt} />;

    const ModelIdTag = <ModelIdChip id={id} />;

    const canToggle = modelEditable || type !== 'embedding';

    const EnableSwitch = canToggle ? (
      <Switch
        aria-label={displayName || id}
        checked={checked}
        disabled={!canManageProvider || isModelLoading}
        onCheckedChange={async (e) => {
          if (!canManageProvider) return;
          setChecked(e);
          await toggleModelEnabled({ enabled: e, id, source, type });
        }}
      />
    ) : null;

    const Actions =
      modelEditable &&
      ((alwaysVisible?: boolean) => (
        <div
          className={cn(
            'flex items-center transition-opacity',
            !alwaysVisible &&
              'opacity-0 group-focus-within/model:opacity-100 group-hover/model:opacity-100',
          )}
        >
          <ActionIcon
            disabled={!canManageProvider}
            icon={LucidePencil}
            size={'small'}
            title={canManageProvider ? t('providerModels.item.config') : reason}
            onClick={(e) => {
              e.stopPropagation();
              if (!canManageProvider) return;
              createModelConfigModal({ id, showDeployName });
            }}
          />
          {source !== AiModelSourceEnum.Builtin && (
            <ActionIcon
              disabled={!canManageProvider}
              icon={TrashIcon}
              size={'small'}
              title={canManageProvider ? t('providerModels.item.delete.title') : reason}
              onClick={() => {
                if (!canManageProvider) return;
                confirmModal({
                  cancelText: t('cancel', { ns: 'common' }),
                  content: t('providerModels.item.delete.confirm', {
                    displayName: displayName || id,
                  }),
                  okButtonProps: {
                    danger: true,
                  },
                  okText: t('delete', { ns: 'common' }),
                  onOk: async () => {
                    await removeAiModel(id, activeAiProvider!);
                    toast.success(t('providerModels.item.delete.success'));
                  },
                  title: t('providerModels.item.delete.title'),
                });
              }}
            />
          )}
        </div>
      ));

    const dom = isMobile ? (
      <div className="flex w-full items-center justify-between gap-3 px-1.5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <ModelIcon model={id} size={32} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {displayName || id}
              <ModelInfoTags
                placement={'top'}
                {...abilities}
                contextWindowTokens={contextWindowTokens}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ModelIdTag}
              {NewTag}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {Actions && Actions(true)}
          {EnableSwitch}
        </div>
      </div>
    ) : (
      <div className="group/model flex min-h-11 w-full items-center justify-between gap-6 border-t border-border px-4 py-1.5 transition-colors first:border-t-0 hover:bg-accent">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ModelIcon model={id} size={32} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{displayName || id}</span>
              {ModelIdTag}
              {NewTag}
              {Actions && Actions()}
            </div>
            {content.length > 0 && (
              <div className="truncate text-xs text-muted-foreground">{content.join(' · ')}</div>
            )}
          </div>
        </div>
        <div className="flex flex-none items-center gap-3">
          <ModelInfoTags
            placement={'top'}
            {...abilities}
            contextWindowTokens={contextWindowTokens}
          />
          {EnableSwitch}
        </div>
      </div>
    );

    return dom;
  },
);

export default ModelItem;
