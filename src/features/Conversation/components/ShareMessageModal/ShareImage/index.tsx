import { agentDisplayName, type UIChatMessage } from '@orvilo/types';
import { cn } from 'cn';
import { CopyIcon } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Form, { type FormItemProps } from '@/components/GroupForm';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FORM_STYLE } from '@/const/layoutTokens';
import { useImgToClipboard } from '@/hooks/useImgToClipboard';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ImageType, imageTypeOptions, useScreenshot } from '@/hooks/useScreenshot';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import { contextSelectors, useConversationStore } from '../../../store';
import { styles } from '../style';
import Preview from './Preview';
import { type FieldType, WidthMode } from './type';

const DEFAULT_FIELD_VALUE: FieldType = {
  imageType: ImageType.JPG,
  widthMode: WidthMode.Wide,
  withBackground: false,
  withFooter: true,
};

const FormTabs = ({
  activeKey,
  onChange,
  options,
}: {
  activeKey?: string;
  onChange?: (key: string) => void;
  options: { key: string; label: ReactNode }[];
}) => (
  <Tabs value={activeKey} onValueChange={onChange}>
    <TabsList>
      {options.map((o) => (
        <TabsTrigger key={o.key} value={o.key}>
          {o.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);

const ShareImage = memo<{ message: UIChatMessage; mobile?: boolean; uniqueId?: string }>(
  ({ message, uniqueId }) => {
    const agentId = useConversationStore(contextSelectors.agentId);
    const currentAgentTitle = useAgentStore((s) =>
      agentDisplayName(agentSelectors.getAgentMetaById(agentId)(s)),
    );
    const context = useConversationStore((s) => s.context);
    const [fieldValue, setFieldValue] = useState<FieldType>(DEFAULT_FIELD_VALUE);
    const { t } = useTranslation(['chat', 'common']);

    const widthModeOptions = [
      { key: WidthMode.Wide, label: t('shareModal.widthMode.wide') },
      { key: WidthMode.Narrow, label: t('shareModal.widthMode.narrow') },
    ];

    // Generate a unique preview ID to avoid DOM conflicts
    const previewId = uniqueId ? `preview-${uniqueId}` : 'preview';

    const { loading, onDownload, title } = useScreenshot({
      id: `#${previewId}`,
      imageType: fieldValue.imageType,
      title: currentAgentTitle ?? undefined,
    });
    const { loading: copyLoading, onCopy } = useImgToClipboard({ id: `#${previewId}` });
    const settings: FormItemProps[] = [
      {
        children: <FormTabs options={widthModeOptions} />,
        label: t('shareModal.widthMode.label'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'widthMode',
        trigger: 'onChange',
        valuePropName: 'activeKey',
      },
      {
        children: <Switch />,
        label: t('shareModal.withBackground'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'withBackground',
        trigger: 'onCheckedChange',
        valuePropName: 'checked',
      },
      {
        children: <Switch />,
        label: t('shareModal.withFooter'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'withFooter',
        trigger: 'onCheckedChange',
        valuePropName: 'checked',
      },
      {
        children: <FormTabs options={imageTypeOptions} />,
        label: t('shareModal.imageType'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'imageType',
        trigger: 'onChange',
        valuePropName: 'activeKey',
      },
    ];

    const isMobile = useIsMobile();

    const button = (
      <>
        <Button
          className="w-full"
          loading={copyLoading}
          size="default"
          variant="default"
          onClick={() => onCopy()}
        >
          <CopyIcon data-icon="inline-start" /> {t('copy', { ns: 'common' })}
        </Button>
        <Button className="w-full" loading={loading} size="default" onClick={onDownload}>
          {t('shareModal.download')}
        </Button>
      </>
    );

    return (
      <>
        <div className={cn('flex gap-4', styles.body)}>
          <Preview
            context={context}
            title={title}
            {...fieldValue}
            message={message}
            previewId={previewId}
          />
          <div className={cn('flex flex-col gap-3', styles.sidebar)}>
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
        {isMobile && <div className={cn('flex gap-2', styles.footer)}>{button}</div>}
      </>
    );
  },
);

export default ShareImage;
