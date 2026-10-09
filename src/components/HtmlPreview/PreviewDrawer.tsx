import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { extractHtmlTitle } from '@orvilo/html-artifact';
import { exportFile } from '@orvilo/utils/client';
import { createStaticStyles } from 'antd-style';
import { Code2, Download, Eye, RotateCw } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
} from '@/components/ai-elements/web-preview';
import { CodeBlock, CodeBlockCopyButton } from '@/components/reui/code-block/code-block';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isDesktop } from '@/const/version';

import InlineHtmlPreview from './InlinePreview';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    height: 100%;
  `,
}));

interface HtmlPreviewDrawerProps {
  content: string;
  onClose: () => void;
  open: boolean;
}

const HtmlPreviewDrawer = memo<HtmlPreviewDrawerProps>(({ content, open, onClose }) => {
  const { t } = useTranslation('components');
  const [revision, setRevision] = useState(0);
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
        <div className="min-h-0 flex-1">
          {mode === 'preview' ? (
            <div className={styles.container}>
              <WebPreview>
                <WebPreviewNavigation>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {extractHtmlTitle(content) || t('HtmlPreview.title')}
                  </span>
                  <WebPreviewNavigationButton
                    aria-label={t('refresh', { ns: 'common' })}
                    tooltip={t('refresh', { ns: 'common' })}
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    <RotateCw className="size-4" />
                  </WebPreviewNavigationButton>
                </WebPreviewNavigation>
                <InlineHtmlPreview content={content} key={revision} />
              </WebPreview>
            </div>
          ) : (
            <div className={styles.container}>
              <CodeBlock
                code={content}
                language={'html'}
                style={{ height: '100%', overflow: 'auto' }}
              >
                <CodeBlockCopyButton />
              </CodeBlock>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});

HtmlPreviewDrawer.displayName = 'HtmlPreviewDrawer';

export default HtmlPreviewDrawer;
