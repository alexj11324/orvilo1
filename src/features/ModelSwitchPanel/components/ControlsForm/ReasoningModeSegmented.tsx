import { MODEL_REASONING_PARAM_LEVELS } from 'model-bank/aiModel';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useFormControlContext } from '@/components/FormControlContext';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { useUpdateAgentConfig } from '@/features/ChatInput/hooks/useUpdateAgentConfig';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';

const REASONING_MODES = MODEL_REASONING_PARAM_LEVELS.reasoningMode;
type ReasoningMode = (typeof REASONING_MODES)[number];

export interface ReasoningModeSegmentedProps {
  defaultValue?: ReasoningMode;
  disabled?: boolean;
  id?: string;
  onChange?: (value: ReasoningMode) => void;
  value?: ReasoningMode;
}

const ReasoningModeSegmentedInner = memo<{
  disabled?: boolean;
  id?: string;
  onChange: (value: ReasoningMode) => void;
  value: ReasoningMode;
}>(({ disabled, id, onChange, value }) => {
  const { t } = useTranslation('chat');
  const formControl = useFormControlContext();

  return (
    <ToggleGroup
      className="w-full max-w-60"
      disabled={disabled ?? formControl.disabled}
      id={id}
      multiple={false}
      size="sm"
      value={[value]}
      onValueChange={(values) => {
        const next = values[0];
        if (REASONING_MODES.includes(next as ReasoningMode)) onChange(next as ReasoningMode);
      }}
    >
      {REASONING_MODES.map((mode) => (
        <ToggleGroupItem className="flex-1" key={mode} value={mode}>
          {t(`reasoningEffort.mode.${mode}`)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
});

const ReasoningModeSegmentedWithStore = memo<{
  defaultValue: ReasoningMode;
  disabled?: boolean;
  id?: string;
}>(({ defaultValue, disabled, id }) => {
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();
  const config = useAgentStore((s) => chatConfigByIdSelectors.getChatConfigById(agentId)(s));

  const value = REASONING_MODES.includes(config.reasoningMode as ReasoningMode)
    ? (config.reasoningMode as ReasoningMode)
    : defaultValue;

  return (
    <ReasoningModeSegmentedInner
      disabled={disabled}
      id={id}
      value={value}
      onChange={(reasoningMode) => updateAgentChatConfig({ reasoningMode })}
    />
  );
});

const ReasoningModeSegmented = memo<ReasoningModeSegmentedProps>(
  ({ defaultValue = 'standard', disabled, id, onChange, value }) => {
    const isControlled = value !== undefined || onChange !== undefined;

    if (isControlled) {
      return (
        <ReasoningModeSegmentedInner
          disabled={disabled}
          id={id}
          value={value ?? defaultValue}
          onChange={onChange ?? (() => {})}
        />
      );
    }

    return (
      <ReasoningModeSegmentedWithStore defaultValue={defaultValue} disabled={disabled} id={id} />
    );
  },
);

export default ReasoningModeSegmented;
