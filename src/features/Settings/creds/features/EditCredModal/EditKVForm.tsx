'use client';
import { type OwnCredSummary } from '@orvilo/types';
import { Loader2, Minus, Plus } from 'lucide-react';
import { type FC, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Form from '@/components/GroupForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';

import { pairCompletenessRule } from '../kvPairs';
import { type CredsApi } from '../useCredsApi';
import { type KVFormValues, useEditKVForm } from './useEditKVForm';

interface EditKVFormProps {
  cred: OwnCredSummary;
  credsApi: CredsApi;
  onCancel: () => void;
  onSuccess: () => void;
}

const EditKVForm: FC<EditKVFormProps> = ({ cred, credsApi, onCancel, onSuccess }) => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials } = usePermission('manage_provider_key');
  const [form] = Form.useForm<KVFormValues>();
  const setValues = useCallback((values: KVFormValues) => form.setFieldsValue(values), [form]);
  const { isLoading, loadError, ready, retryLoad, updateMutation } = useEditKVForm(
    cred,
    credsApi,
    canManageCredentials,
    setValues,
    onSuccess,
  );

  const handleSubmit = (values: KVFormValues) => {
    if (!canManageCredentials || !ready) return;

    updateMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: 48 }}>
        <Spinner />
      </div>
    );
  }

  if (loadError) {
    return (
      <AsyncError
        description={t('creds.form.loadFailed')}
        error={loadError}
        variant="block"
        onRetry={retryLoad}
      />
    );
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item
        label={t('creds.form.name')}
        name="name"
        rules={[{ required: true, message: t('creds.form.nameRequired') }]}
      >
        <Input disabled={!canManageCredentials} />
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
                      disabled={!canManageCredentials}
                      placeholder={cred.type === 'kv-env' ? 'ENV_VAR_NAME' : 'Header-Name'}
                    />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    dependencies={[['kvPairs', name, 'key']]}
                    name={[name, 'value']}
                    rules={[pairCompletenessRule(name, t('creds.form.pairIncomplete'))]}
                    style={{ flex: 2, marginBottom: 0 }}
                  >
                    <Input
                      autoComplete="new-password"
                      disabled={!canManageCredentials}
                      placeholder={t('creds.form.valuePlaceholder')}
                      type="password"
                    />
                  </Form.Item>
                  {fields.length > 1 && (
                    <Button
                      disabled={!canManageCredentials}
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
                disabled={!canManageCredentials}
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
          disabled={!canManageCredentials}
          placeholder={t('creds.form.descriptionPlaceholder')}
          rows={2}
        />
      </Form.Item>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('creds.form.cancel')}
        </Button>
        <Button
          disabled={updateMutation.isPending || !canManageCredentials || !ready}
          type="submit"
          variant="default"
        >
          {updateMutation.isPending && <Loader2 className="animate-spin" />}
          {t('creds.form.save')}
        </Button>
      </div>
    </Form>
  );
};

export default EditKVForm;
