import type { WorkingDirGitState } from '@orvilo/types';
import { cn } from 'cn';
import { ArrowDownIcon, ArrowUpIcon, GitPullRequest } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import RingLoadingIcon from '@/components/RingLoading';
import { toast } from '@/components/toast';
import { getHostPort } from '@/platform';
import { gitService } from '@/services/git';
import {
  deviceSelectors,
  useDeviceStore,
  useFetchGitAheadBehind,
  useFetchGitBranch,
  useFetchGitLinkedPR,
  useFetchGitWorktrees,
  useReviewPatches,
} from '@/store/device';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { SimpleTooltip } from '../SimpleTooltip';
import BranchSwitcher from './BranchSwitcher';
import { gitChipStyles } from './gitChipStyles';
import StaleGitSnapshot from './StaleGitSnapshot';
import WorktreeSwitcher from './WorktreeSwitcher';

const styles = {
  aheadBehindStat: 'inline-flex gap-0 items-center tabular-nums text-xs leading-5',
  aheadStat: 'text-info-text',
  behindStat: 'text-destructive-text',
  branchGroup: 'flex flex-none gap-0.5 items-center',
  branchLabel: 'overflow-hidden max-w-40 text-sm leading-5.5 text-ellipsis whitespace-nowrap',
  diffStat: 'inline-flex shrink-0 gap-1 items-center tabular-nums text-xs leading-5',
  diffStatAdded: 'text-success-text',
  diffStatDeleted: 'text-destructive-text',
  diffStatModified: 'text-warning-text',
  syncTrigger:
    'cursor-pointer inline-flex flex-none gap-0.5 items-center min-h-8 py-1 px-1 rounded-(--radius-button) text-xs leading-5 tabular-nums transition-colors duration-(--orvilo-motion-fast) hover:bg-accent',
  syncTriggerDisabled: 'cursor-progress opacity-60 hover:bg-transparent',
};

interface GitStatusProps {
  /** When set, git status / branch switch / pull / push all run against this
   * remote device via RPC. Omit for the local machine (talks over IPC). */
  agentId: string;
  deviceId?: string;
  /**
   * Git context persisted on the topic, used only when the live probe finds no
   * branch at `path` — which happens whenever the recorded worktree directory
   * has since been deleted. Standing in for the dead probe keeps the branch /
   * worktree / PR chips visible (read-only) instead of collapsing the whole
   * cluster, so the bar agrees with the topic's meta hover card, which reads
   * this same snapshot and never probes.
   */
  fallbackGit?: WorkingDirGitState;
  isGithub: boolean;
  path: string;
  sourcePath?: string;
  topicId?: string | null;
}

const GitStatus = memo<GitStatusProps>(
  ({ agentId, path, sourcePath, isGithub, deviceId, fallbackGit, topicId }) => {
    const { t } = useTranslation('device');
    // Transport (Electron IPC vs device RPC) is decided inside the service; the
    // component just reads, identically for local and remote.
    // Branch (cheap, refreshes promptly on dir switch) and the linked-PR lookup
    // (expensive `gh` call, throttled) are deliberately separate cache entries.
    const {
      data: branchData,
      error: branchError,
      mutate: mutateBranch,
    } = useFetchGitBranch(deviceId, path);
    const branch = branchData?.branch;
    const detached = branchData?.detached;
    // The persisted snapshot only stands in once the probe has actually ANSWERED.
    // `getGitBranch` resolves to `{}` for a path it can't read, so a settled probe
    // is `data !== undefined` (or an errored one) — keying off `!branch` alone
    // would flash the snapshot cluster on every mount while loading.
    const probeSettled = branchData !== undefined || !!branchError;
    // …and only when the probe could reach the directory at all. A remote read
    // whose device is offline (or whose RPC failed) comes back `undefined`, which
    // the service normalizes into the SAME empty shape a deleted path produces —
    // so an unreachable device would otherwise be reported as a missing directory,
    // offering to drop a worktree override that is perfectly alive. A local read
    // talks to this filesystem directly and has no such ambiguity.
    const deviceOnline = useDeviceStore(
      (s) => !!deviceSelectors.getDeviceById(deviceId)(s)?.online,
    );
    const probeReachedDirectory = !deviceId || deviceOnline;
    const isStale = !branch && probeSettled && probeReachedDirectory && !!fallbackGit?.branch;
    const { data: prData, mutate: mutatePR } = useFetchGitLinkedPR(
      deviceId,
      path,
      branch,
      isGithub,
    );
    // The remaining reads are all disabled once the directory is gone: nothing
    // below renders from them in that state, and the diff poll alone would keep
    // shelling out to git every 10s — one RPC round-trip per tick on a remote
    // device — against a path we already know cannot be read.
    const { data: reviewPatches, mutate: mutateReviewPatches } = useReviewPatches(
      path,
      'unstaged',
      undefined,
      deviceId,
      !isStale,
    );
    const livePath = isStale ? undefined : path;
    const { data: aheadBehind, mutate: mutateAheadBehind } = useFetchGitAheadBehind(
      deviceId,
      livePath,
    );
    const { data: worktrees = [], mutate: mutateWorktrees } = useFetchGitWorktrees(
      deviceId,
      livePath,
    );
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [pushing, setPushing] = useState(false);
    const toggleRightPanel = useGlobalStore((s) => s.toggleRightPanel);
    const openWorkingSidebar = useGlobalStore((s) => s.openWorkingSidebar);
    const showRightPanel = useGlobalStore(systemStatusSelectors.showRightPanel);
    const workingSidebarTab = useGlobalStore((s) => s.status.workingSidebarTab);

    const handleOpenPr = useCallback(() => {
      if (prData?.pullRequest?.url) {
        void getHostPort().openExternal(prData.pullRequest.url);
      }
    }, [prData?.pullRequest?.url]);

    const handleToggleReview = useCallback(() => {
      if (showRightPanel && workingSidebarTab === 'review') {
        toggleRightPanel(false);
        return;
      }
      openWorkingSidebar('review');
    }, [openWorkingSidebar, showRightPanel, workingSidebarTab, toggleRightPanel]);

    const refreshAfterSync = useCallback(async () => {
      await Promise.all([
        mutateBranch(),
        mutatePR(),
        mutateReviewPatches(),
        mutateAheadBehind(),
        mutateWorktrees(),
      ]);
    }, [mutateBranch, mutatePR, mutateReviewPatches, mutateAheadBehind, mutateWorktrees]);

    // Flip the displayed branch instantly on checkout. No revalidate here — the
    // switcher's onAfterCheckout reconciles once the checkout lands. The linked-PR
    // hook is keyed by branch, so it re-keys to the new branch on its own (its
    // cache starts empty there, hiding the stale PR until the lookup resolves).
    const handleOptimisticCheckout = useCallback(
      (nextBranch: string) => {
        void mutateBranch({ branch: nextBranch, detached: false }, { revalidate: false });
      },
      [mutateBranch],
    );

    const syncBusy = pulling || pushing;

    const handlePull = useCallback(async () => {
      if (pulling || pushing) return;
      setPulling(true);
      try {
        const result = await gitService.pullGitBranch({ deviceId, path });
        if (result.success) {
          if (result.noop) {
            toast.info(t('workingDirectory.pullNoop'));
          } else {
            toast.success(t('workingDirectory.pullSuccess'));
          }
          await refreshAfterSync();
        } else {
          toast.error(result.error || t('workingDirectory.pullFailed'));
        }
      } finally {
        setPulling(false);
      }
    }, [deviceId, path, pulling, pushing, refreshAfterSync, t]);

    const handlePush = useCallback(async () => {
      if (pulling || pushing) return;
      setPushing(true);
      try {
        const result = await gitService.pushGitBranch({ deviceId, path });
        if (result.success) {
          if (result.noop) {
            toast.info(t('workingDirectory.pushNoop'));
          } else {
            toast.success(t('workingDirectory.pushSuccess'));
          }
          await refreshAfterSync();
        } else {
          toast.error(result.error || t('workingDirectory.pushFailed'));
        }
      } finally {
        setPushing(false);
      }
    }, [deviceId, path, pulling, pushing, refreshAfterSync, t]);

    const diffStats = useMemo(() => {
      const patches = [
        ...(reviewPatches?.patches ?? []),
        ...(reviewPatches?.submodules ?? []).flatMap((submodule) => submodule.patches),
      ];
      return patches.reduce(
        (acc, patch) => {
          acc.additions += patch.additions ?? 0;
          acc.deletions += patch.deletions ?? 0;
          acc.files += 1;
          return acc;
        },
        { additions: 0, deletions: 0, files: 0 },
      );
    }, [reviewPatches?.patches, reviewPatches?.submodules]);
    const hasChanges = diffStats.files > 0;

    // Dead directory: the whole live cluster is unreachable, so hand off to the
    // snapshot renderer — it shows what the topic recorded and offers the one
    // action that can still work (drop the worktree override).
    if (isStale) {
      return (
        <StaleGitSnapshot
          agentId={agentId}
          git={fallbackGit!}
          isGithub={isGithub}
          path={path}
          sourcePath={sourcePath}
          topicId={topicId}
        />
      );
    }

    if (!branch) return null;

    const branchTooltip = detached ? t('workingDirectory.detachedHead', { sha: branch }) : branch;

    const prTooltip = prData?.pullRequest
      ? prData.extraCount
        ? t('workingDirectory.prTooltipWithExtra', {
            count: prData.extraCount,
            title: prData.pullRequest.title,
          })
        : prData.pullRequest.title
      : prData?.ghMissing
        ? t('workingDirectory.ghMissing')
        : undefined;

    const diffStatTooltip = hasChanges
      ? t('workingDirectory.diffLineStatTooltip', {
          added: diffStats.additions,
          deleted: diffStats.deletions,
          files: diffStats.files,
        })
      : undefined;

    const showAhead = !!aheadBehind && aheadBehind.hasUpstream && aheadBehind.ahead > 0;
    const showBehind = !!aheadBehind && aheadBehind.hasUpstream && aheadBehind.behind > 0;
    const upstreamName = aheadBehind?.upstream ?? '';
    const pushTargetName = aheadBehind?.pushTarget ?? '';
    const pushTargetExists = !!aheadBehind?.pushTargetExists;

    const branchTrigger = (
      <div
        className={cn(gitChipStyles.trigger, 'min-h-8 rounded-(--radius-button) text-xs leading-5')}
      >
        <span data-workspace-label className={styles.branchLabel}>
          {branch}
        </span>
      </div>
    );

    const hasWorktreeMenu = worktrees.length > 0;

    const worktreeNode = hasWorktreeMenu ? (
      <WorktreeSwitcher
        agentId={agentId}
        currentBranch={branch}
        detached={detached}
        deviceId={deviceId}
        isGithub={isGithub}
        path={path}
        sourcePath={sourcePath ?? path}
        topicId={topicId}
        worktrees={worktrees}
        onWorktreesChange={mutateWorktrees}
      />
    ) : null;

    const branchNode = detached ? (
      // Detached HEAD → plain branch label (nothing to switch to).
      <SimpleTooltip title={branchTooltip}>{branchTrigger}</SimpleTooltip>
    ) : (
      // Local switches over IPC; a remote device switches over RPC (deviceId set).
      <BranchSwitcher
        agentId={agentId}
        currentBranch={branch}
        deviceId={deviceId}
        isGithub={isGithub}
        open={switcherOpen}
        path={path}
        sourcePath={sourcePath ?? path}
        topicId={topicId}
        worktrees={worktrees}
        onExternalRefresh={refreshAfterSync}
        onOpenChange={setSwitcherOpen}
        onOptimisticCheckout={handleOptimisticCheckout}
        onAfterCheckout={() => {
          void mutateBranch();
          void mutatePR();
          void mutateReviewPatches();
          void mutateAheadBehind();
          void mutateWorktrees();
        }}
      >
        <SimpleTooltip title={branchTooltip}>{branchTrigger}</SimpleTooltip>
      </BranchSwitcher>
    );

    const pullTooltip = pulling
      ? t('workingDirectory.pullInProgress')
      : t('workingDirectory.pullAction', {
          count: aheadBehind?.behind ?? 0,
          upstream: upstreamName,
        });

    const pushTooltip = pushing
      ? t('workingDirectory.pushInProgress')
      : t(pushTargetExists ? 'workingDirectory.pushAction' : 'workingDirectory.pushActionNew', {
          count: aheadBehind?.ahead ?? 0,
          target: pushTargetName || upstreamName,
        });

    const pullNode = showBehind && (
      <SimpleTooltip title={pullTooltip}>
        <div
          aria-busy={pulling}
          aria-disabled={syncBusy}
          className={`${styles.syncTrigger} ${styles.behindStat} ${syncBusy ? styles.syncTriggerDisabled : ''}`}
          role="button"
          onClick={syncBusy ? undefined : handlePull}
        >
          <span className={styles.aheadBehindStat}>
            {pulling ? (
              <RingLoadingIcon size={10} />
            ) : (
              <span className="anticon" role="img">
                <ArrowDownIcon fill={'transparent'} height={10} size={10} width={10} />
              </span>
            )}
            {aheadBehind!.behind}
          </span>
        </div>
      </SimpleTooltip>
    );

    const pushNode = showAhead && (
      <SimpleTooltip title={pushTooltip}>
        <div
          aria-busy={pushing}
          aria-disabled={syncBusy}
          className={`${styles.syncTrigger} ${styles.aheadStat} ${syncBusy ? styles.syncTriggerDisabled : ''}`}
          role="button"
          onClick={syncBusy ? undefined : handlePush}
        >
          <span className={styles.aheadBehindStat}>
            {pushing ? (
              <RingLoadingIcon size={10} />
            ) : (
              <span className="anticon" role="img">
                <ArrowUpIcon fill={'transparent'} height={10} size={10} width={10} />
              </span>
            )}
            {aheadBehind!.ahead}
          </span>
        </div>
      </SimpleTooltip>
    );

    const diffNode = (() => {
      if (!hasChanges) return null;
      const diffButton = (
        <div
          role="button"
          className={cn(
            gitChipStyles.trigger,
            'min-h-8 rounded-(--radius-button) text-xs leading-5',
          )}
          onClick={handleToggleReview}
        >
          <span className={styles.diffStat}>
            {diffStats.additions > 0 && (
              <span className={styles.diffStatAdded}>+{diffStats.additions}</span>
            )}
            {diffStats.deletions > 0 && (
              <span className={styles.diffStatDeleted}>-{diffStats.deletions}</span>
            )}
            {diffStats.additions === 0 && diffStats.deletions === 0 && diffStats.files > 0 && (
              <span className={styles.diffStatModified}>±{diffStats.files}</span>
            )}
          </span>
        </div>
      );
      return <SimpleTooltip title={diffStatTooltip}>{diffButton}</SimpleTooltip>;
    })();

    return (
      <>
        <div className={gitChipStyles.separator} />
        {/* The worktree icon and the branch name name one thing — which checkout
         * you're on — so they sit closer to each other than to their neighbours. */}
        <div className={styles.branchGroup}>
          {worktreeNode}
          {branchNode}
        </div>
        {pullNode}
        {pushNode}
        {diffNode}
        {prData?.pullRequest && (
          <>
            <div className={gitChipStyles.separator} />
            <SimpleTooltip title={prTooltip}>
              <div
                role="button"
                className={cn(
                  gitChipStyles.prTrigger,
                  'min-h-8 rounded-(--radius-button) text-xs leading-5',
                )}
                onClick={handleOpenPr}
              >
                <span className="anticon" role="img">
                  <GitPullRequest fill={'transparent'} height={12} size={12} width={12} />
                </span>
                <span>#{prData.pullRequest.number}</span>
              </div>
            </SimpleTooltip>
          </>
        )}
      </>
    );
  },
);

GitStatus.displayName = 'GitStatus';

export default GitStatus;
