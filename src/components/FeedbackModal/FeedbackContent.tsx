'use client';

import { Button, toast, Upload, useModalContext } from '@lobehub/ui/base-ui';
import { BRANDING_EMAIL } from '@orvilo/business-const';
import { ImagePlus, Send } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import TextArea from '@/components/TextArea';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { lambdaClient } from '@/libs/trpc/client';
import { useFileStore } from '@/store/file';
import { userProfileSelectors } from '@/store/user/selectors';
import { useUserStore } from '@/store/user/store';

import type { FeedbackInitialValues } from './types';

interface FeedbackContentProps {
  initialValues?: FeedbackInitialValues;
}

const FeedbackContent = memo<FeedbackContentProps>(({ initialValues }) => {
  const { t } = useTranslation('common');

  const { close } = useModalContext();
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [message, setMessage] = useState(initialValues?.message ?? '');
  const [errors, setErrors] = useState<{ message?: string; title?: string }>({});

  const [loading, setLoading] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);

  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const userEmail = useUserStore(userProfileSelectors.email);

  const handleScreenshotUpload = useCallback(
    async (file: File) => {
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB
      if (file.size > MAX_SIZE) {
        toast.error(t('feedback.errors.fileTooLarge'));
        return;
      }

      setUploadingScreenshot(true);
      try {
        const result = await uploadWithProgress({ file });
        if (result?.url) {
          setScreenshotUrl(result.url);
          toast.success(t('feedback.screenshotUploaded'));
        }
      } catch (error) {
        console.error('[FeedbackModal] Screenshot upload failed:', error);
        toast.error(t('feedback.errors.uploadFailed'));
      } finally {
        setUploadingScreenshot(false);
      }
    },
    [t, uploadWithProgress],
  );

  const handleRemoveScreenshot = useCallback(() => {
    setScreenshotUrl(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const nextErrors: { message?: string; title?: string } = {};
    if (!title.trim()) nextErrors.title = t('feedback.fields.title.required');
    if (!message.trim()) nextErrors.message = t('feedback.fields.message.required');
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.message) return;

    setLoading(true);
    try {
      await lambdaClient.market.submitFeedback.mutate({
        clientInfo: {
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
        email: userEmail || undefined,
        message,
        screenshotUrl: screenshotUrl || undefined,
        title,
      });

      toast.success(t('feedback.success'));
      setTitle(initialValues?.title ?? '');
      setMessage(initialValues?.message ?? '');
      setScreenshotUrl(null);
      close();
    } catch (error: any) {
      console.error('[FeedbackModal] Submission failed:', error);
      toast.error(t('feedback.errors.submitFailed'));
    } finally {
      setLoading(false);
    }
  }, [close, initialValues, message, screenshotUrl, t, title, userEmail]);

  const handleCancel = useCallback(() => {
    setTitle(initialValues?.title ?? '');
    setMessage(initialValues?.message ?? '');
    setErrors({});
    setScreenshotUrl(null);
    close();
  }, [close, initialValues]);

  return (
    <div className="flex flex-col gap-4">
      <p style={{ color: 'var(--colorTextSecondary)', fontSize: 14, margin: 0 }}>
        <Trans
          i18nKey="feedback.emailContact"
          ns="common"
          values={{ email: BRANDING_EMAIL.business }}
          components={{
            email: (
              <a
                href={`mailto:${BRANDING_EMAIL.business}`}
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline' }}
                target="_blank"
              />
            ),
          }}
        />
      </p>

      <div className="flex flex-col gap-4">
        <Field data-invalid={!!errors.title || undefined}>
          <FieldLabel>{t('feedback.fields.title.label')}</FieldLabel>
          <div className="relative">
            <Input
              aria-invalid={!!errors.title || undefined}
              maxLength={200}
              placeholder={t('feedback.fields.title.placeholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <span
              style={{
                color: 'var(--colorTextSecondary)',
                fontSize: 12,
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              {title.length}/200
            </span>
          </div>
          {errors.title ? <FieldError>{errors.title}</FieldError> : null}
        </Field>

        <Field data-invalid={!!errors.message || undefined}>
          <FieldLabel>{t('feedback.fields.message.label')}</FieldLabel>
          <div className="relative">
            <TextArea
              aria-invalid={!!errors.message || undefined}
              maxLength={5000}
              placeholder={t('feedback.fields.message.placeholder')}
              rows={6}
              value={message}
              onChange={(v) => setMessage(v)}
            />
            <span
              style={{
                bottom: 8,
                color: 'var(--colorTextSecondary)',
                fontSize: 12,
                position: 'absolute',
                right: 8,
              }}
            >
              {message.length}/5000
            </span>
          </div>
          {errors.message ? <FieldError>{errors.message}</FieldError> : null}
        </Field>

        <Field style={{ marginBottom: 0 }}>
          <FieldLabel>{t('feedback.fields.screenshot.label')}</FieldLabel>
          <div className="flex flex-col gap-2">
            {screenshotUrl ? (
              <div className="flex flex-col gap-2">
                <img
                  alt="Screenshot"
                  src={screenshotUrl}
                  style={{ borderRadius: 8, maxHeight: 200, maxWidth: '100%' }}
                />
                <Button danger disabled={uploadingScreenshot} onClick={handleRemoveScreenshot}>
                  {t('feedback.fields.screenshot.remove')}
                </Button>
              </div>
            ) : (
              <Upload
                accept="image/*"

                beforeUpload={(file) => {
                  handleScreenshotUpload(file);
                  return false;
                }}
              >
                <Button icon={<ImagePlus size={16} />} loading={uploadingScreenshot}>
                  {uploadingScreenshot
                    ? t('feedback.fields.screenshot.uploading')
                    : t('feedback.fields.screenshot.upload')}
                </Button>
              </Upload>
            )}
          </div>
          <p style={{ color: 'var(--colorTextSecondary)', fontSize: 12, marginTop: 8 }}>
            {t('feedback.fields.screenshot.hint')}
          </p>
        </Field>
      </div>

      <div className="flex gap-2 justify-end">
        <Button onClick={handleCancel}>{t('cancel')}</Button>
        <Button icon={<Send size={16} />} loading={loading} type="primary" onClick={handleSubmit}>
          {t('feedback.submit')}
        </Button>
      </div>
    </div>
  );
});

FeedbackContent.displayName = 'FeedbackContent';

export default FeedbackContent;
