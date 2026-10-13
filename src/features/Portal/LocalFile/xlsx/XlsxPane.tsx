import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Loading from '@/components/Loading/CircleLoading';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { classifySheet } from './classifySheet';
import { MAX_PREVIEW_ROWS, readWorkbook, type SheetModel } from './model';
import SheetDocument from './SheetDocument';
import SheetGrid from './SheetGrid';

const styles = {
  container: 'flex h-full flex-col bg-card',
  footer: 'flex flex-none items-center justify-end gap-2 border-bs border-divider px-2 py-1.5',
  modes: 'h-9 w-auto flex-none rounded-(--radius-button)',
  tab: 'cursor-pointer border-0 bg-transparent px-3 py-1 text-muted-foreground hover:bg-accent data-[active=true]:bg-selected data-[active=true]:font-medium data-[active=true]:text-foreground',
  tabs: 'me-auto flex gap-1 overflow-x-auto',
  truncatedNote: 'flex-none border-bs border-divider px-3 py-1.5 text-xs text-foreground-tertiary',
} as const;

interface XlsxPaneProps {
  blob: Blob;
  onError: (error: unknown) => void;
}

const XlsxPane = memo<XlsxPaneProps>(({ blob, onError }) => {
  const { t } = useTranslation('chat');
  const [sheets, setSheets] = useState<SheetModel[]>();
  const [activeSheet, setActiveSheet] = useState(0);
  const [mode, setMode] = useState<'auto' | 'fidelity' | 'reflow'>('auto');

  useEffect(() => {
    let disposed = false;

    readWorkbook(blob)
      .then((parsed) => {
        if (disposed) return;
        setSheets(parsed);
        setActiveSheet(0);
        setMode('auto');
      })
      .catch((error) => {
        if (!disposed) onError(error);
      });

    return () => {
      disposed = true;
    };
  }, [blob, onError]);

  const sheet = sheets?.[activeSheet] ?? sheets?.[0];
  const outline = useMemo(() => (sheet ? classifySheet(sheet) : undefined), [sheet]);

  if (!sheet || !outline) return <Loading />;

  const resolvedMode = mode === 'auto' ? outline.mode : mode;

  return (
    <div className={styles.container}>
      {resolvedMode === 'reflow' ? (
        <SheetDocument outline={outline} />
      ) : (
        <SheetGrid sheet={sheet} />
      )}
      {sheet.truncated && (
        <div className={styles.truncatedNote}>
          {t('workingPanel.localFile.document.truncatedRows', { count: MAX_PREVIEW_ROWS })}
        </div>
      )}
      <div className={styles.footer}>
        <div className={styles.tabs}>
          {sheets!.map((item, index) => (
            <Button
              className={styles.tab}
              data-active={index === activeSheet}
              key={`${index}-${item.name}`}
              size="compact"
              type={'button'}
              variant="ghost"
              onClick={() => setActiveSheet(index)}
            >
              {item.name}
            </Button>
          ))}
        </div>
        <Tabs value={resolvedMode} onValueChange={(key) => setMode(key as 'fidelity' | 'reflow')}>
          <TabsList className={styles.modes}>
            <TabsTrigger
              className="rounded-(--radius-button) transition-[color,background-color,border-color,box-shadow] duration-(--orvilo-motion-mid) motion-reduce:transition-none"
              value="reflow"
            >
              {t('workingPanel.localFile.document.xlsxReflow')}
            </TabsTrigger>
            <TabsTrigger
              className="rounded-(--radius-button) transition-[color,background-color,border-color,box-shadow] duration-(--orvilo-motion-mid) motion-reduce:transition-none"
              value="fidelity"
            >
              {t('workingPanel.localFile.document.xlsxOriginal')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
});

XlsxPane.displayName = 'XlsxPane';

export default XlsxPane;
