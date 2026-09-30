import { SliderWithInput, Switch } from '@lobehub/ui/base-ui';
import { Form } from 'antd';
import { debounce } from 'es-toolkit/compat';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FieldLabel } from '@/components/ui/field';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';

import { useAgentId } from '../../hooks/useAgentId';
import { useUpdateAgentConfig } from '../../hooks/useUpdateAgentConfig';

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
          <Switch loading={updating} size={'small'} />
        </Form.Item>
      </div>
      <Form.Item noStyle name="historyCount">
        <SliderWithInput
          disabled={!enableHistoryCount}
          max={20}
          min={0}
          size={'small'}
          step={1}
          style={{ marginBlock: 8, paddingLeft: 4 }}
          unlimitedInput={true}
          styles={{
            input: {
              maxWidth: 64,
            },
          }}
        />
      </Form.Item>
    </Form>
  );
};

export default Controls;
