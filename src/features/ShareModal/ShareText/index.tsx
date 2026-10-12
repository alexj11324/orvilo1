import { exportFile } from '@orvilo/utils/client';
import { cn } from 'cn';
import { CopyIcon } from 'lucide-react';
import { memo, useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/useIsMobile';
import { copyToClipboard } from '@/utils/clipboard';

import { useShareData } from '../ShareDataProvider';
import { styles } from '../style';
import Preview from './Preview';
import { generateMarkdown } from './template';
import { type FieldType } from './type';

const DEFAULT_FIELD_VALUE: FieldType = {
  includeTool: true,
  includeUser: true,
  withRole: true,
  withSystemRole: false,
};

const ShareText = memo(() => {
  const { control, watch } = useForm<FieldType>({ defaultValues: DEFAULT_FIELD_VALUE });
  const fieldValue = watch();
  const formId = useId();
  const { t } = useTranslation(['chat', 'common']);

  const settings: { label: string; name: keyof FieldType }[] = [
    { label: t('shareModal.withSystemRole'), name: 'withSystemRole' },
    { label: t('shareModal.withRole'), name: 'withRole' },
    { label: t('shareModal.includeUser'), name: 'includeUser' },
    { label: t('shareModal.includeTool'), name: 'includeTool' },
  ];

  const { displayMessages, systemRole, title } = useShareData();
  const content = generateMarkdown({
    ...fieldValue,
    messages: displayMessages,
    systemRole: systemRole ?? '',
    title,
  }).replaceAll('\n\n\n', '\n');

  const isMobile = useIsMobile();

  const button = (
    <>
      <Button
        className="w-full"
        size={isMobile ? undefined : 'lg'}
        variant="default"
        onClick={async () => {
          await copyToClipboard(content);
          toast.success(t('copySuccess', { ns: 'common' }));
        }}
      >
        <CopyIcon data-icon="inline-start" />
        {t('copy', { ns: 'common' })}
      </Button>
      <Button
        className="w-full"
        size={isMobile ? undefined : 'lg'}
        variant="outline"
        onClick={() => {
          exportFile(content, `${title}.md`);
        }}
      >
        {t('shareModal.downloadFile')}
      </Button>
    </>
  );

  return (
    <>
      <div className={cn('flex flex-row gap-4', styles.body)}>
        <Preview content={content} />
        <div className={cn('flex flex-col gap-3', styles.sidebar)}>
          <FieldGroup className="max-w-256 gap-0">
            {settings.map((item) => (
              <Controller
                control={control}
                key={item.name}
                name={item.name}
                render={({ field }) => (
                  <Field className="min-h-11 gap-4 py-2" orientation="horizontal">
                    <FieldLabel
                      className="min-w-0 text-sm leading-5.5"
                      htmlFor={`${formId}-${field.name}`}
                    >
                      {item.label}
                    </FieldLabel>
                    <Switch
                      checked={field.value}
                      id={`${formId}-${field.name}`}
                      inputRef={field.ref}
                      name={field.name}
                      onBlur={field.onBlur}
                      onCheckedChange={field.onChange}
                    />
                  </Field>
                )}
              />
            ))}
          </FieldGroup>
          {!isMobile && button}
        </div>
      </div>
      {isMobile && <div className={cn('flex flex-row gap-2', styles.footer)}>{button}</div>}
    </>
  );
});

export default ShareText;
