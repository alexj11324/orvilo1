import { deriveWorktreePath, type DeviceGitWorktreeListItem } from '@orvilo/types';
import { cn } from 'cn';
import {
  CheckIcon,
  FolderPlusIcon,
  GitBranchIcon,
  GitForkIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  createElement,
  memo,
  type MouseEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { gitService } from '@/services/git';

import { SimpleTooltip } from '../SimpleTooltip';
import { openCreateWorktreeModal } from './CreateWorktreeModal';
import { useCommitWorkingDirectory } from './useCommitWorkingDirectory';
import { useSwitchWorktree } from './useSwitchWorktree';
import { getPathName, isDisabled, normalizeDisplayPath } from './worktreeHelpers';

const styles = {
  badge: 'flex-none px-1 rounded-full text-xs leading-5 text-muted-foreground bg-selected',
  branch:
    'overflow-hidden flex-[0_1_auto] min-w-10 max-w-75 text-sm leading-5.5 text-muted-foreground text-ellipsis whitespace-nowrap',
  check: 'flex flex-none items-center justify-center w-8 text-primary',
  actionCell: 'flex flex-none items-center justify-center w-8',
  container: 'flex flex-col w-full h-95 -m-1',
  diffStat: 'inline-flex flex-none gap-1 justify-end tabular-nums text-xs leading-5',
  diffStatAdded: 'text-success-text',
  diffStatDeleted: 'text-destructive-text',
  diffStatModified: 'text-warning-text',
  emptyState: 'py-4 text-sm leading-5.5 text-foreground-description text-center',
  searchBar: 'py-1 px-3 border-be border-divider',
  section: 'flex-1 text-xs leading-5 font-medium text-foreground-tertiary',
  sectionRow: 'flex gap-1 items-center pbs-1 pbe-0.5 px-2',
  refreshButton:
    'cursor-pointer flex items-center justify-center size-8 rounded-(--radius-button) text-foreground-tertiary transition-colors duration-(--orvilo-motion-fast) hover:text-foreground hover:bg-accent',
  spinning: 'animate-spin [animation-duration:0.8s] motion-reduce:animate-none',
  item: 'cursor-pointer grid grid-cols-[minmax(0,1fr)_minmax(44px,auto)_32px] gap-2.5 items-center min-h-12 py-1.5 px-2 rounded-(--radius-button) text-sm leading-5.5 text-foreground hover:bg-accent hover:[&_.worktree-row-action]:flex focus-within:[&_.worktree-row-action]:flex data-[current=true]:bg-selected data-[current=true]:hover:bg-selected aria-disabled:cursor-not-allowed aria-disabled:opacity-55',
  itemMain: 'overflow-hidden min-w-0',
  dirtyCell: 'flex flex-none items-center justify-end min-w-11',
  list: 'overflow-y-auto flex-1 max-h-80 p-1.5',
  createItemWrapper: 'p-1.5 border-bs border-divider',
  createItem:
    'cursor-pointer flex gap-2 items-center min-h-8 py-1.5 px-2 rounded-(--radius-button) text-sm leading-5.5 text-foreground hover:bg-accent',
  createItemIcon: 'flex-none text-muted-foreground',
  name: 'overflow-hidden flex-[0_1_auto] max-w-60 text-sm leading-5.5 font-normal text-ellipsis whitespace-nowrap',
  path: 'overflow-hidden mbs-0.5 text-xs leading-5 text-foreground-tertiary text-ellipsis whitespace-nowrap',
  rowTitle: 'overflow-hidden flex gap-1.5 items-center min-w-0 whitespace-nowrap',
  rowAction:
    'cursor-pointer hidden items-center justify-center size-8 rounded-(--radius-button) text-foreground-tertiary transition-colors duration-(--orvilo-motion-fast) hover:text-destructive-text hover:bg-destructive-wash',
  trigger:
    'cursor-pointer inline-flex flex-none items-center justify-center size-8 rounded-(--radius-button) text-sm leading-5.5 text-muted-foreground whitespace-nowrap transition-colors duration-(--orvilo-motion-fast) hover:bg-accent',
  triggerAnchor: 'inline-flex flex-none',
  triggerFill: 'flex w-full [&>*]:flex-1',
};

const TEMP_PATH_PREFIXES = ['/tmp', '/var/tmp', '/private/tmp'];

const isTempPath = (path: string): boolean => {
  const normalized = normalizeDisplayPath(path);
  return TEMP_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
};

const getRelativeDisplayPath = (targetPath: string, sourcePath: string): string => {
  if (!targetPath || !sourcePath || isTempPath(targetPath)) return targetPath;

  const target = normalizeDisplayPath(targetPath);
  const source = normalizeDisplayPath(sourcePath);
  if (!target.startsWith('/') || !source.startsWith('/')) return targetPath;
  if (target === source) return targetPath;

  const targetParts = target.split('/').filter(Boolean);
  const sourceParts = source.split('/').filter(Boolean);
  let commonLength = 0;
  while (
    commonLength < targetParts.length &&
    commonLength < sourceParts.length &&
    targetParts[commonLength] === sourceParts[commonLength]
  ) {
    commonLength += 1;
  }

  if (commonLength < 2) return targetPath;

  const parentSteps = Array.from({ length: sourceParts.length - commonLength }, () => '..');
  const relativeParts = [...parentSteps, ...targetParts.slice(commonLength)];

  return relativeParts.length > 0 ? relativeParts.join('/') : '.';
};

const getShortHead = (head?: string): string | undefined => head?.slice(0, 7);

const getWorktreeBranch = (
  worktree: DeviceGitWorktreeListItem,
  fallbackBranch: string,
  detachedLabel: (sha: string) => string,
): string => {
  if (worktree.branch) return worktree.branch;
  const head = getShortHead(worktree.head);
  if (worktree.detached && head) return detachedLabel(head);
  return fallbackBranch;
};

// The main worktree can never be removed (`git worktree remove <main>` fails with
// "is a main working tree"), and when the agent runs on a linked worktree it is
// listed with `current: false` — so exclude it by path too, not just via the
// `current` flag, to avoid offering a delete that always errors. `sourcePath` is
// NOT the main worktree whenever the user picks a linked worktree directly as the
// working directory, so it is excluded separately (removing the conversation's own
// source repo would strand it), not used as a stand-in for the main worktree.
const canRemoveWorktree = (
  worktree: DeviceGitWorktreeListItem,
  sourcePath: string,
  mainWorktreePath?: string,
): boolean =>
  !worktree.current &&
  !worktree.locked &&
  !isDisabled(worktree) &&
  normalizeDisplayPath(worktree.path) !== normalizeDisplayPath(sourcePath) &&
  (!mainWorktreePath ||
    normalizeDisplayPath(worktree.path) !== normalizeDisplayPath(mainWorktreePath));

interface DirtyStatProps {
  status?: DeviceGitWorktreeListItem['status'];
}

const DirtyStat = memo<DirtyStatProps>(({ status }) => {
  if (!status || status.clean) return null;

  return (
    <span className={styles.diffStat}>
      {status.added > 0 && <span className={styles.diffStatAdded}>+{status.added}</span>}
      {status.modified > 0 && <span className={styles.diffStatModified}>±{status.modified}</span>}
      {status.deleted > 0 && <span className={styles.diffStatDeleted}>-{status.deleted}</span>}
    </span>
  );
});

DirtyStat.displayName = 'DirtyStat';

interface WorktreeSwitcherProps {
  agentId: string;
  /** Custom trigger element; the default is the compact branch/fork icon chip. */
  children?: ReactElement;
  currentBranch: string;
  detached?: boolean;
  deviceId?: string;
  isGithub: boolean;
  onWorktreesChange?: () => Promise<unknown> | unknown;
  path: string;
  /** Dropdown placement — the runtime bar opens upward, embedding panels open downward. */
  placement?: 'topLeft' | 'bottomLeft' | 'bottomRight';
  sourcePath: string;
  topicId?: string | null;
  worktrees: DeviceGitWorktreeListItem[];
}

const WorktreeSwitcher = memo<WorktreeSwitcherProps>(
  ({
    agentId,
    topicId,
    children,
    currentBranch,
    detached,
    deviceId,
    isGithub,
    onWorktreesChange,
    path,
    placement = 'topLeft',
    sourcePath,
    worktrees,
  }) => {
    const { t } = useTranslation('device');
    const { t: tCommon } = useTranslation('common');
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    // Paths currently being removed in the background. `git worktree remove` is
    // slow (up to a 30s timeout + device round-trip), so removal runs detached
    // from the confirm dialog — this tracks in-flight rows to guard against a
    // duplicate delete if the dropdown is reopened mid-removal.
    const [removingPaths, setRemovingPaths] = useState<Set<string>>(() => new Set());
    const currentRowRef = useRef<HTMLDivElement>(null);
    const { isLocked } = useCommitWorkingDirectory(agentId, topicId);
    const switchWorktree = useSwitchWorktree({ agentId, isGithub, sourcePath, topicId });

    // Clear the query each time the dropdown closes so it reopens unfiltered.
    useEffect(() => {
      if (!open) setSearch('');
    }, [open]);

    const handleRefresh = useCallback(async () => {
      if (isRefreshing) return;
      setIsRefreshing(true);
      try {
        await onWorktreesChange?.();
      } finally {
        setIsRefreshing(false);
      }
    }, [isRefreshing, onWorktreesChange]);

    // Filter by worktree folder name, path, or branch.
    const filtered = useMemo(() => {
      const query = search.trim().toLowerCase();
      if (!query) return worktrees;
      return worktrees.filter((worktree) => {
        const branch = getWorktreeBranch(worktree, currentBranch, () => '');
        return (
          getPathName(worktree.path).toLowerCase().includes(query) ||
          worktree.path.toLowerCase().includes(query) ||
          branch.toLowerCase().includes(query)
        );
      });
    }, [worktrees, search, currentBranch]);

    const currentWorktree = useMemo(
      () =>
        worktrees.find((worktree) => worktree.current) ?? worktrees.find((w) => w.path === path),
      [path, worktrees],
    );

    const currentPath = currentWorktree?.path ?? path;
    const currentName = getPathName(currentPath);
    const branchLabel = currentWorktree
      ? getWorktreeBranch(currentWorktree, currentBranch, (sha) =>
          t('workingDirectory.detachedHeadShort', { sha }),
        )
      : currentBranch;

    const commitWorktree = useCallback(
      async (worktree: DeviceGitWorktreeListItem) => {
        if (isLocked || worktree.current || isDisabled(worktree)) {
          setOpen(false);
          return;
        }

        await switchWorktree(worktree.path);
        setOpen(false);
      },
      [isLocked, switchWorktree],
    );

    const handleRemoveWorktree = useCallback(
      (event: MouseEvent, worktree: DeviceGitWorktreeListItem) => {
        event.stopPropagation();
        setOpen(false);
        confirmModal({
          cancelText: tCommon('cancel'),
          content: t('workingDirectory.removeWorktreeConfirm', {
            name: getPathName(worktree.path),
          }),
          okButtonProps: { danger: true },
          okText: tCommon('delete'),
          // Return synchronously (no promise) so the dialog closes instantly
          // instead of holding the user on a spinning modal for the duration of
          // a slow `git worktree remove`. The removal runs in the background;
          // completion and failure surface via bottom-left toasts, and the row
          // reconciles on the next `onWorktreesChange` revalidate.
          onOk: () => {
            setRemovingPaths((prev) => new Set(prev).add(worktree.path));
            // The dropdown is already closed, so a persistent loading toast is the
            // only signal that a (potentially slow) removal is in progress. It gets
            // swapped for the success/failure toast once the background op settles.
            const pendingToast = toast.loading(
              t('workingDirectory.removeWorktreePending', {
                name: getPathName(worktree.path),
              }),
            );
            void (async () => {
              const result = await gitService.removeGitWorktree({
                deviceId,
                path,
                worktreePath: worktree.path,
              });
              pendingToast.close();
              if (result.success) {
                // The list is hidden behind the closed dropdown, so this toast
                // is the only signal that the background removal finished.
                toast.success(t('workingDirectory.removeWorktreeSuccess'));
                await onWorktreesChange?.();
              } else {
                toast.error(result.error || t('workingDirectory.removeWorktreeFailed'));
              }
              setRemovingPaths((prev) => {
                const next = new Set(prev);
                next.delete(worktree.path);
                return next;
              });
            })();
          },
          title: t('workingDirectory.removeWorktreeTitle'),
        });
      },
      [deviceId, onWorktreesChange, path, t, tCommon],
    );

    // Create a worktree on a fresh branch (mirrors the branch switcher's "create
    // branch" flow), then switch the working directory into it. Returns an error
    // message for inline display in the modal, or undefined on success.
    const handleCreateWorktree = useCallback(
      async (branch: string): Promise<string | undefined> => {
        const worktreePath = deriveWorktreePath(sourcePath, branch);
        const result = await gitService.addGitWorktree({ branch, deviceId, path, worktreePath });
        if (!result.success) return result.error || t('workingDirectory.createWorktreeFailed');

        // Point the conversation at the freshly created worktree, then reconcile
        // the list so the new row (now `current`) appears.
        await switchWorktree(result.worktreePath ?? worktreePath);
        await onWorktreesChange?.();
        return undefined;
      },
      [deviceId, onWorktreesChange, path, sourcePath, switchWorktree, t],
    );

    const openCreateWorktree = useCallback(() => {
      setOpen(false);
      openCreateWorktreeModal({
        onSubmit: handleCreateWorktree,
        resolvePath: (branch) => deriveWorktreePath(sourcePath, branch),
      });
    }, [handleCreateWorktree, sourcePath]);

    // Scroll the current worktree into view each time the dropdown opens — the
    // list mounts at scrollTop=0, so a current worktree below the fold would
    // otherwise read as "nothing selected".
    useEffect(() => {
      if (!open) return;
      const raf = requestAnimationFrame(() => {
        currentRowRef.current?.scrollIntoView({ block: 'nearest' });
      });
      return () => cancelAnimationFrame(raf);
    }, [open, filtered.length, currentPath]);

    const triggerTitle = detached
      ? t('workingDirectory.detachedHead', { sha: currentBranch })
      : `${currentName} · ${branchLabel}`;
    // `git worktree list` always emits the main worktree first (a bare repo has
    // none, so every checkout is linked). Compare against it rather than
    // `sourcePath`, which is itself a linked worktree whenever the user picks one
    // directly as the working directory — that would show a branch icon while
    // standing inside a worktree.
    const [mainWorktree] = worktrees;
    const isLinkedWorktree =
      !!mainWorktree &&
      (!!mainWorktree.bare ||
        normalizeDisplayPath(currentPath) !== normalizeDisplayPath(mainWorktree.path));
    const triggerIcon = isLinkedWorktree ? GitForkIcon : GitBranchIcon;

    const trigger = children ?? (
      <div
        aria-label={t('workingDirectory.worktreesHeading')}
        className={styles.trigger}
        role="button"
      >
        <span className="anticon" role="img">
          {createElement(triggerIcon, { size: 13, width: 13, height: 13, fill: 'transparent' })}
        </span>
      </div>
    );

    return (
      <DropdownMenu open={open && !isLocked} onOpenChange={setOpen}>
        <DropdownMenuTrigger className={styles.triggerAnchor} disabled={isLocked}>
          <div className={children ? styles.triggerFill : undefined}>
            {open ? (
              trigger
            ) : (
              <SimpleTooltip title={isLocked ? t('workingDirectory.runningLocked') : triggerTitle}>
                {trigger}
              </SimpleTooltip>
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={placement === 'bottomRight' ? 'end' : 'start'}
          className="w-115 max-w-[calc(100vw-48px)] min-w-0"
          side={placement === 'topLeft' ? 'top' : 'bottom'}
          sideOffset={8}
        >
          <div className={styles.container}>
            <div className={styles.searchBar}>
              <div className="flex flex-row items-center gap-1.5 px-1.5">
                <span className="flex items-center">
                  <span className="anticon" role="img">
                    <SearchIcon fill={'transparent'} height={16} size={16} width={16} />
                  </span>
                </span>
                <Input
                  autoFocus
                  className={'border-0 px-0 shadow-none'}
                  placeholder={t('workingDirectory.worktreeSearchPlaceholder')}
                  value={search}
                  visualSize="compact"
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <div className={styles.list}>
              <div className={styles.sectionRow}>
                <div className={styles.section}>{t('workingDirectory.worktreesHeading')}</div>
                <div className={styles.refreshButton} role="button" onClick={handleRefresh}>
                  <span className={cn('anticon', cn(isRefreshing && styles.spinning))} role="img">
                    <RefreshCwIcon fill={'transparent'} height={16} size={16} width={16} />
                  </span>
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className={styles.emptyState}>
                  {search.trim()
                    ? t('workingDirectory.worktreesNoMatch')
                    : t('workingDirectory.worktreesEmpty')}
                </div>
              ) : (
                filtered.map((worktree) => {
                  const branch = getWorktreeBranch(worktree, currentBranch, (sha) =>
                    t('workingDirectory.detachedHeadShort', { sha }),
                  );
                  const displayPath = getRelativeDisplayPath(worktree.path, sourcePath);
                  const disabled = isDisabled(worktree);
                  const removing = removingPaths.has(worktree.path);
                  const removable =
                    canRemoveWorktree(worktree, sourcePath, mainWorktree?.path) && !removing;

                  return (
                    <DropdownMenuItem
                      aria-disabled={disabled}
                      className={styles.item}
                      closeOnClick={false}
                      data-current={worktree.current}
                      key={worktree.path}
                      ref={worktree.path === currentPath ? currentRowRef : undefined}
                      onClick={() => void commitWorktree(worktree)}
                    >
                      <div className={styles.itemMain}>
                        <div className={styles.rowTitle}>
                          <span className={styles.name}>{getPathName(worktree.path)}</span>
                          <span className={styles.branch}>{branch}</span>
                          {worktree.current && (
                            <span className={styles.badge}>
                              {t('workingDirectory.currentWorktree')}
                            </span>
                          )}
                          {worktree.detached && (
                            <span className={styles.badge}>
                              {t('workingDirectory.detachedWorktree')}
                            </span>
                          )}
                          {worktree.locked && (
                            <span className={styles.badge}>
                              {t('workingDirectory.lockedWorktree')}
                            </span>
                          )}
                          {worktree.prunable && (
                            <span className={styles.badge}>
                              {t('workingDirectory.prunableWorktree')}
                            </span>
                          )}
                          {worktree.bare && (
                            <span className={styles.badge}>
                              {t('workingDirectory.bareWorktree')}
                            </span>
                          )}
                        </div>
                        <div className={styles.path} title={worktree.path}>
                          {displayPath}
                        </div>
                      </div>
                      <div className={styles.dirtyCell}>
                        <DirtyStat status={worktree.status} />
                      </div>
                      <div className={styles.actionCell}>
                        {removing ? (
                          <span className="anticon animate-spin" role="img">
                            <LoaderCircleIcon
                              fill={'transparent'}
                              height={16}
                              size={16}
                              width={16}
                            />
                          </span>
                        ) : worktree.current ? (
                          <span className={cn('anticon', styles.check)} role="img">
                            <CheckIcon fill={'transparent'} height={16} size={16} width={16} />
                          </span>
                        ) : (
                          removable && (
                            <SimpleTooltip title={t('workingDirectory.removeWorktreeAction')}>
                              <div
                                aria-label={t('workingDirectory.removeWorktreeAction')}
                                className={`${styles.rowAction} worktree-row-action`}
                                role="button"
                                onClick={(event) => handleRemoveWorktree(event, worktree)}
                              >
                                <span className="anticon" role="img">
                                  <Trash2Icon
                                    fill={'transparent'}
                                    height={16}
                                    size={16}
                                    width={16}
                                  />
                                </span>
                              </div>
                            </SimpleTooltip>
                          )
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })
              )}
            </div>

            <div className={styles.createItemWrapper}>
              <DropdownMenuItem
                className={styles.createItem}
                closeOnClick={false}
                onClick={openCreateWorktree}
              >
                <span className={cn('anticon', styles.createItemIcon)} role="img">
                  <FolderPlusIcon fill={'transparent'} height={16} size={16} width={16} />
                </span>
                <div>{t('workingDirectory.createWorktreeAction')}</div>
              </DropdownMenuItem>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

WorktreeSwitcher.displayName = 'WorktreeSwitcher';

export default WorktreeSwitcher;
