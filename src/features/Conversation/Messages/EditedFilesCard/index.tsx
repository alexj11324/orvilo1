'use client';

import type { EditedFileEntry } from '@orvilo/builtin-tools/fileEditScan';
import {
  FilePathDisplay,
  getFileName,
  getFilePathDisplayInfo,
  KindDot,
  LineStats,
} from '@orvilo/shared-tool-ui/components';
import { clsx as cx, cn } from 'cn';
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  FilePenLineIcon,
} from 'lucide-react';
import { type KeyboardEvent, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { Button } from '@/components/ui/button';
import { CodeBlock, CodeBlockCopyButton, parseUnifiedDiff } from '@/components/ui/code-block';

import { type OperationEditedFile, summarizeEditedFilesTotals } from './deriveEditedFiles';
import { useOpenEditedFile } from './useOpenEditedFile';

export const SINGLE_EDITED_FILE_ICON_SIZE = 40;
export const AGGREGATE_EDITED_FILE_ICON_SIZE = 40;

/** Files listed before the "show N more" row, matching Codex's file toolbar. */
export const INITIAL_VISIBLE_EDITED_FILES = 3;

/** Fire a toggle on Enter/Space so the div-based expander is keyboard operable. */
const toggleOnKey = (toggle: () => void) => (event: KeyboardEvent<HTMLElement>) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggle();
  }
};

const styles = {
  card: 'overflow-hidden w-full border border-divider rounded-(--radius-card) bg-popover',
  header: 'py-2 px-3',
  headerIcon: 'shrink-0 size-10 rounded-(--radius-card) text-muted-foreground bg-muted',
  singleHeader:
    'relative py-2 px-3 [&:hover_[data-view-changes]]:pointer-events-auto [&:hover_[data-view-changes]]:translate-x-0 [&:hover_[data-view-changes]]:opacity-100 [&:focus-within_[data-view-changes]]:pointer-events-auto [&:focus-within_[data-view-changes]]:translate-x-0 [&:focus-within_[data-view-changes]]:opacity-100',
  singleHeaderClickable: 'cursor-pointer hover:bg-fill-quaternary',
  singleTitle: 'min-w-0 text-sm font-medium',
  viewChanges:
    'pointer-events-none absolute inset-bs-0 inset-be-0 end-0 flex items-center justify-end ps-14 pe-3 opacity-0 [background:linear-gradient(to_left,var(--fill-quaternary)_62%,transparent),linear-gradient(to_left,var(--popover)_62%,transparent)] rtl:[background:linear-gradient(to_right,var(--fill-quaternary)_62%,transparent),linear-gradient(to_right,var(--popover)_62%,transparent)] transition-opacity duration-(--orvilo-motion-mid) ease-(--orvilo-motion-ease-out) [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100',
  viewChangesButton: 'p-0 text-muted-foreground',
  viewChangesVisible: 'pointer-events-auto opacity-100',
  chevron: 'shrink-0 text-foreground-tertiary',
  title: 'min-w-0 text-sm font-medium',
  stats: 'font-medium',
  list: '[border-block-start:1px_solid_var(--divider)]',
  showMore:
    'cursor-pointer justify-start w-full px-3 text-sm text-muted-foreground hover:bg-fill-quaternary',
  row: 'relative py-1.5 px-3 [&:hover_[data-view-changes]]:pointer-events-auto [&:hover_[data-view-changes]]:translate-x-0 [&:hover_[data-view-changes]]:opacity-100 [&:focus-within_[data-view-changes]]:pointer-events-auto [&:focus-within_[data-view-changes]]:translate-x-0 [&:focus-within_[data-view-changes]]:opacity-100',
  rowMain: 'min-h-6',
  rowClickable: 'cursor-pointer rounded-(--radius-button) hover:bg-fill-quaternary',
  path: 'overflow-hidden flex flex-1 items-center min-w-0',
  patch: 'overflow-hidden mbs-1.5 ps-4.5',
};

const EditedFileDiff = ({ patch, fileName }: { patch: string; fileName: string }) => {
  const files = parseUnifiedDiff(patch).filter((file) => file.lines.length > 0);
  return files.length > 0 ? (
    files.map((file) => (
      <CodeBlock
        showLineNumbers
        key={file.file}
        label={fileName}
        lines={file.lines}
        variant="ghost"
      >
        <CodeBlockCopyButton value={patch} />
      </CodeBlock>
    ))
  ) : (
    <CodeBlock code={patch} label={fileName} language="diff" variant="ghost" />
  );
};

const EditedFileRow = memo<{ entry: EditedFileEntry; onOpen?: () => void }>(({ entry, onOpen }) => {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.diffTexts.length > 0;
  const fileName = getFileName(entry.path);

  // Preview when the file's content is reachable; otherwise the row keeps its
  // legacy diff-toggle click so it never turns into a dead affordance.
  const handleRowClick = onOpen ?? (hasDiff ? () => setExpanded((prev) => !prev) : undefined);
  const clickable = !!handleRowClick;

  return (
    <div className={cn('flex flex-col', cx(styles.row, clickable && styles.rowClickable))}>
      <div
        aria-expanded={onOpen ? undefined : hasDiff ? expanded : undefined}
        className={cn('flex items-center gap-2.5', styles.rowMain)}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={handleRowClick}
        onKeyDown={handleRowClick ? toggleOnKey(handleRowClick) : undefined}
      >
        <KindDot kind={entry.kind} />
        <div className={styles.path}>
          <FilePathDisplay filePath={entry.path} />
        </div>
        <LineStats
          hideZeroDeltas
          className={styles.stats}
          linesAdded={entry.linesAdded}
          linesDeleted={entry.linesDeleted}
        />
        {onOpen && hasDiff && (
          <div
            data-view-changes
            className={cx(styles.viewChanges, expanded && styles.viewChangesVisible)}
          >
            <Button
              aria-expanded={expanded}
              className={styles.viewChangesButton}
              size={'compact'}
              variant={'ghost'}
              // Enter/Space on the button must not bubble into the row's own
              // key handler, which would also open the file preview.
              onKeyDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((prev) => !prev);
              }}
            >
              {t(expanded ? 'editedFiles.hideChanges' : 'editedFiles.viewChanges')}
            </Button>
          </div>
        )}
        {!onOpen &&
          hasDiff &&
          (expanded ? (
            <ChevronDownIcon className={styles.chevron} size={16} />
          ) : (
            <ChevronRightIcon className={styles.chevron} size={16} />
          ))}
      </div>
      {hasDiff && expanded && (
        <div className={styles.patch}>
          {entry.diffTexts.map((patch, index) => (
            <EditedFileDiff fileName={fileName} key={index} patch={patch} />
          ))}
        </div>
      )}
    </div>
  );
});
EditedFileRow.displayName = 'EditedFileRow';

interface EditedFilesCardProps {
  entries: OperationEditedFile[];
}

export const getEditedFilesCardMode = (fileCount: number) => {
  if (fileCount === 0) return 'hidden';
  if (fileCount === 1) return 'single';
  return 'aggregate';
};

export const getEditedFileIconName = (filePath: string) => getFileName(filePath);

const SingleEditedFileCard = memo<{ entry: EditedFileEntry; onOpen?: () => void }>(
  ({ entry, onOpen }) => {
    const { t } = useTranslation('chat');
    const [showDiff, setShowDiff] = useState(false);
    const hasDiff = entry.diffTexts.length > 0;
    const fileName = getFileName(entry.path);
    const { displayPath } = getFilePathDisplayInfo(entry.path);

    return (
      <div className={cn('flex flex-col', styles.card)}>
        <div
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          className={cn(
            'flex items-center gap-2.5',
            cx(styles.singleHeader, onOpen && styles.singleHeaderClickable),
          )}
          onClick={onOpen}
          onKeyDown={onOpen ? toggleOnKey(onOpen) : undefined}
        >
          <FileIcon
            fileName={getEditedFileIconName(entry.path)}
            size={SINGLE_EDITED_FILE_ICON_SIZE}
          />
          <div className="flex flex-col flex-1 gap-0.5">
            <div className={cn('truncate', styles.singleTitle)}>
              {t('editedFiles.singleTitle', { path: displayPath })}
            </div>
            <LineStats
              hideZeroDeltas
              className={styles.stats}
              linesAdded={entry.linesAdded}
              linesDeleted={entry.linesDeleted}
            />
          </div>
          {hasDiff && (
            <div
              data-view-changes
              className={cx(styles.viewChanges, showDiff && styles.viewChangesVisible)}
            >
              <Button
                aria-expanded={showDiff}
                className={styles.viewChangesButton}
                size={'compact'}
                variant={'ghost'}
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  // The header itself may open the file preview — keep the diff
                  // toggle from also triggering it.
                  event.stopPropagation();
                  setShowDiff((prev) => !prev);
                }}
              >
                {t(showDiff ? 'editedFiles.hideChanges' : 'editedFiles.viewChanges')}
                <ArrowUpRightIcon data-icon="inline-end" size={16} />
              </Button>
            </div>
          )}
        </div>
        {hasDiff && showDiff && (
          <div className={styles.patch}>
            {entry.diffTexts.map((patch, index) => (
              <EditedFileDiff fileName={fileName} key={index} patch={patch} />
            ))}
          </div>
        )}
      </div>
    );
  },
);
SingleEditedFileCard.displayName = 'SingleEditedFileCard';

/**
 * Codex-style aggregate card mounted at the tail of an assistant round: "edited
 * N files +x -y" with an expandable per-file list. Data is purely derived from
 * the round's tool calls (see {@link useOperationEditedFiles}) — never persisted.
 * Renders nothing when the round edited no (non-entity) files.
 */
const EditedFilesCard = memo<EditedFilesCardProps>(({ entries }) => {
  const { t } = useTranslation('chat');
  const [showAll, setShowAll] = useState(false);
  const getOpenAction = useOpenEditedFile();

  if (entries.length === 0) return null;
  if (entries.length === 1)
    return <SingleEditedFileCard entry={entries[0]} onOpen={getOpenAction(entries[0])} />;

  const totals = summarizeEditedFilesTotals(entries);
  // The edited-file set is the round's *result*, not one of its steps — it opens
  // with the first few files already listed and defers only the long tail.
  const hiddenCount = entries.length - INITIAL_VISIBLE_EDITED_FILES;
  const visible = showAll ? entries : entries.slice(0, INITIAL_VISIBLE_EDITED_FILES);
  const toggleShowAll = () => setShowAll((prev) => !prev);

  return (
    <div className={cn('flex flex-col', styles.card)}>
      <div className={cn('flex items-center gap-2.5', styles.header)}>
        <div className={cn('flex flex-col items-center justify-center', styles.headerIcon)}>
          <FilePenLineIcon size={16} />
        </div>
        <div className="flex min-w-0 flex-col flex-1 gap-0.5">
          <div className={cn('truncate', styles.title)}>
            {t('editedFiles.title', { count: entries.length })}
          </div>
          <LineStats
            hideZeroDeltas
            className={styles.stats}
            linesAdded={totals.linesAdded}
            linesDeleted={totals.linesDeleted}
          />
        </div>
      </div>
      <div className={cn('flex flex-col', styles.list)}>
        {visible.map((entry) => (
          <EditedFileRow entry={entry} key={entry.path} onOpen={getOpenAction(entry)} />
        ))}
        {hiddenCount > 0 && (
          <Button
            aria-expanded={showAll}
            className={cn('flex items-center gap-1.5', styles.showMore)}
            role={'button'}
            size="normal"
            tabIndex={0}
            type="button"
            variant="ghost"
            onClick={toggleShowAll}
            onKeyDown={toggleOnKey(toggleShowAll)}
          >
            {showAll
              ? t('editedFiles.showLess')
              : t('editedFiles.showMore', { count: hiddenCount })}
            {showAll ? (
              <ChevronUpIcon className={styles.chevron} size={16} />
            ) : (
              <ChevronDownIcon className={styles.chevron} size={16} />
            )}
          </Button>
        )}
      </div>
    </div>
  );
});

EditedFilesCard.displayName = 'EditedFilesCard';

export default EditedFilesCard;
