import { HtmlPreview } from '@lobehub/ui';
import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { extractHtmlTitle } from '@orvilo/html-artifact';
import { exportFile } from '@orvilo/utils/client';
import { createStaticStyles } from 'antd-style';
import { Code2, Download, Eye } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock } from '@/components/reui/code-block/code-block';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isDesktop } from '@/const/version';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    height: 100%;
  `,
}));

const hideHtmlPreviewActions = () => null;

interface HtmlPreviewDrawerProps {
  content: string;
  onClose: () => void;
  open: boolean;
}

const HtmlPreviewDrawer = memo<HtmlPreviewDrawerProps>(({ content, open, onClose }) => {
  const { t } = useTranslation('components');
  const [mode, setMode] = useState<'preview' | 'code'>('preview');

  const sanitizeFileName = useCallback((name: string) => {
    return name
      .replaceAll(/["*/:<>?\\|]/g, '-')
      .replaceAll(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }, []);

  const onDownload = useCallback(() => {
    const title = extractHtmlTitle(content);
    const base = title ? sanitizeFileName(title) : `chat-html-preview-${Date.now()}`;
    exportFile(content, `${base}.html`);
  }, [content, sanitizeFileName]);

  const extra = (
    <div className={'flex gap-2 items-center'}>
      <Tabs value={mode} onValueChange={(key) => setMode(key as 'preview' | 'code')}>
        <TabsList>
          <TabsTrigger value="preview">
            <div className={'flex items-center'} style={{ gap: 6 }}>
              <Eye size={16} />
              {t('HtmlPreview.mode.preview')}
            </div>
          </TabsTrigger>
          <TabsTrigger value="code">
            <div className={'flex items-center'} style={{ gap: 6 }}>
              <Code2 size={16} />
              {t('HtmlPreview.mode.code')}
            </div>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Button onClick={onDownload}>
        <Download size={16} />
        {t('HtmlPreview.actions.download')}
      </Button>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        style={{
          height: isDesktop ? `calc(100vh - ${TITLE_BAR_HEIGHT}px)` : '100vh',
          maxWidth: 'none',
          padding: 0,
        }}
      >
        <SheetHeader style={{ paddingBlock: 8, paddingInline: 12 }}>
          <SheetTitle>{t('HtmlPreview.title')}</SheetTitle>
          {extra}
        </SheetHeader>
        <div style={{ height: '100%' }}>
          {mode === 'preview' ? (
            <div className={styles.container}>
              <HtmlPreview
                actionsRender={hideHtmlPreviewActions}
                copyable={false}
                downloadable={false}
                style={{ height: '100%' }}
                styles={{ iframe: { height: '100%' } }}
                title={t('HtmlPreview.iframeTitle')}
                variant={'borderless'}
              >
                {content}
              </HtmlPreview>
            </div>
          ) : (
            <div className={styles.container}>
              <CodeBlock
                code={content}
                language={'html'}
                style={{ height: '100%', overflow: 'auto' }}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});

HtmlPreviewDrawer.displayName = 'HtmlPreviewDrawer';

export default HtmlPreviewDrawer;
