'use client';
import { PatchDiff } from '@lobehub/ui';
import type { GitFileDiffStatus } from '@orvilo/electron-client-ipc';
import { nanoid } from '@orvilo/utils';
import { cn } from 'cn';
import { CopyIcon, LocateFixedIcon, Undo2Icon } from 'lucide-react';
import path from 'path-browserify-esm';
import { memo, type MouseEvent, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { gitService } from '@/services/git';
import { useFileStore } from '@/store/file';
import { useGlobalStore } from '@/store/global';
import { copyToClipboard } from '@/utils/clipboard';

import type { ComposerTarget } from '../../types';
import type { DiffSelectedLineRange } from './selection';
import { buildCodeContextSelection } from './selection';

const styles = {
  additions: 'text-success-text',
  actions:
    'pointer-events-none absolute inset-bs-0 inset-be-0 -end-2 items-center ps-7 pe-0 opacity-0 [background:linear-gradient(to_right,transparent_0,var(--accent)_28px),linear-gradient(to_right,transparent_0,var(--card)_28px)] rtl:[background:linear-gradient(to_left,transparent_0,var(--accent)_28px),linear-gradient(to_left,transparent_0,var(--card)_28px)] transition-opacity duration-(--orvilo-motion-mid) ease-[ease] [[data-review-row]:hover_&]:pointer-events-auto [[data-review-row]:hover_&]:opacity-100 [[data-review-row]:focus-within_&]:pointer-events-auto [[data-review-row]:focus-within_&]:opacity-100',
  rowAction: 'flex-none text-muted-foreground',
  revertDanger: 'hover:text-destructive-text',
  deletions: 'text-destructive-text',
  empty: 'py-3 text-sm leading-5.5 text-muted-foreground text-center',
  dir: '[direction:rtl] overflow-hidden [flex:0_1_auto] min-w-0 text-xs leading-5 text-muted-foreground text-start text-ellipsis whitespace-nowrap',
  fileName: 'flex-none text-sm leading-5.5 text-foreground whitespace-nowrap',
  header: 'relative flex gap-2 items-center w-full min-w-0 text-xs leading-5',
  pathWrapper: 'overflow-hidden flex [flex:0_1_auto] min-w-0',
  stats: 'flex-none font-mono text-xs leading-5 tabular-nums',
};

const reviewDiffUnsafeCSS = `
  :host {
    --diffs-dark-bg: transparent;
    --diffs-light-bg: transparent;
    --diffs-gap-fallback: 8px;
    --diffs-font-family: var(--font-mono);
    --diffs-header-font-family: var(--font-sans);
    --diffs-font-size: var(--text-sm);
    --diffs-line-height: calc(var(--spacing) * 5.5);
    --diffs-added-light: var(--ant-color-success-hover);
    --diffs-added-dark: var(--ant-color-success-border-hover);
    --diffs-modified-light: var(--ant-color-info-hover);
    --diffs-modified-dark: var(--ant-color-info-border-hover);
    --diffs-deleted-light: var(--ant-color-error-hover);
    --diffs-deleted-dark: var(--ant-color-error-border-hover);
  }

  [data-gutter-buffer] {
    opacity: 0.2;
  }

  [data-code] {
    padding-top: 0;
    padding-bottom: 0;
  }

  [data-gutter] {
    backdrop-filter: blur(16px);
  }

  [data-gutter-utility-slot] [data-utility-button] {
    width: calc(var(--spacing) * 8);
    min-width: calc(var(--spacing) * 8);
    height: calc(var(--spacing) * 8);
    margin-right: calc(1ch + 1px - var(--spacing) * 4);
    border: 1px solid var(--primary);
    border-radius: var(--radius-button);
    background: var(--primary);
    color: var(--primary-on-fill);
    fill: currentColor;
    box-shadow: none;
  }

  [data-gutter-utility-slot] [data-utility-button]:is(:hover, :focus-visible, :active) {
    border-color: var(--primary-hover);
    background: var(--primary-hover);
    color: var(--primary-hover-foreground);
    fill: currentColor;
  }

  [data-gutter-utility-slot] [data-utility-button]:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }

  [data-gutter-utility-slot] [data-utility-button] [data-icon] {
    width: calc(var(--spacing) * 4);
    height: calc(var(--spacing) * 4);
  }

  @media (pointer: coarse) {
    [data-gutter-utility-slot] [data-utility-button]::before {
      inset: calc(var(--spacing) * -1.5);
    }
  }
`;

interface FileItemHeaderProps {
  additions: number;
  deletions: number;
  filePath: string;
  /** Hide the leading directory portion — used in tree layout where the
   * containing folders are already shown by the tree, so the row only needs
   * the bare filename. */
  hideDir?: boolean;
  /** Called after a successful revert so the parent can refresh the patch list. */
  onReverted?: () => void;
  /** When provided, enables the per-file revert button (unstaged mode only). */
  revertContext?: { deviceId?: string; workingDirectory: string };
  // Status reserved for future use (e.g. dim deleted entries) — keep on the
  // shape so the parent doesn't need to re-derive it later.
  status: GitFileDiffStatus;
}

export const FileItemHeader = memo<FileItemHeaderProps>(
  ({ filePath, additions, deletions, hideDir, revertContext, onReverted }) => {
    const { t } = useTranslation('chat');
    const revealInFilesTab = useGlobalStore((s) => s.revealInFilesTab);

    const lastSlash = filePath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? filePath.slice(0, lastSlash + 1) : '';
    const fileName = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;

    const handleCopy = useCallback(
      async (event: MouseEvent<HTMLElement>) => {
        // Stop propagation so the row doesn't toggle expand on copy click.
        event.stopPropagation();
        await copyToClipboard(filePath);
        toast.success(t('workingPanel.review.copied'));
      },
      [filePath, t],
    );

    const handleReveal = useCallback(
      (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        revealInFilesTab(filePath);
      },
      [filePath, revealInFilesTab],
    );

    const handleRevert = useCallback(
      (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        if (!revertContext) return;
        confirmModal({
          cancelText: t('workingPanel.review.revert.confirm.cancel'),
          content: t('workingPanel.review.revert.confirm.description'),
          okButtonProps: { danger: true },
          okText: t('workingPanel.review.revert.confirm.ok'),
          onOk: async () => {
            try {
              const result = await gitService.revertGitFile({
                deviceId: revertContext.deviceId,
                filePath,
                path: revertContext.workingDirectory,
              });
              if (result.success) {
                toast.success(t('workingPanel.review.revert.success', { fileName }));
                onReverted?.();
              } else {
                toast.error(
                  t('workingPanel.review.revert.failed', {
                    error: result.error || 'unknown error',
                  }),
                );
              }
            } catch (error: any) {
              toast.error(
                t('workingPanel.review.revert.failed', {
                  error: error?.message || String(error),
                }),
              );
            }
          },
          title: t('workingPanel.review.revert.confirm.title'),
        });
      },
      [fileName, filePath, onReverted, revertContext, t],
    );

    return (
      <div className={styles.header}>
        <span className={styles.pathWrapper} title={filePath}>
          {!hideDir && dir && (
            // bdi keeps the dir's visual order LTR while the span is
            // direction: rtl for head-side truncation of leading segments.
            <span className={styles.dir}>
              <bdi dir={'ltr'}>{dir}</bdi>
            </span>
          )}
          <span className={styles.fileName}>{fileName}</span>
        </span>
        <span className={styles.stats}>
          {additions > 0 && <span className={styles.additions}>+{additions}</span>}
          {additions > 0 && deletions > 0 && ' '}
          {deletions > 0 && <span className={styles.deletions}>-{deletions}</span>}
        </span>
        <div className={cn('flex items-center gap-1', styles.actions)}>
          <ActionIcon
            className={styles.rowAction}
            classNames={{ icon: 'size-4' }}
            icon={CopyIcon}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={t('workingPanel.review.copyPath')}
            onClick={handleCopy}
          />
          <ActionIcon
            className={styles.rowAction}
            classNames={{ icon: 'size-4' }}
            data-testid="reveal-in-tree"
            icon={LocateFixedIcon}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={t('workingPanel.review.revealInTree')}
            onClick={handleReveal}
          />
          {revertContext && (
            <ActionIcon
              className={`${styles.rowAction} ${styles.revertDanger}`}
              classNames={{ icon: 'size-4' }}
              icon={Undo2Icon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('workingPanel.review.revert')}
              onClick={handleRevert}
            />
          )}
        </div>
      </div>
    );
  },
);

FileItemHeader.displayName = 'ReviewFileItemHeader';

interface FileItemBodyProps {
  composerTarget: ComposerTarget;
  /** Whether the Collapse panel is expanded — gates the heavy PatchDiff render. */
  expanded: boolean;
  filePath: string;
  isBinary: boolean;
  patch: string;
  /** Inline word-level diff highlighting; off → plain line-level. */
  textDiff: boolean;
  truncated: boolean;
  viewMode: 'unified' | 'split';
  wordWrap: boolean;
  workingDirectory: string;
}

const FileItemBody = memo<FileItemBodyProps>(
  ({
    composerTarget,
    filePath,
    patch,
    isBinary,
    truncated,
    expanded,
    viewMode,
    workingDirectory,
    wordWrap,
    textDiff,
  }) => {
    const { t } = useTranslation('chat');
    const addChatContextSelection = useFileStore((s) => s.addChatContextSelection);
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const language = ext || undefined;

    const diffOptions = useMemo(
      () => ({
        enableGutterUtility: composerTarget.writable,
        enableLineSelection: true,
        lineDiffType: textDiff ? ('word-alt' as const) : ('none' as const),
        onGutterUtilityClick: (range: DiffSelectedLineRange) => {
          if (!composerTarget.writable) return;

          const selection = buildCodeContextSelection({
            filePath,
            language,
            patch,
            range,
            workingDirectory,
          });

          if (!selection) return;

          addChatContextSelection({
            contextKey: composerTarget.contextKey,
            selection: {
              ...selection,
              id: `code-selection-${nanoid(6)}`,
              type: 'text',
            },
          });
          toast.success(t('workingPanel.review.addSelectionToContext.success'));
        },
        overflow: wordWrap ? ('wrap' as const) : ('scroll' as const),
        unsafeCSS: reviewDiffUnsafeCSS,
      }),
      [
        addChatContextSelection,
        composerTarget,
        filePath,
        language,
        patch,
        t,
        textDiff,
        wordWrap,
        workingDirectory,
      ],
    );

    if (!expanded) return null;

    if (isBinary) return <div className={styles.empty}>{t('workingPanel.review.binary')}</div>;
    if (truncated) return <div className={styles.empty}>{t('workingPanel.review.tooLarge')}</div>;
    if (!patch) return <div className={styles.empty}>{t('workingPanel.review.error')}</div>;

    return (
      <PatchDiff
        diffOptions={diffOptions}
        fileName={fileName}
        language={language}
        patch={patch}
        showHeader={false}
        style={{ borderRadius: 0 }}
        variant={'borderless'}
        viewMode={viewMode}
      />
    );
  },
);

FileItemBody.displayName = 'ReviewFileItemBody';

export default FileItemBody;
