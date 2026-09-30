'use client';
import { type OwnCredSummary } from '@orvilo/types';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Minus, Plus } from 'lucide-react';
import { type FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form from '@/components/GroupForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';

import { type CredsApi } from '../useCredsApi';

interface EditKVFormProps {
  cred: OwnCredSummary;
  credsApi: CredsApi;
  onCancel: () => void;
  onSuccess: () => void;
}

interface FormValues {
  description?: string;
  kvPairs: Array<{ key: string; value: string }>;
  name: string;
}

const EditKVForm: FC<EditKVFormProps> = ({ cred, credsApi, onCancel, onSuccess }) => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials } = usePermission('manage_provider_key');
  const [form] = Form.useForm<FormValues>();
  const [isLoading, setIsLoading] = useState(true);

  // Fetch decrypted values on mount
  useEffect(() => {
    const fetchDecryptedValues = async () => {
      if (!canManageCredentials) {
        setIsLoading(false);
        return;
      }

      try {
        const result = await credsApi.client.get.query({
          decrypt: true,
          id: cred.id,
        });

        // Convert values object to array of key-value pairs
        const values = result?.data?.plaintext || {};
        const kvPairs = Object.entries(values).map(([key, value]) => ({
          key,
          value: value as string,
        }));

        form.setFieldsValue({
          description: cred.description,
          kvPairs: kvPairs.length > 0 ? kvPairs : [{ key: '', value: '' }],
          name: cred.name,
        });
      } catch {
        // If decryption fails, just show empty values
        form.setFieldsValue({
          description: cred.description,
          kvPairs: [{ key: '', value: '' }],
          name: cred.name,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchDecryptedValues();
  }, [canManageCredentials, cred.id, cred.name, cred.description, credsApi, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!canManageCredentials) return;

      const kvPairs = values.kvPairs || [];
      const valuesObj = kvPairs.reduce(
        (acc, pair) => {
          if (pair.key && pair.value) {
            acc[pair.key] = pair.value;
          }
          return acc;
        },
        {} as Record<string, string>,
      );

      await credsApi.client.update.mutate({
        description: values.description,
        id: cred.id,
        name: values.name,
        values: valuesObj,
      });
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleSubmit = (values: FormValues) => {
    if (!canManageCredentials) return;

    updateMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: 48 }}>
        <Spinner />
      </div>
    );
  }

  return (
    <Form<FormValues> form={form} layout="vertical" onFinish={handleSubmit}>
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
                    name={[name, 'key']}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input
                      disabled={!canManageCredentials}
                      placeholder={cred.type === 'kv-env' ? 'ENV_VAR_NAME' : 'Header-Name'}
                    />
                  </Form.Item>
                  <Form.Item
                    {...restField}
                    name={[name, 'value']}
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
          disabled={updateMutation.isPending || !canManageCredentials}
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
