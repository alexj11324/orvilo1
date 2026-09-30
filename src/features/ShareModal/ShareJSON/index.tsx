import { FORM_STYLE } from '@orvilo/const';
import { type TopicExportMode } from '@orvilo/types';
import { exportFile } from '@orvilo/utils/client';
import { cx } from 'antd-style';
import { CopyIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form, { type FormItemProps } from '@/components/GroupForm';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
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

interface FieldSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

const FieldSwitch = ({ checked, onChange }: FieldSwitchProps) => (
  <Switch checked={checked} onCheckedChange={onChange} />
);

const DEFAULT_FIELD_VALUE: FieldType = {
  exportMode: 'full',
  includeTool: true,
  withSystemRole: true,
};

const ShareJSON = memo(() => {
  const [fieldValue, setFieldValue] = useState(DEFAULT_FIELD_VALUE);
  const { t } = useTranslation(['chat', 'common']);

  const exportModeOptions = useMemo(
    () => [
      { key: 'full' as TopicExportMode, label: t('shareModal.exportMode.full') },
      { key: 'simple' as TopicExportMode, label: t('shareModal.exportMode.simple') },
    ],
    [t],
  );

  const settings: FormItemProps[] = [
    {
      children: (
        <Tabs
          value={fieldValue.exportMode}
          onValueChange={(key) =>
            setFieldValue((prev) => ({ ...prev, exportMode: key as TopicExportMode }))
          }
        >
          <TabsList className="flex w-full">
            {exportModeOptions.map((item) => (
              <TabsTrigger className="flex-1" key={item.key} value={item.key}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ),
      label: t('shareModal.exportMode.label'),
      layout: 'vertical',
      minWidth: undefined,
      name: 'exportMode',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.withSystemRole'),
      layout: 'horizontal',
      minWidth: undefined,
      name: 'withSystemRole',
      valuePropName: 'checked',
    },
  ];

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
      <div className={cx('flex flex-row gap-4', styles.body)}>
        <Preview content={content} />
        <div className={cx('flex flex-col gap-3', styles.sidebar)}>
          <Form
            initialValues={DEFAULT_FIELD_VALUE}
            itemMinWidth={FORM_STYLE.itemMinWidth}
            items={settings}
            itemsType={'flat'}
            style={FORM_STYLE.style}
            onValuesChange={(_, v) => setFieldValue(v)}
          />
          {!isMobile && button}
        </div>
      </div>
      {isMobile && <div className={cx('flex flex-row gap-2', styles.footer)}>{button}</div>}
    </>
  );
});

export default ShareJSON;
