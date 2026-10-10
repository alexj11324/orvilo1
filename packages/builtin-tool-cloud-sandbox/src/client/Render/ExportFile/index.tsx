'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { cn } from 'cn';
import { CircleCheck, CircleX, Download } from 'lucide-react';
import { memo, useCallback } from 'react';

import ActionIcon from '@/components/ActionIcon';

import type { ExportFileState } from '../../../types';

const styles = { container: 'overflow-hidden ps-2 pe-0', statusIcon: 'text-xs leading-[inherit]' };

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
      <div className={cn('flex flex-col gap-2', styles.container)}>
        <div className="flex flex-row items-center gap-2">
          {pluginState === undefined ? null : isSuccess ? (
            <CircleCheck className={styles.statusIcon} style={{ color: 'var(--success)' }} />
          ) : (
            <CircleX className={styles.statusIcon} style={{ color: 'var(--destructive)' }} />
          )}
          <span className="font-mono rounded bg-muted px-1 text-[12px]">
            {isSuccess
              ? `Exported: ${pluginState?.filename || args.path}`
              : `Failed to export ${args.path}`}
          </span>
          {isSuccess && pluginState?.downloadUrl && (
            <ActionIcon icon={Download} size={'small'} title="Download" onClick={handleDownload} />
          )}
        </div>
      </div>
    );
  },
);

ExportFile.displayName = 'ExportFile';

export default ExportFile;
