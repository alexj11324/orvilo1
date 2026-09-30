'use client';

import { CheckCircleFilled, CloseCircleFilled, DownloadOutlined } from '@ant-design/icons';
import type { BuiltinRenderProps } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo, useCallback } from 'react';

import ActionIcon from '@/components/ActionIcon';

import type { ExportFileState } from '../../../types';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow: hidden;
    padding-inline: 8px 0;
  `,
  statusIcon: css`
    font-size: 12px;
  `,
}));

interface ExportFileParams {
  path: string;
}

const ExportFile = memo<BuiltinRenderProps<ExportFileParams, ExportFileState>>(
  ({ args, pluginState }) => {
    const isSuccess = pluginState?.success;

    const handleDownload = useCallback(async () => {
      if (!pluginState?.downloadUrl || !pluginState?.filename) return;

      try {
        // Fetch the file content to bypass cross-origin download restrictions
        const response = await fetch(pluginState.downloadUrl);
        const blob = await response.blob();

        // Create a blob URL and trigger download
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = pluginState.filename;
        document.body.append(link);
        link.click();
        link.remove();

        // Clean up the blob URL
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Fallback: open in new tab if fetch fails
        window.open(pluginState.downloadUrl, '_blank');
      }
    }, [pluginState?.downloadUrl, pluginState?.filename]);

    return (
      <div className={cx('flex flex-col gap-2', styles.container)}>
        <div className="flex flex-row items-center gap-2">
          {pluginState === undefined ? null : isSuccess ? (
            <CheckCircleFilled
              className={styles.statusIcon}
              style={{ color: cssVar.colorSuccess }}
            />
          ) : (
            <CloseCircleFilled className={styles.statusIcon} style={{ color: cssVar.colorError }} />
          )}
          <span className="font-mono rounded bg-muted px-1 text-[12px]">
            {isSuccess
              ? `Exported: ${pluginState?.filename || args.path}`
              : `Failed to export ${args.path}`}
          </span>
          {isSuccess && pluginState?.downloadUrl && (
            <ActionIcon
              icon={DownloadOutlined}
              size={'small'}
              title="Download"
              onClick={handleDownload}
            />
          )}
        </div>
      </div>
    );
  },
);

ExportFile.displayName = 'ExportFile';

export default ExportFile;
