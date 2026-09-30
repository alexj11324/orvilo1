import { copyToClipboard } from '@lobehub/ui';
import { Button, Switch, Tabs, toast } from '@lobehub/ui/base-ui';
import { type TopicExportMode } from '@orvilo/types';
import { exportFile } from '@orvilo/utils/client';
import { cx } from 'antd-style';
import { CopyIcon } from 'lucide-react';
import { cloneElement, memo, type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useIsMobile } from '@/hooks/useIsMobile';

import { useShareData } from '../ShareDataProvider';
import { styles } from '../style';
import { generateFullExport } from './generateFullExport';
import { generateMessages } from './generateMessages';
import Preview from './Preview';
import { type FieldType } from './type';

interface ShareFormItem {
  children: ReactElement<Record<string, unknown>>;
  label: ReactNode;
  layout?: 'horizontal' | 'vertical';
  name: keyof FieldType;
  valuePropName?: 'checked' | 'activeKey';
}

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

  const settings: ShareFormItem[] = [
    {
      children: (
        <Tabs
          activeKey={fieldValue.exportMode}
          items={exportModeOptions}
          styles={{
            list: { display: 'flex', width: '100%' },
            tab: { flex: 1 },
          }}
          onChange={(key) =>
            setFieldValue((prev) => ({ ...prev, exportMode: key as TopicExportMode }))
          }
        />
      ),
      label: t('shareModal.exportMode.label'),
      layout: 'vertical',
      name: 'exportMode',
    },
    {
      children: <Switch />,
      label: t('shareModal.withSystemRole'),
      layout: 'horizontal',
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
        block
        icon={CopyIcon}
        size={isMobile ? undefined : 'large'}
        type={'primary'}
        onClick={async () => {
          await copyToClipboard(content);
          toast.success(t('copySuccess', { ns: 'common' }));
        }}
      >
        {t('copy', { ns: 'common' })}
      </Button>
      <Button
        block
        size={isMobile ? undefined : 'large'}
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
      <div
        className={cx(styles.body, 'flex flex-col gap-4')}
        style={{ flexDirection: !isMobile ? 'row' : 'column' }}
      >
        <Preview content={content} />
        <div className={cx(styles.sidebar, 'flex flex-col gap-3')}>
          <FieldGroup>
            {settings.map((item) => (
              <Field
                key={String(item.name)}
                orientation={item.layout === 'vertical' ? 'vertical' : 'horizontal'}
              >
                <FieldLabel>{item.label}</FieldLabel>
                {item.valuePropName
                  ? cloneElement(item.children, {
                      [item.valuePropName]: fieldValue[item.name],
                      onChange: (v: unknown) => {
                        setFieldValue((prev) => ({ ...prev, [item.name]: v }) as typeof prev);
                        const onChange = item.children.props['onChange'];
                        if (typeof onChange === 'function') onChange(v);
                      },
                    })
                  : item.children}
              </Field>
            ))}
          </FieldGroup>
          {!isMobile && button}
        </div>
      </div>
      {isMobile && <div className={cx(styles.footer, 'flex gap-2')}>{button}</div>}
    </>
  );
});

export default ShareJSON;
