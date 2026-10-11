'use client';

import { FilePathDisplay } from '@orvilo/shared-tool-ui/components';
import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type CodexFileChangeArgs, type CodexFileChangeState, getFileChangeStats } from './utils';

const styles = {
  count: 'ms-1 text-xs leading-5 text-muted-foreground',
  lineAdded: 'ms-1.5 text-xs leading-5 text-success-text',
  lineDeleted: 'ms-1 text-xs leading-5 text-destructive-text',
  summary: 'me-1.5',
};

const FileChangeInspector = memo<BuiltinInspectorProps<CodexFileChangeArgs, CodexFileChangeState>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading, pluginState }) => {
    const { t } = useTranslation('plugin');
    const stats = getFileChangeStats(args || partialArgs, pluginState);
    const hasLineStats = stats.linesAdded > 0 || stats.linesDeleted > 0;
    const isEditing = isArgumentsStreaming || isLoading;
    const summary = isEditing
      ? t('builtins.codex.fileChange.editing', { defaultValue: 'Editing files' })
      : stats.total > 0
        ? t('builtins.codex.fileChange.editedFiles', {
            count: stats.total,
            defaultValue: stats.total === 1 ? 'Edited {{count}} file' : 'Edited {{count}} files',
          })
        : t('builtins.codex.fileChange.noChanges', { defaultValue: 'No file changes' });

    if (isEditing && !stats.firstPath) {
      return (
        <div className={cx(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{summary}</div>
      );
    }

    return (
      <div className={cx(inspectorTextStyles.root, isEditing && shinyTextStyles.shinyText)}>
        {stats.firstPath ? (
          <>
            <span className={styles.summary}>{summary}:</span>
            <FilePathDisplay filePath={stats.firstPath} />
          </>
        ) : (
          <span>{summary}</span>
        )}
        {stats.total > 1 && <span className={styles.count}>+{stats.total - 1}</span>}
        {hasLineStats && (
          <>
            <span className={styles.lineAdded}>+{stats.linesAdded}</span>
            <span className={styles.lineDeleted}>-{stats.linesDeleted}</span>
          </>
        )}
      </div>
    );
  },
);

FileChangeInspector.displayName = 'CodexFileChangeInspector';

export default FileChangeInspector;
