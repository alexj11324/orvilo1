import { FORM_STYLE } from '@orvilo/const';
import { exportFile } from '@orvilo/utils/client';
import { cx } from 'antd-style';
import { CopyIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form, { type FormItemProps } from '@/components/GroupForm';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/useIsMobile';
import { copyToClipboard } from '@/utils/clipboard';

import { useShareData } from '../ShareDataProvider';
import { styles } from '../style';
import Preview from './Preview';
import { generateMarkdown } from './template';
import { type FieldType } from './type';

interface FieldSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

const FieldSwitch = ({ checked, onChange }: FieldSwitchProps) => (
  <Switch checked={checked} onCheckedChange={onChange} />
);

const DEFAULT_FIELD_VALUE: FieldType = {
  includeTool: true,
  includeUser: true,
  withRole: true,
  withSystemRole: false,
};

const ShareText = memo(() => {
  const [fieldValue, setFieldValue] = useState(DEFAULT_FIELD_VALUE);
  const { t } = useTranslation(['chat', 'common']);

  const settings: FormItemProps[] = [
    {
      children: <FieldSwitch />,
      label: t('shareModal.withSystemRole'),
      layout: 'horizontal',
      minWidth: undefined,
      name: 'withSystemRole',
      valuePropName: 'checked',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.withRole'),
      layout: 'horizontal',
      minWidth: undefined,
      name: 'withRole',
      valuePropName: 'checked',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.includeUser'),
      layout: 'horizontal',
      minWidth: undefined,
      name: 'includeUser',
      valuePropName: 'checked',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.includeTool'),
      layout: 'horizontal',
      minWidth: undefined,
      name: 'includeTool',
      valuePropName: 'checked',
    },
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
      <div className={cx('flex flex-row gap-4', styles.body)}>
        <Preview content={content} />
        <div className={cx('flex flex-col gap-3', styles.sidebar)}>
          <Form
            initialValues={DEFAULT_FIELD_VALUE}
            items={settings}
            itemsType={'flat'}
            onValuesChange={(_, v) => setFieldValue(v)}
            {...FORM_STYLE}
          />
          {!isMobile && button}
        </div>
      </div>
      {isMobile && <div className={cx('flex flex-row gap-2', styles.footer)}>{button}</div>}
    </>
  );
});

export default ShareText;
