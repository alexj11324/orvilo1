import { type UIChatMessage } from '@orvilo/types';
import { cx } from 'antd-style';
import { DownloadIcon, FileText } from 'lucide-react';
import { cloneElement, memo, type ReactElement, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';

import { useShareData } from '../ShareDataProvider';
import { generateMarkdown } from '../ShareText/template';
import { type FieldType } from '../ShareText/type';
import { containerStyles, styles } from '../style';
import PdfPreview from './PdfPreview';
import { usePdfGeneration } from './usePdfGeneration';

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
  includeTool: true,
  includeUser: true,
  withRole: true,
  withSystemRole: false,
};

const SharePdf = memo((props: { message?: UIChatMessage }) => {
  const [fieldValue, setFieldValue] = useState(DEFAULT_FIELD_VALUE);
  const { t } = useTranslation(['chat', 'common']);

  const { message: outerMessage } = props;
  const isMobile = useIsMobile();

  const settings: ShareFormItem[] = [
    {
      children: <FieldSwitch />,
      label: t('shareModal.withSystemRole'),
      layout: 'horizontal',
      name: 'withSystemRole',
      valuePropName: 'checked',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.withRole'),
      layout: 'horizontal',
      name: 'withRole',
      valuePropName: 'checked',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.includeUser'),
      layout: 'horizontal',
      name: 'includeUser',
      valuePropName: 'checked',
    },
    {
      children: <FieldSwitch />,
      label: t('shareModal.includeTool'),
      layout: 'horizontal',
      name: 'includeTool',
      valuePropName: 'checked',
    },
  ];

  // Use the same data gathering logic as ShareText
  const [systemRole] = useAgentStore((s) => [agentSelectors.currentAgentSystemRole(s)]);
  const activeId = useChatStore((s) => s.activeAgentId);
  const { context, displayMessages, title } = useShareData();

  const { generatePdf, downloadPdf, pdfData, loading, error } = usePdfGeneration();

  const handleGeneratePdf = async () => {
    if (activeId && displayMessages.length > 0) {
      // Generate markdown with current field values
      const currentMarkdownContent = generateMarkdown({
        ...fieldValue,
        messages: outerMessage ? [outerMessage] : displayMessages,
        systemRole,
        title,
      }).replaceAll('\n\n\n', '\n');

      if (currentMarkdownContent.trim()) {
        await generatePdf({
          content: currentMarkdownContent,
          sessionId: activeId,
          title,
          topicId: context.topicId || undefined,
        });
      }
    }
  };

  const handleDownload = async () => {
    if (pdfData) {
      try {
        await downloadPdf();
        toast.success(t('shareModal.downloadSuccess'));
      } catch {
        toast.error(t('shareModal.downloadError'));
      }
    }
  };

  const generateButton = (
    <Button
      className="w-full"
      disabled={loading}
      loading={loading}
      size={isMobile ? undefined : 'lg'}
      variant="default"
      onClick={handleGeneratePdf}
    >
      {loading ? undefined : <FileText data-icon="inline-start" />}
      {loading
        ? t('shareModal.generatingPdf')
        : pdfData
          ? t('shareModal.regeneratePdf')
          : t('shareModal.generatePdf')}
    </Button>
  );

  const downloadButton = pdfData ? (
    <Button
      className="w-full"
      size={isMobile ? undefined : 'lg'}
      variant="default"
      onClick={handleDownload}
    >
      <DownloadIcon data-icon="inline-start" />
      {t('shareModal.downloadPdf')}
    </Button>
  ) : null;

  if (error) {
    return (
      <div
        className={cx(styles.body, 'flex flex-col gap-4')}
        style={{ flexDirection: !isMobile ? 'row' : 'column' }}
      >
        <div
          className={cx(containerStyles.preview, containerStyles.previewWide)}
          style={{ padding: 12 }}
        >
          <div style={{ color: 'red', textAlign: 'center' }}>
            {t('shareModal.pdfGenerationError')}: {error}
          </div>
        </div>
        <div className={cx(styles.sidebar, 'flex flex-col gap-3')}>
          <div>{t('shareModal.pdfErrorDescription')}</div>
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
          {generateButton}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(styles.body, 'flex flex-col gap-4')}
      style={{ flexDirection: !isMobile ? 'row' : 'column' }}
    >
      <PdfPreview loading={loading} pdfData={pdfData} onGeneratePdf={handleGeneratePdf} />
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
        {pdfData && generateButton}
        {downloadButton}
      </div>
    </div>
  );
});

export default SharePdf;
