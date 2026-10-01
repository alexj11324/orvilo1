import { cx } from 'antd-style';
import { CopyIcon } from 'lucide-react';
import { cloneElement, memo, type ReactElement, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

interface FieldSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

const FieldSwitch = ({ checked, onChange }: FieldSwitchProps) => (
  <Switch checked={checked} onCheckedChange={onChange} />
);

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

interface FieldTabsProps {
  activeKey?: string;
  items: { key: string; label: ReactNode }[];
  onChange?: (value: string) => void;
}

const FieldTabs = ({ activeKey, items, onChange }: FieldTabsProps) => (
  <Tabs value={activeKey} onValueChange={(value) => onChange?.(value)}>
    <TabsList className="flex w-full">
      {items.map((item) => (
        <TabsTrigger className="flex-1" key={item.key} value={item.key}>
          {item.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

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
      children: <FieldTabs items={widthModeOptions} />,
      label: t('shareModal.widthMode.label'),
      layout: 'horizontal',
      name: 'widthMode',
      valuePropName: 'activeKey',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.withSystemRole'),
      layout: 'horizontal',
      name: 'withSystemRole',
      valuePropName: 'checked',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.withFooter'),
      layout: 'horizontal',
      name: 'withFooter',
      valuePropName: 'checked',
    },
    {
      children: <FieldTabs items={imageTypeOptions} />,
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
        className="w-full"
        loading={copyLoading}
        size={isMobile ? undefined : 'lg'}
        variant="default"
        onClick={() => onCopy()}
      >
        <CopyIcon data-icon="inline-start" />
        {t('copy', { ns: 'common' })}
      </Button>
      <Button
        className="w-full"
        loading={loading}
        size={isMobile ? undefined : 'lg'}
        variant="outline"
        onClick={onDownload}
      >
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
