'use client';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import Form from '@/components/GroupForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import { type CredsApi } from '../useCredsApi';

interface OAuthCredFormProps {
  credsApi: CredsApi;
  disabled?: boolean;
  onBack: () => void;
  onSuccess: () => void;
}

interface FormValues {
  description?: string;
  key: string;
  name: string;
  oauthConnectionId: number;
}

const OAuthCredForm: FC<OAuthCredFormProps> = ({ credsApi, disabled, onBack, onSuccess }) => {
  const { t } = useTranslation('setting');
  const [form] = Form.useForm<FormValues>();

  const { data: connectionsData, isLoading } = credsApi.query.listOAuthConnections.useQuery();

  const connections = connectionsData?.connections ?? [];
  // The SDK's OAuthConnection type omits `id`, but the response carries the
  // numeric connection id `createOAuth` needs — `any` it is.
  const connectionOptions = connections.map((conn: any) => {
    const provider = conn.providerId || 'OAuth';
    const displayName = conn.providerUsername || conn.providerEmail || conn.providerName;

    return {
      label: (
        <span className="flex items-center gap-2">
          <span>
            <span className="font-medium">{provider}</span>
            {displayName && <span className="text-muted-foreground"> - {displayName}</span>}
          </span>
        </span>
      ),
      title: [provider, displayName].filter(Boolean).join(' '),
      value: conn.id,
    };
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (disabled) return;

      await credsApi.client.createOAuth.mutate({
        description: values.description,
        key: values.key,
        name: values.name,
        oauthConnectionId: values.oauthConnectionId,
      });
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleSubmit = (values: FormValues) => {
    if (disabled) return;

    createMutation.mutate(values);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: 48 }}>
        <Spinner />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div>
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
          {t('creds.oauth.noConnections')}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            {t('creds.form.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item
        label={t('creds.form.selectConnection')}
        name="oauthConnectionId"
        rules={[{ required: true, message: t('creds.form.connectionRequired') }]}
        trigger="onValueChange"
      >
        <Select disabled={disabled} items={connectionOptions}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('creds.form.selectConnectionPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {connectionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Form.Item>

      <Form.Item
        label={t('creds.form.key')}
        name="key"
        rules={[
          { required: true, message: t('creds.form.keyRequired') },
          { pattern: /^[\w-]+$/, message: t('creds.form.keyPattern') },
        ]}
      >
        <Input disabled={disabled} placeholder="e.g., github-oauth" />
      </Form.Item>

      <Form.Item
        label={t('creds.form.name')}
        name="name"
        rules={[{ required: true, message: t('creds.form.nameRequired') }]}
      >
        <Input disabled={disabled} placeholder="e.g., GitHub Connection" />
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
        <Button disabled={createMutation.isPending || disabled} type="submit" variant="default">
          {createMutation.isPending && <Loader2 className="animate-spin" />}
          {t('creds.form.submit')}
        </Button>
      </div>
    </Form>
  );
};

export default OAuthCredForm;
