import { Button, Switch, Tabs } from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import { CopyIcon } from 'lucide-react';
import { cloneElement, memo, type ReactElement, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useImgToClipboard } from '@/hooks/useImgToClipboard';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ImageType, imageTypeOptions, useScreenshot } from '@/hooks/useScreenshot';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import { useShareData } from '../ShareDataProvider';
import { styles } from '../style';
import Preview from './Preview';
import { type FieldType } from './type';
import { WidthMode } from './type';

interface ShareFormItem {
  children: ReactElement<Record<string, unknown>>;
  label: ReactNode;
  layout?: 'horizontal' | 'vertical';
  name: keyof FieldType;
  valuePropName?: 'checked' | 'activeKey';
}

const DEFAULT_FIELD_VALUE: FieldType = {
  imageType: ImageType.JPG,
  widthMode: WidthMode.Wide,
  withBackground: false,
  withFooter: true,
  withPluginInfo: false,
  withSystemRole: false,
};

const ShareImage = memo<{ mobile?: boolean }>(() => {
  const currentAgentTitle = useAgentStore(agentSelectors.currentAgentDisplayName);
  const [fieldValue, setFieldValue] = useState<FieldType>(DEFAULT_FIELD_VALUE);
  const { t } = useTranslation(['chat', 'common']);
  const { context, dbMessages } = useShareData();
  const { loading, onDownload, title } = useScreenshot({
    imageType: fieldValue.imageType,
    title: currentAgentTitle ?? undefined,
  });
  const { loading: copyLoading, onCopy } = useImgToClipboard();

  const widthModeOptions = [
    { key: WidthMode.Wide, label: t('shareModal.widthMode.wide') },
    { key: WidthMode.Narrow, label: t('shareModal.widthMode.narrow') },
  ];

  const settings: ShareFormItem[] = [
    {
      children: <Tabs items={widthModeOptions} />,
      label: t('shareModal.widthMode.label'),
      layout: 'horizontal',
      name: 'widthMode',
      valuePropName: 'activeKey',
    },
    {
      children: <Switch />,
      label: t('shareModal.withSystemRole'),
      layout: 'horizontal',
      name: 'withSystemRole',
      valuePropName: 'checked',
    },
    {
      children: <Switch />,
      label: t('shareModal.withFooter'),
      layout: 'horizontal',
      name: 'withFooter',
      valuePropName: 'checked',
    },
    {
      children: <Tabs items={imageTypeOptions} />,
      label: t('shareModal.imageType'),
      layout: 'horizontal',
      name: 'imageType',
      valuePropName: 'activeKey',
    },
  ];

  const isMobile = useIsMobile();

  const button = (
    <>
      <Button
        block
        icon={CopyIcon}
        loading={copyLoading}
        size={isMobile ? undefined : 'large'}
        type={'primary'}
        onClick={() => onCopy()}
      >
        {t('copy', { ns: 'common' })}
      </Button>
      <Button block loading={loading} size={isMobile ? undefined : 'large'} onClick={onDownload}>
        {t('shareModal.download')}
      </Button>
    </>
  );

  return (
    <>
      <div
        className={cx(styles.body, 'flex flex-col gap-4')}
        style={{ flexDirection: !isMobile ? 'row' : 'column' }}
      >
        <Preview context={context} messages={dbMessages} title={title} {...fieldValue} />
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

export default ShareImage;
