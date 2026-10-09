'use client';
import { Minus, Plus } from 'lucide-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { FormPassword } from '@/components/FormInput';
import Form from '@/components/GroupForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { pairCompletenessRule, pairsToValues } from '../kvPairs';
import { useCredentialMutation } from '../useCredentialMutation';
import { type CredsApi } from '../useCredsApi';

interface KVCredFormProps {
  credsApi: CredsApi;
  disabled?: boolean;
  onBack: () => void;
  onSuccess: () => void;
  type: 'kv-env' | 'kv-header';
}

interface FormValues {
  description?: string;
  key: string;
  kvPairs: Array<{ key: string; value: string }>;
  name: string;
}

const KVCredForm: FC<KVCredFormProps> = ({ credsApi, type, disabled, onBack, onSuccess }) => {
  const { t } = useTranslation('setting');
  const [form] = Form.useForm<FormValues>();

  const createMutation = useCredentialMutation(
    async (values: FormValues) => {
      if (disabled) return;

      await credsApi.client.createKV.mutate({
        description: values.description,
        key: values.key,
        name: values.name,
        type,
        values: pairsToValues(values.kvPairs),
      });
    },
    onSuccess,
    t('creds.form.createFailed'),
  );

  const handleSubmit = (values: FormValues) => {
    if (disabled) return;

    createMutation.mutate(values);
  };

  return (
    <Form
      form={form}
      initialValues={{ kvPairs: [{ key: '', value: '' }] }}
      layout="vertical"
      onFinish={handleSubmit}
    >
      <Form.Item
        label={t('creds.form.key')}
        name="key"
        rules={[
          { required: true, message: t('creds.form.keyRequired') },
          { pattern: /^[\w-]+$/, message: t('creds.form.keyPattern') },
        ]}
      >
        <Input disabled={disabled} placeholder="e.g., openai" />
      </Form.Item>

      <Form.Item
        label={t('creds.form.name')}
        name="name"
        rules={[{ required: true, message: t('creds.form.nameRequired') }]}
      >
        <Input disabled={disabled} placeholder="e.g., OpenAI API Key" />
      </Form.Item>

      <Form.Item label={t('creds.form.values')}>
        <Form.List name="kvPairs">
          {(fields, { add, remove }) => (
            <div className="flex flex-col gap-2">
              {fields.map(({ key, name, ...restField }) => (
                <div className="flex items-start gap-2" key={key}>
                  <Form.Item
                    {...restField}
                    dependencies={[['kvPairs', name, 'value']]}
                    name={[name, 'key']}
                    rules={[pairCompletenessRule(name, t('creds.form.pairIncomplete'))]}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input
                      disabled={disabled}
                      placeholder={type === 'kv-env' ? 'ENV_VAR_NAME' : 'Header-Name'}
                    />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    dependencies={[['kvPairs', name, 'key']]}
                    name={[name, 'value']}
                    rules={[pairCompletenessRule(name, t('creds.form.pairIncomplete'))]}
                    style={{ flex: 2, marginBottom: 0 }}
                  >
                    <FormPassword
                      autoComplete="new-password"
                      disabled={disabled}
                      placeholder={t('creds.form.valuePlaceholder')}
                    />
                  </Form.Item>
                  {fields.length > 1 && (
                    <Button
                      disabled={disabled}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => remove(name)}
                    >
                      <Minus />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                className="w-full"
                disabled={disabled}
                type="button"
                variant="outline"
                onClick={() => add({ key: '', value: '' })}
              >
                <Plus />
                {t('creds.form.addPair')}
              </Button>
            </div>
          )}
        </Form.List>
      </Form.Item>

      <Form.Item label={t('creds.form.description')} name="description">
        <Textarea
          disabled={disabled}
          placeholder={t('creds.form.descriptionPlaceholder')}
          rows={2}
        />
      </Form.Item>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t('creds.form.back')}
        </Button>
        <Button
          disabled={createMutation.isPending || disabled}
          loading={createMutation.isPending}
          type="submit"
          variant="default"
        >
          {t('creds.form.submit')}
        </Button>
      </div>
    </Form>
  );
};

export default KVCredForm;
