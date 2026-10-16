import { clsx } from 'cn';
import { XIcon } from 'lucide-react';
import { type CSSProperties, type ReactNode } from 'react';
import { memo, useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import { ModelItemRender, ProviderItemRender } from '@/components/ModelSelect';
import { ModelIcon } from '@/components/OrviloIcons';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { aiProviderSelectors, useAiInfraStore } from '@/store/aiInfra';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { type EnabledProviderWithModels } from '@/types/aiProvider';

import nativeStyles from './ModelSelect.module.css';
import { resolveEnableTargetProviderId, resolveStaleModelState } from './resolveStaleModelState';

/**
 * Marks the stale-status badge so the popup can hide it — inside the open list the
 * status is conveyed by the enable toggle (notEnabled) or the remedy row
 * (redirected), while the closed trigger keeps showing the badge.
 */
const STALE_TAG_CLASSNAME = 'orvilo-model-select-stale-tag';

/**
 * Marks the stale-model option row so the popup can hide the Select's built-in
 * selected-item check on it — the row already sits under the "Current selection"
 * group and (for notEnabled) renders an enable Switch, so the extra check reads
 * as contradictory and steals the row's right edge.
 */
const STALE_OPTION_CLASSNAME = 'orvilo-model-select-stale-option';

/**
 * Sentinel option value for the redirected-model remedy row ("update to
 * successor"). Intercepted in onChange so selecting it triggers the remedy
 * instead of a value change.
 */
const STALE_ACTION_VALUE = '__orvilo_model_select_stale_action__';

const styles = { popup: nativeStyles.popup, select: nativeStyles.select };

interface ModelOption {
  abilities?: Record<string, boolean>;
  id: string;
  label: ReactNode;
  provider: string;
  value: string;
}

/** An option row; stale rows also carry the popup-only label and a row class. */
interface SelectOption {
  [key: string]: unknown;
  __stale?: boolean;
  className?: string;
  disabled?: boolean;
  label: ReactNode;
  popupLabel?: ReactNode;
  value: string;
}

interface SelectOptionGroup {
  label: ReactNode;
  options: SelectOption[];
}

type SelectOptions = (SelectOption | SelectOptionGroup)[];

const isGroup = (option: SelectOption | SelectOptionGroup): option is SelectOptionGroup =>
  'options' in option;

interface ModelSelectProps {
  allowClear?: boolean;
  defaultValue?: { model: string; provider?: string };
  disabled?: boolean;
  initialWidth?: boolean;
  loading?: boolean;
  modelType?: 'chat' | 'embedding';
  onChange?: (props: { model: string; provider: string }) => void;
  /** Fired when the selection is cleared via `allowClear`. */
  onClear?: () => void;
  placeholder?: ReactNode;
  popupWidth?: number;
  /** Restrict selection to these provider ids. */
  providerIds?: string[];
  requiredAbilities?: (keyof EnabledProviderWithModels['children'][number]['abilities'])[];
  showAbility?: boolean;
  size?: 'large' | 'middle' | 'small';
  style?: CSSProperties;
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
    size,
    style,
    initialWidth = false,
    popupWidth,
    modelType = 'chat',
    providerIds,
  }) => {
    const { t } = useTranslation('components');
    const enableSwitchId = useId();
    const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
    const prefersReducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
    const disableMotion = animationMode === 'disabled' || prefersReducedMotion;
    const [enabling, setEnabling] = useState(false);
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
    const enabledAiProviders = useAiInfraStore((s) => s.enabledAiProviders);
    const isInitAiProviderRuntimeState = useAiInfraStore((s) => s.isInitAiProviderRuntimeState);
    const toggleProviderModelEnabled = useAiInfraStore((s) => s.toggleProviderModelEnabled);
    const toggleProviderEnabled = useAiInfraStore((s) => s.toggleProviderEnabled);

    const options = useMemo<SelectOptions>(() => {
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
        .filter(Boolean) as SelectOptions;
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

    const handleEnable = useCallback(async () => {
      // Prefer the provider the selection is persisted under so every surface
      // referencing `${provider}/${model}` recovers at once; the builtin-bank
      // provider is only a fallback for a persisted provider that no longer exists.
      const providerId = resolveEnableTargetProviderId(value, {
        enabledAiProviders,
        enabledList,
        metaProviderId: staleState?.meta?.providerId,
      });
      if (!providerId || !value) return;

      setEnabling(true);
      try {
        // Enabling only the model row is a silent no-op when the owning provider is
        // disabled — the picker keeps building options from enabled providers. Enable
        // the provider first so the remedy actually makes the selection resolvable
        // (idempotent when the provider is enabled but absent from this typed list).
        if (!enabledList.some((provider) => provider.id === providerId)) {
          await toggleProviderEnabled(providerId, true);
        }
        await toggleProviderModelEnabled({
          enabled: true,
          id: value.model,
          providerId,
          type: modelType,
        });
        // Realign the selection when it pointed at a different provider, so the now
        // enabled model resolves as a valid option instead of staying stale.
        if (providerId !== value.provider) onChange?.({ model: value.model, provider: providerId });
      } catch {
        toast.error(t('ModelSelect.staleModel.notEnabled.actionFailed'));
      } finally {
        setEnabling(false);
      }
    }, [
      enabledAiProviders,
      enabledList,
      modelType,
      onChange,
      staleState,
      t,
      toggleProviderEnabled,
      toggleProviderModelEnabled,
      value,
    ]);

    const finalOptions = useMemo<SelectOptions>(() => {
      if (!staleState || !value) return options;

      const { meta, status } = staleState;
      const successorName = staleState.successor?.displayName || staleState.successorId;

      // The trigger renders the selected option's `label`, so the enable Switch and
      // the hint stay out of it: a <button> inside the trigger <button> is invalid
      // HTML. They live on `popupLabel`, which only `optionRender` reads.
      const renderStaleLabel = (withPopupExtras: boolean) => (
        <div className="flex w-full flex-col gap-1">
          <div className="flex items-center gap-2">
            <ModelIcon model={value.model} size={20} />
            <div className="truncate text-sm leading-5.5 text-foreground">
              {meta?.displayName || value.model}
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    className={`${STALE_TAG_CLASSNAME} h-auto min-h-5 flex-none cursor-default text-xs leading-5`}
                    variant={status === 'removed' ? 'warning-light' : 'secondary'}
                  />
                }
              >
                {t(`ModelSelect.staleModel.${status}.tag`)}
              </TooltipTrigger>
              <TooltipContent>
                {t(`ModelSelect.staleModel.${status}.tooltip`, { successorName })}
              </TooltipContent>
            </Tooltip>
            {withPopupExtras && status === 'notEnabled' && (
              <>
                <span className="flex-1" />
                {/* The wrapper re-enables pointer events (the disabled option row
                 * suppresses them) and stops propagation so toggling never counts
                 * as selecting the row. */}
                <span
                  className="pointer-events-auto flex-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                >
                  <label className="sr-only" htmlFor={enableSwitchId}>
                    {t('ModelSelect.staleModel.notEnabled.action')}
                  </label>
                  <Switch
                    checked={false}
                    disabled={enabling}
                    id={enableSwitchId}
                    size={'sm'}
                    onCheckedChange={() => {
                      void handleEnable();
                    }}
                  />
                </span>
              </>
            )}
          </div>
          {withPopupExtras && (
            <span className="text-sm leading-5.5 whitespace-normal text-muted-foreground">
              {t(`ModelSelect.staleModel.${status}.hint`, { successorName })}
            </span>
          )}
        </div>
      );

      const currentOption = {
        __stale: true,
        className: STALE_OPTION_CLASSNAME,
        disabled: true,
        label: renderStaleLabel(false),
        popupLabel: renderStaleLabel(true),
        value: `${value.provider}/${value.model}`,
      };

      // notEnabled recovers via the inline toggle above; only the redirected
      // remedy ("update to successor") still needs a dedicated action row.
      const actionLabel =
        status === 'redirected'
          ? t('ModelSelect.staleModel.redirected.action', { successorName })
          : undefined;

      const actionOption = actionLabel
        ? {
            __stale: true,
            label: (
              <div className="flex">
                {/* Visual-only button: the sentinel option row owns the click (via
                 * onChange), so pointer events are disabled to keep one hit target. */}
                <Button
                  className={`pointer-events-none transition-orvilo-model-remedy ${nativeStyles.remedy}`}
                  variant={'outline'}
                >
                  {actionLabel}
                </Button>
              </div>
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
      ] as SelectOptions;
    }, [enableSwitchId, enabling, handleEnable, options, staleState, t, value]);

    const flatOptions = useMemo(
      () => finalOptions.flatMap((option) => (isGroup(option) ? option.options : [option])),
      [finalOptions],
    );
    const optionFor = (optionValue: string) =>
      flatOptions.find((option) => option.value === optionValue);
    const selectedValue = value ? `${value.provider}/${value.model}` : null;

    const handleChange = (next: string | null) => {
      if (next == null) {
        onClear?.();
        return;
      }
      if (next === STALE_ACTION_VALUE) {
        if (staleState?.status === 'redirected' && staleState.successorId && value?.provider) {
          onChange?.({ model: staleState.successorId, provider: value.provider });
        }
        return;
      }

      const model = next.split('/').slice(1).join('/');
      onChange?.({ model, provider: (optionFor(next) as unknown as ModelOption).provider });
    };

    const renderOption = (option: SelectOption) => (
      <SelectItem
        className={clsx(nativeStyles.item, option.className)}
        disabled={option.disabled}
        key={option.value}
        value={option.value}
      >
        {option.__stale ? (
          (option.popupLabel ?? option.label)
        ) : (
          <ModelItemRender
            {...(option as unknown as ModelOption)}
            {...(option as unknown as ModelOption).abilities}
            showInfoTag={false}
          />
        )}
      </SelectItem>
    );

    const showClear = allowClear && !disabled && selectedValue !== null;

    return (
      <Select<string>
        disabled={disabled}
        items={flatOptions.map((option) => ({ label: option.label, value: option.value }))}
        value={selectedValue}
        onValueChange={(next) => handleChange(next)}
      >
        <SelectTrigger
          size={size === 'small' ? 'sm' : size === 'large' ? 'large' : 'default'}
          className={clsx(
            'transition-orvilo-model-select w-full',
            styles.select,
            disableMotion && nativeStyles.motionDisabled,
            size === 'small'
              ? nativeStyles.property
              : size === 'large'
                ? nativeStyles.large
                : nativeStyles.normal,
          )}
          style={{
            width: initialWidth ? 'initial' : undefined,
            ...style,
          }}
        >
          <SelectValue className="min-w-0">
            {(current: string | null) =>
              current == null ? placeholder : (optionFor(current)?.label ?? current)
            }
          </SelectValue>
          {(loading || enabling) && <Spinner className="size-4 text-muted-foreground" />}
          {showClear && (
            // The trigger is a <button>, so the clear affordance is a span that keeps
            // its press from reaching the trigger (which would open the popup).
            <span
              aria-label={t('clear', { ns: 'common' })}
              className={`transition-orvilo-model-select-clear inline-flex size-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground ${nativeStyles.clear}`}
              role="button"
              tabIndex={-1}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleChange(null);
              }}
            >
              <XIcon className="size-3.5" />
            </span>
          )}
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          style={popupWidth === undefined ? undefined : { width: popupWidth }}
          className={clsx(
            'transition-orvilo-model-select-popup',
            styles.popup,
            disableMotion && nativeStyles.motionDisabled,
          )}
        >
          {finalOptions.map((option, index) =>
            isGroup(option) ? (
              <SelectGroup key={index}>
                <SelectLabel className={nativeStyles.groupLabel}>{option.label}</SelectLabel>
                {option.options.map(renderOption)}
              </SelectGroup>
            ) : (
              renderOption(option)
            ),
          )}
        </SelectContent>
      </Select>
    );
  },
);

export default ModelSelect;
