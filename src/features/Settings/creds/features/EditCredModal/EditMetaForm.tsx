'use client';
import { type OwnCredSummary } from '@orvilo/types';
import { useMutation } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import Form from '@/components/GroupForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/usePermission';

import { type CredsApi } from '../useCredsApi';

interface EditMetaFormProps {
  cred: OwnCredSummary;
  credsApi: CredsApi;
  onCancel: () => void;
  onSuccess: () => void;
}

interface FormValues {
  description?: string;
  name: string;
}

const EditMetaForm: FC<EditMetaFormProps> = ({ cred, credsApi, onCancel, onSuccess }) => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials } = usePermission('manage_provider_key');
  const [form] = Form.useForm<FormValues>();

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!canManageCredentials) return;

      await credsApi.client.update.mutate({
        description: values.description,
        id: cred.id,
        name: values.name,
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

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        description: cred.description,
        name: cred.name,
      }}
      onFinish={handleSubmit}
    >
      <Form.Item
        label={t('creds.form.name')}
        name="name"
        rules={[{ required: true, message: t('creds.form.nameRequired') }]}
      >
        <Input disabled={!canManageCredentials} />
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
          loading={updateMutation.isPending}
          type="submit"
          variant="default"
        >
          {t('creds.form.save')}
        </Button>
      </div>
    </Form>
  );
};

export default EditMetaForm;
