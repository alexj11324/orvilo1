import type { OrviloAgentChatConfig } from '@orvilo/types';
import isEqual from 'fast-deep-equal';
import { MODEL_REASONING_EXTEND_PARAMS } from 'model-bank/aiModel';
import type { ReactElement, ReactNode } from 'react';
import { memo, useEffect, useId, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';

import InfoTooltip from '@/components/InfoTooltip';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { useUpdateAgentConfig } from '@/features/ChatInput/hooks/useUpdateAgentConfig';
import {
  resolveDefaultEnableAdaptiveThinkingForModel,
  resolveDefaultThinkingLevelForModel,
} from '@/services/chat/mecha/modelParamsResolver';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors, chatConfigByIdSelectors } from '@/store/agent/selectors';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';

import CodexMaxReasoningEffortSlider from './CodexMaxReasoningEffortSlider';
import ContextCachingSwitch from './ContextCachingSwitch';
import DeepSeekReasoningEffortSlider, {
  DeepSeekV4GAReasoningEffortSlider,
} from './DeepSeekReasoningEffortSlider';
import EffortSlider from './EffortSlider';
import GLM52ReasoningEffortSlider from './GLM52ReasoningEffortSlider';
import GLM53ReasoningEffortSlider from './GLM53ReasoningEffortSlider';
import GPT5ReasoningEffortSlider from './GPT5ReasoningEffortSlider';
import { GPT6ReasoningEffortSlider } from './GPT6ReasoningEffortSlider';
import GPT51ReasoningEffortSlider from './GPT51ReasoningEffortSlider';
import GPT52ProReasoningEffortSlider from './GPT52ProReasoningEffortSlider';
import GPT52ReasoningEffortSlider from './GPT52ReasoningEffortSlider';
import { GPT56ReasoningEffortSlider } from './GPT56ReasoningEffortSlider';
import Grok43ReasoningEffortSlider from './Grok43ReasoningEffortSlider';
import Grok45ReasoningEffortSlider from './Grok45ReasoningEffortSlider';
import Grok46ReasoningEffortSlider from './Grok46ReasoningEffortSlider';
import Grok420ReasoningEffortSlider from './Grok420ReasoningEffortSlider';
import Hy3ReasoningEffortSlider from './Hy3ReasoningEffortSlider';
import ImageAspectRatio2Select from './ImageAspectRatio2Select';
import ImageAspectRatioSelect from './ImageAspectRatioSelect';
import ImageResolution2Slider from './ImageResolution2Slider';
import ImageResolutionSlider from './ImageResolutionSlider';
import { KimiK3ReasoningEffortSlider } from './KimiK3ReasoningEffortSlider';
import Opus47EffortSlider from './Opus47EffortSlider';
import Qwen38ReasoningEffortSlider from './Qwen38ReasoningEffortSlider';
import ReasoningEffortSlider from './ReasoningEffortSlider';
import ReasoningModeSegmented from './ReasoningModeSegmented';
import ReasoningTokenSlider from './ReasoningTokenSlider';
import ReasoningTokenSlider32k from './ReasoningTokenSlider32k';
import ReasoningTokenSlider80k from './ReasoningTokenSlider80k';
import Ring26ReasoningEffortSlider from './Ring26ReasoningEffortSlider';
import Step3_5ReasoningEffortSlider from './Step3_5ReasoningEffortSlider';
import TextVerbositySlider from './TextVerbositySlider';
import ThinkingBudgetSlider from './ThinkingBudgetSlider';
import ThinkingLevel2Slider from './ThinkingLevel2Slider';
import ThinkingLevel3Slider from './ThinkingLevel3Slider';
import ThinkingLevel4Slider from './ThinkingLevel4Slider';
import ThinkingLevelSlider from './ThinkingLevelSlider';
import ThinkingSlider from './ThinkingSlider';

const REASONING_PARAMS_SET = new Set<string>(MODEL_REASONING_EXTEND_PARAMS);

interface ControlItem {
  children: ReactElement<{
    checked?: boolean;
    id?: string;
    onChange?: (value: unknown) => void;
    onCheckedChange?: (value: boolean) => void;
    value?: unknown;
  }>;
  label: ReactNode;
  layout: 'horizontal' | 'vertical';
  name: keyof OrviloAgentChatConfig;
}

interface ControlsFormProps {
  /**
   * Override the config source. Defaults to the agent's own chatConfig; the
   * sub-agent params panel passes the sub-agent's effective (merged) config.
   */
  chatConfig?: OrviloAgentChatConfig;
  disabled?: boolean;
  /**
   * Hide the reasoning-effort family + reasoningMode controls. The main-agent
   * params panel sets this: those fields migrated to user-level model-instance
   * settings edited via the ChatInput Effort control, so agent chatConfig
   * writes here would be ignored at send time. The sub-agent panel keeps them
   * as explicit per-sub-agent overrides.
   */
  hideReasoningParams?: boolean;
  model?: string;
  /**
   * Override the write sink. Defaults to updating the agent's chatConfig; the
   * sub-agent params panel redirects writes into `agencyConfig.subagent.chatConfig`.
   */
  onChatConfigChange?: (patch: Partial<OrviloAgentChatConfig>) => Promise<void>;
  onUpdatingChange?: (updating: boolean) => void;
  provider?: string;
}

/**
 * Keeps the switch state aligned with runtime behavior for legacy configs.
 * Users may still have only `thinking: 'disabled'`; treating that as unset would
 * show the model default and could persist the opposite value on unrelated edits.
 */
const resolveEnableReasoningInitialValue = (config: OrviloAgentChatConfig) => {
  if (Object.hasOwn(config, 'enableReasoning')) return config.enableReasoning;

  if (config.thinking === 'enabled') return true;
  if (config.thinking === 'disabled') return false;

  return undefined;
};

const resolveEnableAdaptiveThinkingInitialValue = (
  config: OrviloAgentChatConfig,
  model?: string,
) => {
  if (Object.hasOwn(config, 'enableAdaptiveThinking')) return config.enableAdaptiveThinking;

  return resolveDefaultEnableAdaptiveThinkingForModel(model);
};

const ControlsForm = memo<ControlsFormProps>(
  ({
    chatConfig: chatConfigProp,
    disabled,
    hideReasoningParams,
    model: modelProp,
    onChatConfigChange,
    onUpdatingChange,
    provider: providerProp,
  }) => {
    const { t } = useTranslation('chat');
    const agentId = useAgentId();
    const { updateAgentChatConfig } = useUpdateAgentConfig();
    const [agentModel, agentProvider] = useAgentStore((s) => [
      agentByIdSelectors.getAgentModelById(agentId)(s),
      agentByIdSelectors.getAgentModelProviderById(agentId)(s),
    ]);
    const model = modelProp ?? agentModel;
    const provider = providerProp ?? agentProvider;

    const storeConfig = useAgentStore(
      (s) => chatConfigByIdSelectors.getChatConfigById(agentId)(s),
      isEqual,
    );
    const config = chatConfigProp ?? storeConfig;

    const modelExtendParams = useAiInfraStore(aiModelSelectors.modelExtendParams(model, provider));
    const initialValues = useMemo(() => {
      const enableReasoningInitialValue = resolveEnableReasoningInitialValue(config);
      const enableAdaptiveThinkingInitialValue = resolveEnableAdaptiveThinkingInitialValue(
        config,
        model,
      );

      return {
        ...config,
        enableAdaptiveThinking: enableAdaptiveThinkingInitialValue,
        enableReasoning: enableReasoningInitialValue,
      };
    }, [config, model]);

    const formId = useId();
    const { control, getValues, reset } = useForm<OrviloAgentChatConfig>({
      defaultValues: initialValues,
      shouldUnregister: false,
    });

    useEffect(() => {
      // setFieldsValue merged provided keys and retained hidden/omitted values.
      // Sync without an autosave, and preserve that contract across model changes.
      reset({ ...getValues(), ...initialValues });
    }, [getValues, initialValues, reset]);

    const enableReasoningValue =
      useWatch({ control, name: 'enableReasoning' }) ?? initialValues.enableReasoning;

    const onValuesChange = async (values: Partial<OrviloAgentChatConfig>) => {
      if (disabled) return;
      onUpdatingChange?.(true);
      try {
        await (onChatConfigChange ?? updateAgentChatConfig)(values);
      } finally {
        onUpdatingChange?.(false);
      }
    };

    const gpt52ReasoningEffortDefaultValue = model === 'gpt-5.5' ? 'medium' : 'none';
    const thinkingLevelDefaultValue = resolveDefaultThinkingLevelForModel(model);
    const thinkingLevel3DefaultValue = resolveDefaultThinkingLevelForModel(model, 'thinkingLevel3');

    // Show descriptions as a question-mark tooltip beside the label, matching
    // the ControlRow items rendered above this form in the params panel.
    const labelWithTooltip = (label: string, tooltip: ReactNode) => (
      <span className="flex items-center gap-1.5">
        {label}
        <InfoTooltip title={tooltip} />
      </span>
    );

    const items = [
      {
        children: <ContextCachingSwitch disabled={disabled} />,
        label: labelWithTooltip(
          t('extendParams.disableContextCaching.title'),
          <Trans i18nKey={'extendParams.disableContextCaching.desc'} ns={'chat'}>
            单条对话生成成本最高可降低 90%，响应速度提升 4 倍（
            <a
              href={'https://www.anthropic.com/news/prompt-caching?utm_source=orvilo'}
              rel="noreferrer nofollow"
              target="_blank"
            >
              了解更多
            </a>
            ）。开启后将自动禁用历史记录限制
          </Trans>,
        ),
        layout: 'horizontal',
        name: 'disableContextCaching',
      },
      {
        children: <Switch disabled={disabled} />,
        label: labelWithTooltip(
          t('extendParams.enableReasoning.title'),
          <Trans i18nKey={'extendParams.enableReasoning.desc'} ns={'chat'}>
            开启后模型会先进行推理，适合复杂问题。
          </Trans>,
        ),
        layout: 'horizontal',
        name: 'enableReasoning',
      },
      {
        children: <Switch disabled={disabled} />,
        label: labelWithTooltip(
          t('extendParams.preserveThinking.title'),
          t('extendParams.preserveThinking.desc'),
        ),
        layout: 'horizontal',
        name: 'preserveThinking',
      },
      {
        children: <Switch disabled={disabled} />,
        label: labelWithTooltip(
          t('extendParams.enableAdaptiveThinking.title'),
          t('extendParams.enableAdaptiveThinking.desc'),
        ),
        layout: 'horizontal',
        name: 'enableAdaptiveThinking',
      },
      (enableReasoningValue || modelExtendParams?.includes('reasoningBudgetToken')) && {
        children: <ReasoningTokenSlider />,
        label: t('extendParams.reasoningBudgetToken.title'),
        layout: 'vertical',
        name: 'reasoningBudgetToken',
      },
      modelExtendParams?.includes('reasoningBudgetToken32k') && {
        children: <ReasoningTokenSlider32k />,
        label: t('extendParams.reasoningBudgetToken.title'),
        layout: 'vertical',
        name: 'reasoningBudgetToken32k',
      },
      modelExtendParams?.includes('reasoningBudgetToken80k') && {
        children: <ReasoningTokenSlider80k />,
        label: t('extendParams.reasoningBudgetToken.title'),
        layout: 'vertical',
        name: 'reasoningBudgetToken80k',
      },
      {
        children: <DeepSeekV4GAReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'deepseekV4GAReasoningEffort',
      },
      {
        children: <DeepSeekReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'deepseekV4ReasoningEffort',
      },
      {
        children: <Qwen38ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'qwen38ReasoningEffort',
      },
      {
        children: <ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'reasoningEffort',
      },
      {
        children: <ReasoningModeSegmented />,
        label: labelWithTooltip(
          t('extendParams.reasoningMode.title'),
          t('extendParams.reasoningMode.desc'),
        ),
        layout: 'vertical',
        name: 'reasoningMode',
      },
      {
        children: <EffortSlider />,
        label: labelWithTooltip(t('extendParams.effort.title'), t('extendParams.effort.desc')),
        layout: 'vertical',
        name: 'effort',
      },
      {
        children: <Opus47EffortSlider />,
        label: labelWithTooltip(t('extendParams.effort.title'), t('extendParams.effort.desc')),
        layout: 'vertical',
        name: 'opus47Effort',
      },
      {
        children: <GPT5ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'gpt5ReasoningEffort',
      },
      {
        children: <GPT51ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'gpt5_1ReasoningEffort',
      },
      {
        children: <GPT52ReasoningEffortSlider defaultValue={gpt52ReasoningEffortDefaultValue} />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'gpt5_2ReasoningEffort',
      },
      {
        children: <GPT56ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'gpt5_6ReasoningEffort',
      },
      {
        children: <GPT6ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'gpt6ReasoningEffort',
      },
      {
        children: <GPT52ProReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'gpt5_2ProReasoningEffort',
      },
      {
        children: <GLM52ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'glm5_2ReasoningEffort',
      },
      {
        children: <GLM53ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'glm5_3ReasoningEffort',
      },
      {
        children: <Grok420ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'grok4_20ReasoningEffort',
      },
      {
        children: <Grok43ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'grok4_3ReasoningEffort',
      },
      {
        children: <Grok45ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'grok4_5ReasoningEffort',
      },
      {
        children: <Grok46ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'grok4_6ReasoningEffort',
      },
      {
        children: <Hy3ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'hy3ReasoningEffort',
      },
      {
        children: <KimiK3ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'kimiK3ReasoningEffort',
      },
      {
        children: <Ring26ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'ring2_6ReasoningEffort',
      },
      {
        children: <CodexMaxReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'codexMaxReasoningEffort',
      },
      {
        children: <Step3_5ReasoningEffortSlider />,
        label: t('extendParams.reasoningEffort.title'),
        layout: 'vertical',
        name: 'step3_5ReasoningEffort',
      },
      {
        children: <TextVerbositySlider />,
        label: t('extendParams.textVerbosity.title'),
        layout: 'vertical',
        name: 'textVerbosity',
      },
      {
        children: <ThinkingBudgetSlider />,
        label: t('extendParams.thinkingBudget.title'),
        layout: 'vertical',
        name: 'thinkingBudget',
      },
      {
        children: <Switch disabled={disabled} />,
        label: labelWithTooltip(
          t('extendParams.urlContext.title'),
          t('extendParams.urlContext.desc'),
        ),
        layout: 'horizontal',
        name: 'urlContext',
      },
      {
        children: <ThinkingSlider />,
        label: t('extendParams.thinking.title'),
        layout: 'vertical',
        name: 'thinking',
      },
      {
        children: <ThinkingLevelSlider defaultValue={thinkingLevelDefaultValue} />,
        label: t('extendParams.thinkingLevel.title'),
        layout: 'vertical',
        name: 'thinkingLevel',
      },
      {
        children: <ThinkingLevel2Slider />,
        label: t('extendParams.thinkingLevel.title'),
        layout: 'vertical',
        name: 'thinkingLevel2',
      },
      {
        children: <ThinkingLevel3Slider defaultValue={thinkingLevel3DefaultValue} />,
        label: t('extendParams.thinkingLevel.title'),
        layout: 'vertical',
        name: 'thinkingLevel3',
      },
      {
        children: <ThinkingLevel4Slider />,
        label: t('extendParams.thinkingLevel.title'),
        layout: 'vertical',
        name: 'thinkingLevel4',
      },
      {
        children: <ImageAspectRatioSelect />,
        label: t('extendParams.imageAspectRatio.title'),
        layout: 'horizontal',
        name: 'imageAspectRatio',
      },
      {
        children: <ImageAspectRatio2Select />,
        label: t('extendParams.imageAspectRatio.title'),
        layout: 'horizontal',
        name: 'imageAspectRatio2',
      },
      {
        children: <ImageResolutionSlider />,
        label: t('extendParams.imageResolution.title'),
        layout: 'horizontal',
        name: 'imageResolution',
      },
      {
        children: <ImageResolution2Slider />,
        label: t('extendParams.imageResolution.title'),
        layout: 'horizontal',
        name: 'imageResolution2',
      },
    ].filter(Boolean) as ControlItem[];

    const visibleItems = (modelExtendParams || [])
      .filter((name) => !(hideReasoningParams && REASONING_PARAMS_SET.has(name)))
      .map((name) => items.find((item) => item.name === name))
      .filter((item): item is ControlItem => Boolean(item));

    return (
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset
          className={disabled ? 'min-w-0 border-0 p-0 opacity-50' : 'min-w-0 border-0 p-0'}
          disabled={disabled}
        >
          <FieldGroup className="gap-4 text-sm text-foreground">
            {visibleItems.map((item) => (
              <Controller
                control={control}
                key={item.name}
                name={item.name}
                render={({ field }) => {
                  const controlId = `${formId}-${item.name}`;
                  const labelId = `${controlId}-label`;
                  const Control = item.children.type;
                  const isSwitch = item.children.type === Switch;
                  const onChange = (value: unknown) => {
                    if (disabled) return;
                    field.onChange(value);
                    return onValuesChange({ [item.name]: value });
                  };

                  return (
                    <Field
                      aria-labelledby={labelId}
                      orientation={item.layout}
                      className={
                        item.layout === 'horizontal'
                          ? 'min-w-0 justify-between gap-3'
                          : 'min-w-0 gap-2'
                      }
                    >
                      <FieldLabel
                        className="min-w-0 text-sm leading-5.5 font-medium"
                        htmlFor={isSwitch ? controlId : undefined}
                        id={labelId}
                      >
                        {item.label}
                      </FieldLabel>
                      <Control
                        {...item.children.props}
                        id={controlId}
                        {...(isSwitch
                          ? { checked: Boolean(field.value), onCheckedChange: onChange }
                          : { onChange, value: field.value })}
                      />
                    </Field>
                  );
                }}
              />
            ))}
          </FieldGroup>
        </fieldset>
      </form>
    );
  },
);

export default ControlsForm;
