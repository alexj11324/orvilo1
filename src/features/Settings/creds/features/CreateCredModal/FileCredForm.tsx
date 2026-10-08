'use client';
import { useMutation } from '@tanstack/react-query';
import { Inbox, X } from 'lucide-react';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form from '@/components/GroupForm';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UploadDragger } from '@/components/Upload';

import { type CredsApi } from '../useCredsApi';

interface FileCredFormProps {
  credsApi: CredsApi;
  disabled?: boolean;
  onBack: () => void;
  onSuccess: () => void;
}

interface FormValues {
  description?: string;
  key: string;
  name: string;
}

const FileCredForm: FC<FileCredFormProps> = ({ credsApi, disabled, onBack, onSuccess }) => {
  const { t } = useTranslation('setting');
  const [form] = Form.useForm<FormValues>();
  const [fileHashId, setFileHashId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (disabled) return;

      if (!fileHashId || !fileName) {
        throw new Error('File is required');
      }

      await credsApi.client.createFile.mutate({
        description: values.description,
        fileHashId,
        fileName,
        key: values.key,
        name: values.name,
      });
    },
    onSuccess: () => {
      onSuccess();
    },
  });

  const handleUpload = async (file: File) => {
    if (disabled) return false;

    setIsUploading(true);

    try {
      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      // Upload via TRPC (personal or workspace, based on the credsApi passed in by the caller)
      const result = await credsApi.client.uploadFile.mutate({
        file: base64,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
      });

      if (!result) {
        throw new Error('Credential upload returned no result');
      }
      setFileName(result.fileName);
      setFileHashId(result.fileHashId);
      toast.success(t('creds.file.uploadSuccess'));
    } catch (error) {
      console.error('[FileCredForm] Upload failed:', error);
      toast.error(error instanceof Error ? error.message : t('creds.file.uploadFailed'));
    } finally {
      setIsUploading(false);
    }

    return false; // Prevent default upload
  };

  const handleSubmit = (values: FormValues) => {
    if (disabled) return;

    if (!fileHashId) {
      toast.error(t('creds.form.fileRequired'));
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item required label={t('creds.form.file')}>
        <UploadDragger beforeUpload={handleUpload} disabled={isUploading || disabled} maxCount={1}>
          <p className="ant-upload-drag-icon">
            <Inbox className="mx-auto size-8 text-muted-foreground" />
          </p>
          <p className="ant-upload-text">
            {isUploading ? t('creds.file.uploading') : t('creds.form.uploadHint')}
          </p>
          <p className="ant-upload-hint">{t('creds.form.uploadDesc')}</p>
        </UploadDragger>
        {fileName && (
          <div className="flex flex-row gap-[4px] items-center" style={{ marginTop: 8 }}>
            <span>
              {t('creds.form.selectedFile')}: {fileName}
            </span>
            <Button
              aria-label={t('cancel', { ns: 'common' })}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setFileHashId(null);
                setFileName('');
              }}
            >
              <X />
            </Button>
          </div>
        )}
      </Form.Item>

      <Form.Item
        label={t('creds.form.key')}
        name="key"
        rules={[
          { required: true, message: t('creds.form.keyRequired') },
          { pattern: /^[\w-]+$/, message: t('creds.form.keyPattern') },
        ]}
      >
        <Input disabled={disabled} placeholder="e.g., gcp-service-account" />
      </Form.Item>

      <Form.Item
        label={t('creds.form.name')}
        name="name"
        rules={[{ required: true, message: t('creds.form.nameRequired') }]}
      >
        <Input disabled={disabled} placeholder="e.g., GCP Service Account" />
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
          disabled={createMutation.isPending || !fileHashId || disabled}
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

export default FileCredForm;
