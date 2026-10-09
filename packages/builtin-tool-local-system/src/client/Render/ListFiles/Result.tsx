import { useToolRenderCapabilities } from '@orvilo/shared-tool-ui';
import type { ChatMessagePluginError } from '@orvilo/types';
import { FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  FileTree,
  FileTreeActions,
  FileTreeFile,
  FileTreeIcon,
  FileTreeName,
} from '@/components/ai-elements/file-tree';
import SimpleEmpty from '@/components/SimpleEmpty';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatSize } from '@/utils/format';

interface SearchFilesProps {
  listResults?: Array<{ isDirectory: boolean; name: string; path?: string; size?: number }>;
  messageId: string;
  pluginError: ChatMessagePluginError;
}

const SearchFiles = memo<SearchFilesProps>(({ listResults = [], messageId, pluginError }) => {
  const { isLoading, openFile, openFolder } = useToolRenderCapabilities();
  const [selectedPath, setSelectedPath] = useState<string>();
  const { t } = useTranslation('tool');
  const loading = isLoading?.(messageId);

  if (loading) {
    return (
      <div className="flex flex-col gap-1">
        <Skeleton style={{ height: 16 }} />
        <Skeleton style={{ height: 16 }} />
        <Skeleton style={{ height: 16 }} />
        <Skeleton style={{ height: 16 }} />
      </div>
    );
  }

  if (pluginError)
    return (
      <p className="text-sm text-destructive-text" role="alert">
        {pluginError.message}
      </p>
    );

  if (listResults.length === 0) {
    return (
      <div className="rounded-md border bg-card">
        <SimpleEmpty description={t('localFiles.listFiles.emptyDirectory')} icon={FolderOpenIcon} />
      </div>
    );
  }

  return (
    <FileTree
      aria-label={t('aiElementsMore.files', { ns: 'chat' })}
      className="max-h-64 overflow-auto"
      selectedPath={selectedPath}
      onSelect={(path) => {
        const item = listResults.find((entry) => entry.path === path);
        if (!item?.path) return;
        setSelectedPath(path);
        if (item.isDirectory) openFolder?.(path);
        else openFile?.(path);
      }}
    >
      {listResults.map((item) => (
        <FileTreeFile
          aria-disabled={!item.path || !(item.isDirectory ? openFolder : openFile)}
          key={item.path || item.name}
          name={item.name}
          path={item.path || item.name}
        >
          <FileTreeIcon>
            {item.isDirectory ? (
              <FolderIcon className="size-4 text-info-text" />
            ) : (
              <FileIcon className="size-4 text-muted-foreground" />
            )}
          </FileTreeIcon>
          <FileTreeName>{item.name}</FileTreeName>
          <FileTreeActions>
            {item.size !== undefined && (
              <span className="text-xs text-muted-foreground">{formatSize(item.size)}</span>
            )}
            {!item.isDirectory && item.path && openFolder && (
              <Button
                aria-label={t('localFiles.openFolder')}
                size="icon-sm"
                variant="ghost"
                onClick={() => openFolder(item.path!)}
              >
                <FolderOpenIcon className="size-4" />
              </Button>
            )}
          </FileTreeActions>
        </FileTreeFile>
      ))}
    </FileTree>
  );
});

SearchFiles.displayName = 'SearchFiles';

export default SearchFiles;
