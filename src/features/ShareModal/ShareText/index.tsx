import { copyToClipboard } from '@lobehub/ui';
import { Button, Switch, toast } from '@lobehub/ui/base-ui';
import { exportFile } from '@orvilo/utils/client';
import { cx } from 'antd-style';
import { CopyIcon } from 'lucide-react';
import { cloneElement, memo, type ReactElement, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useIsMobile } from '@/hooks/useIsMobile';

import { useShareData } from '../ShareDataProvider';
import { styles } from '../style';
import Preview from './Preview';
import { generateMarkdown } from './template';
import { type FieldType } from './type';

interface ShareFormItem {
  children: ReactElement<Record<string, unknown>>;
  label: ReactNode;
  layout?: 'horizontal' | 'vertical';
  name: keyof FieldType;
  valuePropName?: 'checked' | 'activeKey';
}

const DEFAULT_FIELD_VALUE: FieldType = {
  includeTool: true,
  includeUser: true,
  withRole: true,
  withSystemRole: false,
};

const ShareText = memo(() => {
  const [fieldValue, setFieldValue] = useState(DEFAULT_FIELD_VALUE);
  const { t } = useTranslation(['chat', 'common']);

  const settings: ShareFormItem[] = [
    {
      children: <Switch />,
      label: t('shareModal.withSystemRole'),
      layout: 'horizontal',
      name: 'withSystemRole',
      valuePropName: 'checked',
    },
    {
      children: <Switch />,
      label: t('shareModal.withRole'),
      layout: 'horizontal',
      name: 'withRole',
      valuePropName: 'checked',
    },
    {
      children: <Switch />,
      label: t('shareModal.includeUser'),
      layout: 'horizontal',
      name: 'includeUser',
      valuePropName: 'checked',
    },
    {
      children: <Switch />,
      label: t('shareModal.includeTool'),
      layout: 'horizontal',
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
          exportFile(content, `${title}.md`);
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

export default ShareText;
