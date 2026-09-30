import { debounce } from 'es-toolkit/compat';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form from '@/components/GroupForm';
import InputNumber from '@/components/InputNumber';
import { FieldLabel } from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';

const HistoryCountSlider = ({
  value,
  onChange,
  disabled,
}: {
  disabled?: boolean;
  onChange?: (v: number) => void;
  value?: number;
}) => (
  <div className="flex items-center" style={{ gap: 10, marginBlock: 8, paddingLeft: 4 }}>
    <Slider
      className="flex-1"
      disabled={disabled}
      max={20}
      min={0}
      step={1}
      value={value}
      onValueChange={(v) => onChange?.(v)}
    />
    <InputNumber
      disabled={disabled}
      min={0}
      step={1}
      style={{ maxWidth: 64 }}
      value={value ?? null}
      onChange={(v) => {
        if (typeof v === 'number') onChange?.(v);
      }}
    />
  </div>
);

const Controls = () => {
  const { t } = useTranslation('setting');
  const [form] = Form.useForm();
  const [updating, setUpdating] = useState(false);
  const agentId = useAgentId();
  const { updateAgentChatConfig } = useUpdateAgentConfig();

  const [historyCount, enableHistoryCount] = useAgentStore((s) => [
    chatConfigByIdSelectors.getHistoryCountById(agentId)(s),
    chatConfigByIdSelectors.getEnableHistoryCountById(agentId)(s),
  ]);

  // Sync external store updates to the form without remounting to keep Switch animation
  useEffect(() => {
    form?.setFieldsValue({
      enableHistoryCount,
      historyCount,
    });
  }, [enableHistoryCount, historyCount, form]);

  const handleValuesChange = useMemo(
    () =>
      debounce(async (values) => {
        setUpdating(true);
        try {
          await updateAgentChatConfig(values);
        } finally {
          setUpdating(false);
        }
      }, 500),
    [updateAgentChatConfig],
  );

  useEffect(() => () => handleValuesChange.cancel(), [handleValuesChange]);

  return (
    <Form
      form={form}
      initialValues={{
        enableHistoryCount,
        historyCount,
      }}
      onValuesChange={handleValuesChange}
    >
      <div className="flex flex-row items-center justify-between gap-2">
        <FieldLabel htmlFor="enableHistoryCount">
          {t('settingChat.enableHistoryCount.title')}
        </FieldLabel>
        <Form.Item name="enableHistoryCount" style={{ marginBlockEnd: 0 }} valuePropName="checked">
          <Switch disabled={updating} size="sm" />
        </Form.Item>
      </div>
      <Form.Item noStyle name="historyCount">
        <HistoryCountSlider disabled={!enableHistoryCount} />
      </Form.Item>
    </Form>
  );
};

export default Controls;
