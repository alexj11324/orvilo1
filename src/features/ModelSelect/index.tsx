import { Flexbox, Tooltip, TooltipGroup } from '@lobehub/ui';
import { Button, Select, type SelectProps, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { type ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelItemRender, ProviderItemRender, TAG_CLASSNAME } from '@/components/ModelSelect';
import { ModelIcon } from '@/components/OrviloIcons';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { type EnabledProviderWithModels } from '@/types/aiProvider';

import { resolveStaleModelState } from './resolveStaleModelState';

const prefixCls = 'ant';

/**
 * Marks the stale-status Tag so the popup can hide it — inside the open list the
 * status is conveyed by the hint text, while the closed trigger keeps showing
 * the Tag.
 */
const STALE_TAG_CLASSNAME = 'orvilo-model-select-stale-tag';

/**
 * Marks the stale-model option row so the popup can hide the Select's built-in
 * selected-item check on it — the row already sits under the "Current selection"
 * group, so the extra check reads as contradictory and steals the row's right
 * edge.
 */
const STALE_OPTION_CLASSNAME = 'orvilo-model-select-stale-option';

/** Stable hook on every option's ItemIndicator so CSS can target it. */
const ITEM_INDICATOR_CLASSNAME = 'orvilo-model-select-item-indicator';

/**
 * Sentinel option value for the redirected-model remedy row ("update to
 * successor"). Intercepted in onChange so selecting it triggers the remedy
 * instead of a value change.
 */
const STALE_ACTION_VALUE = '__orvilo_model_select_stale_action__';

const styles = createStaticStyles(({ css, cssVar }) => ({
  popup: css`
    width: max(360px, var(--anchor-width));

    &.${prefixCls}-select-dropdown .${prefixCls}-select-item-option-grouped {
      padding-inline-start: 12px;
    }

    /* !important: the Tag's own class rule wins the cascade over this
     * descendant selector, so a plain display: none never applies. */
    .${STALE_TAG_CLASSNAME} {
      display: none !important;
    }

    .${STALE_OPTION_CLASSNAME} .${ITEM_INDICATOR_CLASSNAME} {
      display: none;
    }
  `,
  select: css`
    /* The base-ui Select applies className to the trigger root while the popup is
     * portaled away, so scoping directly under this class hides the popup-only
     * ability tags from the closed trigger without touching the list. */
    .${TAG_CLASSNAME} {
      display: none;
    }
  `,
  staleHint: css`
    font-size: 12px;
    line-height: 1.5;
    color: ${cssVar.colorTextTertiary};
    white-space: normal;
  `,
}));

interface ModelOption {
  abilities?: Record<string, boolean>;
  id: string;
  label: ReactNode;
  provider: string;
  value: string;
}

interface ModelSelectProps extends Pick<
  SelectProps,
  | 'allowClear'
  | 'disabled'
  | 'labelRender'
  | 'loading'
  | 'placeholder'
  | 'size'
  | 'style'
  | 'variant'
> {
  defaultValue?: { model: string; provider?: string };
  initialWidth?: boolean;
  modelType?: 'chat' | 'embedding';
  onChange?: (props: { model: string; provider: string }) => void;
  /** Fired when the selection is cleared via `allowClear`. */
  onClear?: () => void;
  popupWidth?: number;
  /** Restrict selection to these provider ids. */
  providerIds?: string[];
  requiredAbilities?: (keyof EnabledProviderWithModels['children'][number]['abilities'])[];
  showAbility?: boolean;
  /** `undefined` renders the empty state (`placeholder`) instead of a selection. */
  value?: { model: string; provider?: string };
}

const ModelSelect = memo<ModelSelectProps>(
  ({
    value,
    onChange,
    onClear,
    allowClear,
    placeholder,
    showAbility: _showAbility = true,
    requiredAbilities,
    loading,
    disabled,
    labelRender,
    size,
    style,
    variant,
    initialWidth = false,
    popupWidth,
    modelType = 'chat',
    providerIds,
  }) => {
    const { t } = useTranslation('components');
    const fullEnabledList = useAiInfraStore((s) =>
      modelType === 'embedding'
        ? aiProviderSelectors.enabledEmbeddingModelList(s)
        : s.enabledChatModelList || [],
    );
    const enabledList = useMemo(() => {
      if (!providerIds) return fullEnabledList;
      const allowedProviderIds = new Set(providerIds);
      return fullEnabledList.filter((provider) => allowedProviderIds.has(provider.id));
    }, [fullEnabledList, providerIds]);
    const builtinAiModelList = useAiInfraStore((s) => s.builtinAiModelList);
    const modelRedirects = useAiInfraStore((s) => s.modelRedirects);
    const isInitAiProviderRuntimeState = useAiInfraStore((s) => s.isInitAiProviderRuntimeState);

    const options = useMemo<SelectProps['options']>(() => {
      const getChatModels = (provider: EnabledProviderWithModels) => {
        const models =
          requiredAbilities && requiredAbilities.length > 0
            ? provider.children.filter((model) =>
                requiredAbilities.every((ability) => Boolean(model.abilities?.[ability])),
              )
            : provider.children;

        return models.map((model) => ({
          ...model,
          label: <ModelItemRender {...model} {...model.abilities} showInfoTag={false} />,
          provider: provider.id,
          title: model.displayName || model.id,
          value: `${provider.id}/${model.id}`,
        }));
      };

      if (enabledList.length === 1) {
        const provider = enabledList[0];

        return getChatModels(provider);
      }

      return enabledList
        .map((provider) => {
          const opts = getChatModels(provider);
          if (opts.length === 0) return undefined;

          return {
            label: (
              <ProviderItemRender
                logo={provider.logo}
                name={provider.name}
                provider={provider.id}
                source={provider.source}
              />
            ),
            options: opts,
          };
        })
        .filter(Boolean) as SelectProps['options'];
    }, [enabledList, requiredAbilities]);

    const staleState = useMemo(() => {
      // Before the runtime state hydrates, the store lists are empty and any valid
      // persisted value would resolve to `removed` — treat pre-init as unknown so the
      // first paint never flashes an "Unavailable" warning.
      if (!isInitAiProviderRuntimeState) return;

      return resolveStaleModelState(value, {
        builtinAiModelList,
        enabledList,
        modelRedirects,
        modelType,
      });
    }, [
      builtinAiModelList,
      enabledList,
      isInitAiProviderRuntimeState,
      modelRedirects,
      modelType,
      value,
    ]);

    const finalOptions = useMemo<SelectProps['options']>(() => {
      if (!staleState || !value) return options;

      const { meta, status } = staleState;
      const successorName = staleState.successor?.displayName || staleState.successorId;

      // The trigger renders the selected option's `label`, so the hint stays out
      // of it and lives on `popupLabel`, which only `optionRender` reads.
      const renderStaleLabel = (withPopupExtras: boolean) => (
        <Flexbox gap={4} style={{ width: '100%' }}>
          <Flexbox horizontal align={'center'} gap={8}>
            <ModelIcon model={value.model} size={20} />
            <Text ellipsis style={{ fontSize: 14 }}>
              {meta?.displayName || value.model}
            </Text>
            <Tooltip title={t(`ModelSelect.staleModel.${status}.tooltip`, { successorName })}>
              <Tag
                className={STALE_TAG_CLASSNAME}
                color={status === 'removed' ? 'warning' : undefined}
                size={'small'}
                style={{ cursor: 'default', flex: 'none' }}
              >
                {t(`ModelSelect.staleModel.${status}.tag`)}
              </Tag>
            </Tooltip>
          </Flexbox>
          {withPopupExtras && (
            <span className={styles.staleHint}>
              {t(`ModelSelect.staleModel.${status}.hint`, { successorName })}
            </span>
          )}
        </Flexbox>
      );

      const currentOption = {
        __stale: true,
        className: STALE_OPTION_CLASSNAME,
        disabled: true,
        label: renderStaleLabel(false),
        popupLabel: renderStaleLabel(true),
        value: `${value.provider}/${value.model}`,
      };

      // Only the redirected remedy ("update to successor") gets a dedicated
      // action row; notEnabled/removed are informational — model management is
      // retired, so the remedy is picking another model.
      const actionLabel =
        status === 'redirected'
          ? t('ModelSelect.staleModel.redirected.action', { successorName })
          : undefined;

      const actionOption = actionLabel
        ? {
            __stale: true,
            label: (
              <Flexbox horizontal>
                {/* Visual-only button: the sentinel option row owns the click (via
                 * onChange), so pointer events are disabled to keep one hit target. */}
                <Button size={'small'} style={{ pointerEvents: 'none' }}>
                  {actionLabel}
                </Button>
              </Flexbox>
            ),
            value: STALE_ACTION_VALUE,
          }
        : undefined;

      return [
        {
          label: t('ModelSelect.staleModel.current'),
          options: [currentOption, actionOption].filter(Boolean),
        },
        ...(options ?? []),
      ] as SelectProps['options'];
    }, [options, staleState, t, value]);

    return (
      <TooltipGroup>
        <Select
          allowClear={allowClear}
          className={styles.select}
          classNames={{ itemIndicator: ITEM_INDICATOR_CLASSNAME }}
          defaultValue={value ? `${value.provider}/${value.model}` : null}
          disabled={disabled}
          labelRender={labelRender}
          loading={loading}
          options={finalOptions}
          placeholder={placeholder}
          popupClassName={styles.popup}
          popupMatchSelectWidth={popupWidth === undefined ? false : popupWidth}
          size={size}
          value={value ? `${value.provider}/${value.model}` : null}
          variant={variant}
          optionRender={(option) => {
            const stale = option as unknown as { __stale?: boolean; popupLabel?: ReactNode };
            if (stale.__stale) return stale.popupLabel ?? option.label;

            return (
              <ModelItemRender
                {...(option as ModelOption)}
                {...(option as ModelOption).abilities}
                showInfoTag={false}
              />
            );
          }}
          style={{
            minWidth: 200,
            width: initialWidth ? 'initial' : undefined,
            ...style,
          }}
          onChange={(next, option) => {
            if (next == null) {
              onClear?.();
              return;
            }
            if (next === STALE_ACTION_VALUE) {
              if (
                staleState?.status === 'redirected' &&
                staleState.successorId &&
                value?.provider
              ) {
                onChange?.({ model: staleState.successorId, provider: value.provider });
              }
              return;
            }

            const model = next.split('/').slice(1).join('/');
            onChange?.({ model, provider: (option as unknown as ModelOption).provider });
          }}
        />
      </TooltipGroup>
    );
  },
);

export default ModelSelect;
