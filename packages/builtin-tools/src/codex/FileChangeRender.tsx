'use client';

import {
  FilePathDisplay,
  getFileLanguage,
  getFileName,
  KindDot,
  LineStats,
} from '@orvilo/shared-tool-ui/components';
import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { CodeBlock, parseUnifiedDiff } from '@/components/ui/code-block';

import {
  type CodexFileChangeArgs,
  type CodexFileChangeState,
  getFileChangeData,
  getFileChangeKind,
  getFileChangeStats,
} from './utils';

const styles = {
  emptyState: 'p-1 text-sm leading-5.5 text-muted-foreground',
  list: 'min-w-0 gap-0.5 px-1 py-0.5',
  patch: 'overflow-hidden pbe-2 ps-4',
  rowMain: 'flex min-w-0 flex-1 items-center gap-2.5',
  path: 'flex min-w-0 items-center overflow-hidden',
  row: 'min-h-8 items-center gap-2 px-0 py-1 text-sm leading-5.5',
  unknownPath: 'text-sm leading-5.5 text-muted-foreground',
};

const FileChangeRender = memo<BuiltinRenderProps<CodexFileChangeArgs, CodexFileChangeState>>(
  ({ args, pluginState }) => {
    const { t } = useTranslation('plugin');
    const stats = getFileChangeStats(args, pluginState);
    const data = getFileChangeData(args, pluginState);

    if (stats.total === 0) {
      return (
        <div className={styles.emptyState}>
          {t('builtins.codex.fileChange.noChanges', { defaultValue: 'No file changes' })}
        </div>
      );
    }

    return (
      <div className={cn('flex', 'flex-col', styles.list)}>
        {data.changes.map((change, index) => {
          const kind = getFileChangeKind(change.kind);
          const path = change.path || '';

          return (
            <div className="flex flex-col" key={`${path}-${index}`}>
              <div className={cn('flex', styles.row)}>
                <KindDot kind={kind} />
                <div className={styles.rowMain}>
                  <div className={styles.path}>
                    {path ? (
                      <FilePathDisplay filePath={path} />
                    ) : (
                      <div className={styles.unknownPath}>
                        {t('builtins.codex.fileChange.unknownFile', {
                          defaultValue: 'Unknown file',
                        })}
                      </div>
                    )}
                  </div>
                  <LineStats linesAdded={change.linesAdded} linesDeleted={change.linesDeleted} />
                </div>
              </div>
              {change.diffText && (
                <div className={styles.patch}>
                  {parseUnifiedDiff(change.diffText).map((file) => (
                    <CodeBlock
                      key={file.file}
                      label={getFileName(path)}
                      language={getFileLanguage(path)}
                      lines={file.lines}
                      variant="ghost"
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  },
);

FileChangeRender.displayName = 'CodexFileChangeRender';

export default FileChangeRender;
