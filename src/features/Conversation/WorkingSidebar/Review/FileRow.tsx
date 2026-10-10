'use client';

import type { GitWorkingTreePatch } from '@orvilo/electron-client-ipc';
import { ChevronRightIcon } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { type KeyboardEvent, memo, useCallback } from 'react';

import type { ComposerTarget } from '../../types';
import FileItemBody, { FileItemHeader } from './FileItem';
import type { ReviewMode } from './useReviewPatches';

const styles = {
  item: '[content-visibility:auto] [contain-intrinsic-size:auto_32px] flex-none border-t border-divider',
  row: 'cursor-pointer select-none flex gap-1.5 items-center w-full min-h-8 py-1 px-2.5 transition-colors duration-(--orvilo-motion-fast) hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2',
  chevron:
    'flex-none text-foreground-tertiary transition-transform duration-(--orvilo-motion-fast) data-[expanded=true]:rotate-90',
};

interface FileRowProps {
  composerTarget: ComposerTarget;
  /** Scroll anchor — the tree-nav rail scrolls to `[data-file-key]` on select. */
  dataFileKey?: string;
  /** Target device the repo lives on — undefined for local desktop. */
  deviceId?: string;
  entry: GitWorkingTreePatch;
  expanded: boolean;
  /** Hide the leading directory portion (tree layout shows folders already). */
  hideDir?: boolean;
  /** Extra inline-start padding (px) for nested tree rows. Applied to the
   * clickable header row only — the expanded diff stays full-width. */
  indent?: number;
  mode: ReviewMode;
  onReverted: () => void;
  onToggle: () => void;
  /** Absolute path of the owning repo — used as the working directory for
   * revert operations so submodule files revert inside the submodule, not
   * the parent repo. */
  repoAbsolutePath: string;
  textDiff: boolean;
  viewMode: 'unified' | 'split';
  wordWrap: boolean;
}

const FileRow = memo<FileRowProps>(
  ({
    composerTarget,
    dataFileKey,
    deviceId,
    entry,
    expanded,
    hideDir,
    indent,
    mode,
    onReverted,
    onToggle,
    repoAbsolutePath,
    textDiff,
    viewMode,
    wordWrap,
  }) => {
    const onKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      },
      [onToggle],
    );
    return (
      <div className={styles.item} data-file-key={dataFileKey}>
        <div
          data-review-row
          aria-expanded={expanded}
          className={styles.row}
          role={'button'}
          style={indent ? { paddingInlineStart: 10 + indent } : undefined}
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={onKeyDown}
        >
          <ChevronRightIcon
            className={styles.chevron}
            data-expanded={expanded ? 'true' : 'false'}
            size={14}
          />
          <FileItemHeader
            additions={entry.additions}
            deletions={entry.deletions}
            filePath={entry.filePath}
            hideDir={hideDir}
            status={entry.status}
            revertContext={
              mode === 'unstaged' ? { deviceId, workingDirectory: repoAbsolutePath } : undefined
            }
            onReverted={onReverted}
          />
        </div>
        <AnimatePresence initial={false}>
          {expanded && (
            <m.div
              animate={'open'}
              className="overflow-hidden"
              exit={'collapsed'}
              initial={'collapsed'}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              variants={{
                collapsed: { height: 0, opacity: 0 },
                open: { height: 'auto', opacity: 1 },
              }}
            >
              <FileItemBody
                expanded
                composerTarget={composerTarget}
                filePath={entry.filePath}
                isBinary={entry.isBinary}
                patch={entry.patch}
                textDiff={textDiff}
                truncated={entry.truncated}
                viewMode={viewMode}
                wordWrap={wordWrap}
                workingDirectory={repoAbsolutePath}
              />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

FileRow.displayName = 'AgentWorkingSidebarReviewFileRow';

export default FileRow;
