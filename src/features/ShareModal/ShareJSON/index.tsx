import { type TopicExportMode } from '@orvilo/types';
import { exportFile } from '@orvilo/utils/client';
import { cn } from 'cn';
import { CopyIcon } from 'lucide-react';
import { memo, useId, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/useIsMobile';
import { copyToClipboard } from '@/utils/clipboard';

import { useShareData } from '../ShareDataProvider';
import { styles } from '../style';
import { generateFullExport } from './generateFullExport';
import { generateMessages } from './generateMessages';
import Preview from './Preview';
import { type FieldType } from './type';

const DEFAULT_FIELD_VALUE: FieldType = {
  exportMode: 'full',
  includeTool: true,
  withSystemRole: true,
};

const ShareJSON = memo(() => {
  const { control, watch } = useForm<FieldType>({ defaultValues: DEFAULT_FIELD_VALUE });
  const fieldValue = watch();
  const formId = useId();
  const { t } = useTranslation(['chat', 'common']);

  const exportModeOptions = useMemo(
    () => [
      { key: 'full' as TopicExportMode, label: t('shareModal.exportMode.full') },
      { key: 'simple' as TopicExportMode, label: t('shareModal.exportMode.simple') },
    ],
    [t],
  );

  const { dbMessages, systemRole, title, topic } = useShareData();

  // Always include tool messages (includeTool: true)
  const data =
    fieldValue.exportMode === 'simple'
      ? generateMessages({
          ...fieldValue,
          includeTool: true,
          messages: dbMessages,
          systemRole: systemRole ?? '',
        })
      : generateFullExport({
          ...fieldValue,
          includeTool: true,
          messages: dbMessages,
          systemRole: systemRole ?? '',
          topic: topic ?? undefined,
        });

  const content = JSON.stringify(data, null, 2);

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
          exportFile(content, `${title}.json`);
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
            <Controller
              control={control}
              name="exportMode"
              render={({ field }) => (
                <Field className="py-2" orientation="vertical">
                  <FieldLabel className="text-sm leading-5.5" id={`${formId}-export-mode`}>
                    {t('shareModal.exportMode.label')}
                  </FieldLabel>
                  <Tabs value={field.value} onBlur={field.onBlur} onValueChange={field.onChange}>
                    <TabsList aria-labelledby={`${formId}-export-mode`} className="flex w-full">
                      {exportModeOptions.map((item) => (
                        <TabsTrigger className="flex-1" key={item.key} value={item.key}>
                          {item.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="withSystemRole"
              render={({ field }) => (
                <Field className="min-h-11 gap-4 py-2" orientation="horizontal">
                  <FieldLabel
                    className="min-w-0 text-sm leading-5.5"
                    htmlFor={`${formId}-with-system-role`}
                  >
                    {t('shareModal.withSystemRole')}
                  </FieldLabel>
                  <Switch
                    checked={field.value}
                    id={`${formId}-with-system-role`}
                    inputRef={field.ref}
                    name={field.name}
                    onBlur={field.onBlur}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
          </FieldGroup>
          {!isMobile && button}
        </div>
      </div>
      {isMobile && <div className={cn('flex flex-row gap-2', styles.footer)}>{button}</div>}
    </>
  );
});

export default ShareJSON;
