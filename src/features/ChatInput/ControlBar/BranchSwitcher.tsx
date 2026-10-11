import type { DeviceGitWorktreeListItem } from '@orvilo/types';
import { cn } from 'cn';
import {
  CheckIcon,
  CopyIcon,
  GitBranchIcon,
  GitBranchPlusIcon,
  GitForkIcon,
  LoaderIcon,
  PencilIcon,
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
import useSWR from 'swr';

import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { deviceKeys } from '@/libs/swr/keys';
import { gitService } from '@/services/git';
import { useFetchGitWorkingTreeStatus } from '@/store/device';

import { SimpleTooltip } from '../SimpleTooltip';
import { openCreateBranchModal } from './CreateBranchModal';
import { openRenameBranchModal } from './RenameBranchModal';
import { useSwitchWorktree } from './useSwitchWorktree';
import { findWorktreeForBranch, getPathName } from './worktreeHelpers';

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.append(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
  }
};

const styles = {
  branchLabel: 'overflow-hidden text-ellipsis whitespace-nowrap',
  triggerAnchor: 'inline-flex flex-none',
  triggerFill: 'flex w-full [&>*]:flex-1',
  footer: 'border-bs border-divider',
  header: 'p-0',
  emptyState: 'py-3 text-sm leading-5.5 text-foreground-description text-center',
  item: 'flex gap-2 items-center h-auto min-h-8 py-0 px-2 rounded-(--radius-button) text-sm leading-5.5 text-foreground data-[current=true]:bg-selected data-[current=true]:hover:bg-selected data-[current=true]:focus:bg-selected hover:[&_.branch-row-actions]:flex focus-within:[&_.branch-row-actions]:flex hover:[&_.branch-row-check]:hidden focus-within:[&_.branch-row-check]:hidden',
  itemCheck: 'flex-none text-primary',
  rowAction:
    'cursor-pointer flex items-center justify-center size-8 rounded-(--radius-button) text-foreground-tertiary transition-colors duration-(--orvilo-motion-fast) hover:text-foreground hover:bg-accent',
  rowActionDanger: 'hover:text-destructive-text hover:bg-destructive-wash',
  rowActions: 'hidden flex-none gap-0.5 items-center',
  itemIcon: 'flex-none text-muted-foreground',
  itemMain: 'overflow-hidden flex-1 min-w-0',
  itemMeta: 'text-xs leading-5 text-foreground-tertiary',
  list: 'overflow-y-auto flex-1 min-h-0 max-h-80',
  popup: 'w-75 h-90',
  searchBar: 'py-1 px-3 border-be border-divider',
  refreshButton:
    'cursor-pointer flex items-center justify-center size-8 rounded-(--radius-button) text-foreground-tertiary transition-colors duration-(--orvilo-motion-fast) hover:text-foreground hover:bg-accent',
  section: 'flex-1 text-xs leading-5 font-medium text-foreground-tertiary',
  sectionRow: 'flex gap-1 items-center pbs-1 pbe-0.5 px-2',
  spinning: 'animate-spin [animation-duration:0.8s] motion-reduce:animate-none',
};

interface BranchSwitcherProps {
  agentId: string;
  children: ReactElement;
  currentBranch?: string;
  /**
   * When set, branch list + checkout go through the `device.*` RPCs (web / remote
   * device). Omit for the local machine, which talks to Electron over IPC.
   */
  deviceId?: string;
  isGithub: boolean;
  onAfterCheckout?: () => void;
  onExternalRefresh?: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  /** Reflect a branch switch in the UI immediately, before the checkout lands. */
  onOptimisticCheckout?: (branch: string) => void;
  open: boolean;
  path: string;
  /** Dropdown placement — the runtime bar opens upward, embedding panels open downward. */
  placement?: 'topLeft' | 'bottomLeft' | 'bottomRight';
  /** The repo the conversation is anchored to (worktrees hang off it). */
  sourcePath: string;
  topicId?: string | null;
  /** Used to route a checkout into the worktree that already holds the branch. */
  worktrees: DeviceGitWorktreeListItem[];
}

const BranchSwitcher = memo<BranchSwitcherProps>(
  ({
    agentId,
    topicId,
    path,
    currentBranch,
    deviceId,
    isGithub,
    open,
    onOpenChange,
    onAfterCheckout,
    onExternalRefresh,
    onOptimisticCheckout,
    placement = 'topLeft',
    sourcePath,
    worktrees,
    children,
  }) => {
    const { t } = useTranslation('device');
    const { t: tCommon } = useTranslation('common');
    const [search, setSearch] = useState('');
    const [busyBranch, setBusyBranch] = useState<string | null>(null);
    const currentRowRef = useRef<HTMLDivElement>(null);
    const switchWorktree = useSwitchWorktree({ agentId, isGithub, sourcePath, topicId });

    const {
      data: branches = [],
      isLoading,
      error: branchesError,
      mutate: mutateBranches,
    } = useSWR(
      open ? deviceKeys.gitBranches(deviceId ?? 'local', path) : null,
      () => gitService.listGitBranches({ deviceId, path }),
      { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false },
    );
    const { data: workingStatus, mutate: mutateWorkingStatus } = useFetchGitWorkingTreeStatus(
      deviceId,
      path,
    );
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
      if (isRefreshing) return;
      setIsRefreshing(true);
      try {
        await Promise.all([
          mutateBranches(),
          mutateWorkingStatus(),
          Promise.resolve(onExternalRefresh?.()),
        ]);
      } finally {
        setIsRefreshing(false);
      }
    }, [isRefreshing, mutateBranches, mutateWorkingStatus, onExternalRefresh]);

    useEffect(() => {
      if (!open) setSearch('');
    }, [open]);

    // Surface a branch-list load failure as a Toast with Retry (base-ui Toast
    // carries an action; antd `message` can't). Reopening the dropdown also
    // refetches, but Retry recovers without closing.
    useEffect(() => {
      if (open && branchesError) {
        toast.error({
          actions: [
            { label: tCommon('retry'), onClick: () => void mutateBranches(), variant: 'text' },
          ],
          title: t('workingDirectory.branchesLoadFailed'),
        });
      }
    }, [open, branchesError, mutateBranches, t, tCommon]);

    // Scroll the current branch into view each time the dropdown opens — the
    // popup mounts at scrollTop=0, so a checked branch below the fold would read
    // as "nothing selected". Keyed on branches.length so it fires once the async
    // list has painted.
    useEffect(() => {
      if (!open) return;
      const raf = requestAnimationFrame(() => {
        currentRowRef.current?.scrollIntoView({ block: 'nearest' });
      });
      return () => cancelAnimationFrame(raf);
    }, [open, branches.length, currentBranch]);

    const filtered = useMemo(() => {
      const query = search.trim().toLowerCase();
      if (!query) return branches;
      return branches.filter((b) => b.name.toLowerCase().includes(query));
    }, [branches, search]);

    const handleCheckout = useCallback(
      async (branch: string, create = false) => {
        if (busyBranch) return;
        if (!create && branch === currentBranch) {
          onOpenChange(false);
          return;
        }

        // Git refuses to check out a branch another worktree already holds. That
        // worktree's HEAD is on the branch, so switching into it is what the user
        // asked for — route there instead of surfacing git's error.
        const owner = create ? undefined : findWorktreeForBranch(worktrees, branch);
        if (owner) {
          setBusyBranch(branch);
          onOpenChange(false);
          try {
            await switchWorktree(owner.path);
          } finally {
            onAfterCheckout?.();
            setBusyBranch(null);
          }
          return;
        }

        setBusyBranch(branch);
        // Reflect the switch instantly and close; the checkout + revalidate
        // reconcile in the background (a failure rolls the label back).
        onOptimisticCheckout?.(branch);
        onOpenChange(false);
        try {
          const result = await gitService.checkoutGitBranch({ branch, create, deviceId, path });
          if (!result.success) {
            toast.error(result.error || t('workingDirectory.checkoutFailed'));
          }
        } finally {
          onAfterCheckout?.();
          setBusyBranch(null);
        }
      },
      [
        busyBranch,
        currentBranch,
        deviceId,
        onAfterCheckout,
        onOptimisticCheckout,
        onOpenChange,
        path,
        switchWorktree,
        t,
        worktrees,
      ],
    );

    // Create + checkout a new branch from the modal. Returns an error message
    // for inline display (keeps the modal open), or undefined on success.
    const handleCreateBranch = useCallback(
      async (name: string): Promise<string | undefined> => {
        onOptimisticCheckout?.(name);
        const result = await gitService.checkoutGitBranch({
          branch: name,
          create: true,
          deviceId,
          path,
        });
        // Reconcile either way: success fills in PR / ahead-behind, failure rolls
        // the optimistic label back to the real branch.
        onAfterCheckout?.();
        if (result.success) {
          onOpenChange(false);
          return undefined;
        }
        return result.error || t('workingDirectory.checkoutFailed');
      },
      [deviceId, onAfterCheckout, onOptimisticCheckout, onOpenChange, path, t],
    );

    const openCreateBranch = useCallback(() => {
      onOpenChange(false);
      openCreateBranchModal({ onSubmit: handleCreateBranch });
    }, [handleCreateBranch, onOpenChange]);

    // Rename a branch from a modal. Closes the dropdown first (mirrors create),
    // then reconciles via onAfterCheckout — a renamed current branch updates the
    // header label, and the list refetches when the dropdown reopens.
    const handleRename = useCallback(
      (event: MouseEvent, branch: string) => {
        event.stopPropagation();
        onOpenChange(false);
        openRenameBranchModal({
          currentName: branch,
          onSubmit: async (newName) => {
            if (newName === branch) return undefined;
            const result = await gitService.renameGitBranch({
              deviceId,
              from: branch,
              path,
              to: newName,
            });
            onAfterCheckout?.();
            if (result.success) return undefined;
            return result.error || t('workingDirectory.renameFailed');
          },
        });
      },
      [deviceId, onAfterCheckout, onOpenChange, path, t],
    );

    const handleCopy = useCallback(
      async (event: MouseEvent, branch: string) => {
        event.stopPropagation();
        try {
          await copyToClipboard(branch);
          toast.success(tCommon('copySuccess'));
        } catch {
          toast.error(tCommon('copyFail'));
        }
      },
      [tCommon],
    );

    // Delete a branch behind a destructive confirm. git rejects deleting the
    // checked-out branch, so the action is hidden for the current branch.
    const handleDelete = useCallback(
      (event: MouseEvent, branch: string) => {
        event.stopPropagation();
        onOpenChange(false);
        confirmModal({
          cancelText: tCommon('cancel'),
          content: t('workingDirectory.deleteBranchConfirm', { name: branch }),
          okButtonProps: { danger: true },
          okText: tCommon('delete'),
          onOk: async () => {
            const result = await gitService.deleteGitBranch({ branch, deviceId, path });
            onAfterCheckout?.();
            if (!result.success) {
              toast.error(result.error || t('workingDirectory.deleteFailed'));
            }
          },
          title: t('workingDirectory.deleteBranchTitle'),
        });
      },
      [deviceId, onAfterCheckout, onOpenChange, path, t, tCommon],
    );

    return (
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger className={styles.triggerAnchor}>
          <div className={styles.triggerFill}>{children}</div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={placement === 'bottomRight' ? 'end' : 'start'}
          className={styles.popup}
          side={placement === 'topLeft' ? 'top' : 'bottom'}
          sideOffset={8}
        >
          <div className={styles.header}>
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
                  placeholder={t('workingDirectory.branchSearchPlaceholder')}
                  value={search}
                  visualSize="compact"
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <div className={styles.sectionRow}>
              <div className={styles.section}>{t('workingDirectory.branchesHeading')}</div>
              <div className={styles.refreshButton} role="button" onClick={handleRefresh}>
                <span className={cn('anticon', cn(isRefreshing && styles.spinning))} role="img">
                  <RefreshCwIcon fill={'transparent'} height={16} size={16} width={16} />
                </span>
              </div>
            </div>
          </div>

          {isLoading && branches.length === 0 ? (
            <div className={styles.emptyState}>{t('workingDirectory.branchesLoading')}</div>
          ) : !isLoading && branchesError ? (
            <div className={styles.emptyState}>{t('workingDirectory.branchesLoadFailed')}</div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              {search.trim()
                ? t('workingDirectory.branchesNoMatch')
                : t('workingDirectory.branchesEmpty')}
            </div>
          ) : (
            <div className={styles.list}>
              {filtered.map((branch) => {
                const isCurrent = branch.name === currentBranch;
                const isBusy = busyBranch === branch.name;
                // A branch another worktree holds can't be checked out here
                // (clicking routes into that worktree) and can't be deleted.
                const owner = findWorktreeForBranch(worktrees, branch.name);
                return (
                  <DropdownMenuItem
                    className={styles.item}
                    closeOnClick={false}
                    data-current={isCurrent ? 'true' : undefined}
                    key={branch.name}
                    ref={isCurrent ? currentRowRef : undefined}
                    onClick={() => handleCheckout(branch.name)}
                  >
                    <span
                      className={cn('anticon', cn(styles.itemIcon, isBusy && styles.spinning))}
                      role="img"
                    >
                      {createElement(isBusy ? LoaderIcon : owner ? GitForkIcon : GitBranchIcon, {
                        size: 16,
                        width: 16,
                        height: 16,
                        fill: 'transparent',
                      })}
                    </span>
                    <div className={styles.itemMain}>
                      <div className={styles.branchLabel}>{branch.name}</div>
                      {isCurrent && workingStatus && !workingStatus.clean && (
                        <div className={styles.itemMeta}>
                          {t('workingDirectory.uncommittedChanges', {
                            count: workingStatus.total,
                          })}
                        </div>
                      )}
                      {owner && (
                        <div className={styles.itemMeta}>
                          {t('workingDirectory.branchInWorktree', {
                            name: getPathName(owner.path),
                          })}
                        </div>
                      )}
                    </div>
                    {isCurrent && (
                      <span
                        className={cn('anticon', cn('branch-row-check', styles.itemCheck))}
                        role="img"
                      >
                        <CheckIcon fill={'transparent'} height={16} size={16} width={16} />
                      </span>
                    )}
                    <div className={cn('branch-row-actions', styles.rowActions)}>
                      <SimpleTooltip title={tCommon('copy')}>
                        <div
                          aria-label={tCommon('copy')}
                          className={styles.rowAction}
                          role="button"
                          onClick={(e) => void handleCopy(e, branch.name)}
                        >
                          <span className="anticon" role="img">
                            <CopyIcon fill={'transparent'} height={16} size={16} width={16} />
                          </span>
                        </div>
                      </SimpleTooltip>
                      <SimpleTooltip title={t('workingDirectory.renameBranchAction')}>
                        <div
                          className={styles.rowAction}
                          role="button"
                          onClick={(e) => handleRename(e, branch.name)}
                        >
                          <span className="anticon" role="img">
                            <PencilIcon fill={'transparent'} height={16} size={16} width={16} />
                          </span>
                        </div>
                      </SimpleTooltip>
                      {!isCurrent && !owner && (
                        <SimpleTooltip title={t('workingDirectory.deleteBranchAction')}>
                          <div
                            className={cn(styles.rowAction, styles.rowActionDanger)}
                            role="button"
                            onClick={(e) => handleDelete(e, branch.name)}
                          >
                            <span className="anticon" role="img">
                              <Trash2Icon fill={'transparent'} height={16} size={16} width={16} />
                            </span>
                          </div>
                        </SimpleTooltip>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}

          <div className={styles.footer}>
            <DropdownMenuItem className={styles.item} onClick={openCreateBranch}>
              <span className={cn('anticon', styles.itemIcon)} role="img">
                <GitBranchPlusIcon fill={'transparent'} height={16} size={16} width={16} />
              </span>
              <div className={styles.itemMain}>{t('workingDirectory.createBranchAction')}</div>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

BranchSwitcher.displayName = 'BranchSwitcher';

export default BranchSwitcher;
