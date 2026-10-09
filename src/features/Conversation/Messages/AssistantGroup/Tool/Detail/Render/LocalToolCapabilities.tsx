import { ToolRenderProvider } from '@orvilo/shared-tool-ui';
import type { ReactNode } from 'react';

import {
  resolveWorkingTreePath,
  useOpenEditedFile,
} from '@/features/Conversation/Messages/EditedFilesCard/useOpenEditedFile';
import { useEffectiveWorkingDirectory } from '@/hooks/useEffectiveWorkingDirectory';
import { useAgentStore } from '@/store/agent';
import { useGlobalStore } from '@/store/global';

/** Reuse the portal's device-aware preview and the workspace explorer's reveal path. */
export const LocalToolCapabilities = ({ children }: { children: ReactNode }) => {
  const agentId = useAgentStore((s) => s.activeAgentId);
  const workingDirectory = useEffectiveWorkingDirectory(agentId);
  const getOpenAction = useOpenEditedFile();
  const revealInFilesTab = useGlobalStore((s) => s.revealInFilesTab);
  const getFileAction = (path: string) =>
    getOpenAction({ kind: 'modified', path, sandboxBacked: false });
  const getTreePath = (path: string) =>
    workingDirectory ? resolveWorkingTreePath(path, workingDirectory) : undefined;

  return (
    <ToolRenderProvider
      value={{
        canOpenFile: (path) => !!getFileAction(path),
        canOpenFolder: (path) => !!getFileAction(path) && getTreePath(path) !== undefined,
        displayRelativePath: (path) => getTreePath(path) || path,
        openFile: (path) => getFileAction(path)?.(),
        openFolder: (path) => {
          const relativePath = getTreePath(path);
          if (getFileAction(path) && relativePath !== undefined) revealInFilesTab(relativePath);
        },
      }}
    >
      {children}
    </ToolRenderProvider>
  );
};
