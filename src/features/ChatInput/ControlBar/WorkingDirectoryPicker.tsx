'use client';

import { isDesktop } from '@orvilo/const';
import type { WorkingDirEntry } from '@orvilo/types';
import { getWorkingDirSourcePath } from '@orvilo/types';
import { cn } from 'cn';
import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useConversationStore } from '@/features/Conversation/store';
import { openAddWorkingDirModal } from '@/features/WorkingDirectory';
import {
  resolveAgentWorkingDirectorySource,
  resolveTargetDeviceId,
} from '@/helpers/agentWorkingDirectory';
import {
  getWorkingDirectoryName,
  getWorkingDirectoryPathString,
} from '@/helpers/workingDirectoryPath';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { getHostPort, hostResultOr } from '@/platform';
import { deviceService } from '@/services/device';
import { useAgentStore } from '@/store/agent';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { deviceSelectors, useDeviceStore } from '@/store/device';
import { useElectronStore } from '@/store/electron';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import { SimpleTooltip } from '../SimpleTooltip';
import DirIcon from './DirIcon';
import { useCommitWorkingDirectory } from './useCommitWorkingDirectory';
import { useMigrateDeviceRecents } from './useMigrateDeviceRecents';

// Show the in-place search box only once the list is long enough that scanning
// gets tedious — a short list doesn't need the extra chrome.
const SEARCH_THRESHOLD = 8;

const styles = {
  badge: 'flex-none px-1 rounded-full text-xs leading-5 text-foreground-tertiary bg-selected',
  button:
    'cursor-pointer flex flex-none gap-1.5 items-center min-h-8 py-1 px-1 rounded-(--radius-button) text-sm leading-5.5 text-muted-foreground whitespace-nowrap transition-colors duration-(--orvilo-motion-fast) hover:bg-accent',
  buttonOpen: 'text-foreground bg-selected hover:bg-selected',
  buttonLabel: 'overflow-hidden max-w-35 text-ellipsis whitespace-nowrap',
  chooseFolderItem:
    'cursor-pointer justify-start w-full rounded-(--radius-button) text-sm leading-5.5 text-muted-foreground transition-colors duration-(--orvilo-motion-fast) hover:text-foreground hover:bg-accent',
  clearText:
    'cursor-pointer px-2 text-xs leading-5 font-medium text-foreground-tertiary transition-colors duration-(--orvilo-motion-fast) hover:text-foreground',
  dirItem:
    'cursor-pointer min-h-8 py-1.5 px-2 rounded-(--radius-button) transition-colors duration-(--orvilo-motion-fast) focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 focus-within:[&_.wd-row-actions]:flex hover:bg-accent hover:[&_.wd-row-actions]:flex',
  dirItemActive: 'bg-selected hover:bg-selected',
  dirName:
    'overflow-hidden text-sm leading-5.5 font-medium text-foreground text-ellipsis whitespace-nowrap',
  dirPath:
    'overflow-hidden text-xs leading-5 text-foreground-description text-ellipsis whitespace-nowrap',
  rowActions: 'hidden flex-none gap-0.5 items-center',
  scrollContainer: 'overflow-y-auto max-h-80',
  searchBar: 'py-0.5 px-2 border-b border-divider',
  sectionTitle: 'pt-1.5 pb-0.5 px-2 text-xs leading-5 font-medium text-foreground-tertiary',
};

const isValidWorkingDirEntry = (entry: WorkingDirEntry): boolean =>
  !!getWorkingDirectoryPathString(entry.path);

type FolderEntry = { path: string; repoType?: 'git' | 'github' };

/** This machine: browse the filesystem via the native Electron folder dialog. */
const ChooseLocalFolderRow = memo<{ defaultPath?: string; onPick: (entry: FolderEntry) => void }>(
  ({ defaultPath, onPick }) => {
    const { t } = useTranslation('device');
    const handleClick = async () => {
      const result = hostResultOr(
        await getHostPort().dialog.selectFolder({
          defaultPath: defaultPath || undefined,
          title: t('workingDirectory.selectFolder'),
        }),
        undefined,
      );
      if (result) onPick({ path: result.path, repoType: result.repoType });
    };
    return (
      <Button
        className={cn('flex flex-row items-center gap-2', styles.chooseFolderItem)}
        size="compact"
        variant="ghost"
        onClick={handleClick}
      >
        <span className="anticon" role="img">
          <FolderOpenIcon fill={'transparent'} height={14} size={14} width={14} />
        </span>
        <span>{t('workingDirectory.chooseDifferentFolder')}</span>
      </Button>
    );
  },
);
ChooseLocalFolderRow.displayName = 'ChooseLocalFolderRow';

/** Browse the target device through its directory RPC. */
const AddRemoteFolderRow = memo<{
  defaultCwd?: string;
  deviceId?: string;
  onBeforeOpen: () => void;
  onPick: (entry: FolderEntry) => void;
}>(({ defaultCwd, deviceId, onBeforeOpen, onPick }) => {
  const { t } = useTranslation('device');

  // Validate the selected or manually entered path on the target device: block
  // on a definitive negative, otherwise commit with the detected repoType so the
  // recent entry shows the right (git / github) icon. An unreachable device
  // (null) is treated as "can't verify" and allowed through without a repoType.
  const handleSubmit = async (path: string): Promise<string | undefined> => {
    const result = deviceId ? await deviceService.statPath(deviceId, path) : undefined;
    if (result) {
      if (!result.exists) return t('workingDirectory.pathNotExist');
      if (!result.isDirectory) return t('workingDirectory.pathNotDirectory');
    }
    onPick({ path, repoType: result?.repoType });
    return undefined;
  };

  const handleClick = () => {
    onBeforeOpen();
    openAddWorkingDirModal({
      defaultPath: defaultCwd || undefined,
      deviceId,
      onSubmit: handleSubmit,
    });
  };
  return (
    <Button
      className={cn('flex flex-row items-center gap-2', styles.chooseFolderItem)}
      size="compact"
      variant="ghost"
      onClick={handleClick}
    >
      <span className="anticon" role="img">
        <FolderPlusIcon fill={'transparent'} height={14} size={14} width={14} />
      </span>
      <span>{t('workingDirectory.addFolder')}</span>
    </Button>
  );
});
AddRemoteFolderRow.displayName = 'AddRemoteFolderRow';

interface WorkingDirectoryPickerProps {
  agentId: string;
}

/**
 * Unified working-directory picker for both local and remote runs. Recents come
 * from the target device's `device.workingDirs`; picks write through the unified
 * `useCommitWorkingDirectory` (topic override / agent per-device choice). When
 * the target is this machine, the native folder dialog is offered; a true remote
 * device falls back to manual path entry (its filesystem isn't browsable here).
 *
 * The device-wide **default** directory (`device.defaultCwd`) is surfaced
 * explicitly — the row carrying it wears a "default" badge, and any row can be
 * promoted to the default from its hover actions — so the fallback the agent
 * runs in when nothing is picked is never invisible.
 */
const WorkingDirectoryPicker = memo<WorkingDirectoryPickerProps>(({ agentId }) => {
  const topicId = useConversationStore((s) => s.context.topicId);
  const { t } = useTranslation('device');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Populate the device store (SWR dedupes across callers). Devices sit behind an
  // authed lambda procedure, so only fetch once signed in (desktop always fetches).
  const isLogin = useUserStore(authSelectors.isLogin);
  useDeviceStore((s) => s.useFetchDevices)(isLogin || isDesktop);
  // One-time fold of legacy localStorage recents into device.workingDirs.
  useMigrateDeviceRecents();

  // Effective config (shared row + this member's device override)
  // so recents / default cwd / the selected-repo label all resolve against the
  // device THIS member's run actually targets.
  const { agencyConfig, workspaceScoped } = useTopicAgencyConfig(agentId);
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const targetDeviceId = resolveTargetDeviceId(agencyConfig, currentDeviceId, {
    workspaceScoped,
  });
  // The local machine's filesystem is browsable; a remote device's is not.
  const isLocalDevice = isDesktop && !!targetDeviceId && targetDeviceId === currentDeviceId;

  const rawRecents = useDeviceStore(deviceSelectors.getDeviceWorkingDirs(targetDeviceId));
  const recents = useMemo(() => rawRecents.filter(isValidWorkingDirEntry), [rawRecents]);
  const rawDeviceDefaultCwd = useDeviceStore(deviceSelectors.getDeviceDefaultCwd(targetDeviceId));
  const deviceDefaultCwd = getWorkingDirectoryPathString(rawDeviceDefaultCwd);
  const rawTopicWorkingDirectory = useChatStore(topicSelectors.getTopicWorkingDirectory(topicId));
  const topicWorkingDirectory = getWorkingDirectoryPathString(rawTopicWorkingDirectory);
  const topicWorkingDirectoryConfig = useChatStore((s) =>
    topicId ? topicSelectors.getTopicById(topicId)(s)?.metadata?.workingDirectoryConfig : undefined,
  );
  const rawLegacyAgentWorkingDirectory = useAgentStore(
    (s) => s.localAgentWorkingDirectoryMap[agentId],
  );
  const legacyAgentWorkingDirectory = getWorkingDirectoryPathString(rawLegacyAgentWorkingDirectory);

  // The explicitly-selected REPO (no home fallback) — drives the directory label,
  // the active check, and the Reset affordance. Resolves to the SOURCE path
  // (repo root), never the active worktree: the label shows the repo the agent is
  // bound to, while the worktree switcher in git status tracks the active
  // worktree separately.
  const resolvedSelectedDir = resolveAgentWorkingDirectorySource({
    agencyConfig,
    currentDeviceId,
    deviceDefaultCwd,
    legacyAgentWorkingDirectory,
    topicWorkingDirectory,
    topicWorkingDirectoryConfig,
    workspaceScoped,
  });
  const selectedDir = getWorkingDirectoryPathString(resolvedSelectedDir);

  // Reset only makes sense when an agent-level override exists. The device-wide
  // `deviceDefaultCwd` isn't clearable from here (it's the fallback itself), so
  // gating on it would render a dead button when the cwd comes from the default.
  const agentChoice = targetDeviceId
    ? agencyConfig?.workingDirByDevice?.[targetDeviceId]
    : undefined;
  const hasClearableSelection = !!(
    topicWorkingDirectory ||
    agentChoice ||
    legacyAgentWorkingDirectory
  );

  const { clear, commit, isLocked } = useCommitWorkingDirectory(agentId, topicId ?? null);
  const clearDeviceDefaultCwd = useDeviceStore((s) => s.clearDeviceDefaultCwd);
  const removeDeviceWorkingDir = useDeviceStore((s) => s.removeDeviceWorkingDir);
  const updateDeviceCwd = useDeviceStore((s) => s.updateDeviceCwd);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recents;
    return recents.filter(
      (entry) =>
        getWorkingDirectoryName(entry.path)?.toLowerCase().includes(query) ||
        entry.path.toLowerCase().includes(query),
    );
  }, [recents, search]);

  const showSearch = recents.length > SEARCH_THRESHOLD;

  // Reset the query each time the picker closes.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Scroll the current selection into view every time the picker opens — the
  // popover re-mounts its list at scrollTop=0, so a selected dir below the fold
  // would otherwise read as "nothing selected". Re-run when the filtered rows
  // change (search) so the active row, if still present, stays visible.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      activeRowRef.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, filtered.length]);

  const pick = async (entry: WorkingDirEntry) => {
    await commit(entry);
    setOpen(false);
  };

  const handleRemoveRecent = (e: React.MouseEvent, entry: WorkingDirEntry) => {
    e.stopPropagation();
    if (!targetDeviceId) return;
    // Both remove and the undo re-add persist the *whole* `workingDirs` array, so
    // an undo fired before the remove settles would race it — a late-finishing
    // remove would clobber the re-added entry and the undo would silently fail.
    // Chain the undo behind the remove promise so the re-add always writes last.
    const removed = removeDeviceWorkingDir(targetDeviceId, entry.path);
    toast.success({
      actions: [
        {
          label: t('workingDirectory.undo'),
          onClick: () =>
            void removed.then(() => updateDeviceCwd(targetDeviceId, entry, { setDefault: false })),
          variant: 'text',
        },
      ],
      title: t('workingDirectory.removed', {
        name: getWorkingDirectoryName(entry.path) ?? entry.path,
      }),
    });
  };

  const handleToggleDefault = async (
    e: React.MouseEvent,
    entry: WorkingDirEntry,
    isDefault: boolean,
  ) => {
    e.stopPropagation();
    if (!targetDeviceId) return;

    try {
      if (isDefault) await clearDeviceDefaultCwd(targetDeviceId);
      else await updateDeviceCwd(targetDeviceId, entry, { setDefault: true });
    } catch {
      toast.error(t('workingDirectory.defaultUpdateFailed'));
    }
  };

  const renderRow = (entry: WorkingDirEntry) => {
    const sourcePath = getWorkingDirSourcePath(entry);
    const isActive = sourcePath === selectedDir;
    const isDefault = !!deviceDefaultCwd && sourcePath === deviceDefaultCwd;
    const defaultActionLabel = t(
      isDefault ? 'workingDirectory.clearDefault' : 'workingDirectory.setDefault',
    );
    return (
      <div
        aria-current={isActive ? 'true' : undefined}
        key={entry.path}
        ref={isActive ? activeRowRef : undefined}
        role="button"
        tabIndex={0}
        className={cn(
          'flex flex-row items-center gap-2',
          cn(styles.dirItem, isActive && styles.dirItemActive),
        )}
        onClick={() => void pick(entry)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          void pick(entry);
        }}
      >
        <DirIcon repoType={entry.repoType} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-row items-center gap-1.5">
            <div className={styles.dirName}>
              {getWorkingDirectoryName(entry.path) ?? entry.path}
            </div>
            {isDefault && (
              <span className={styles.badge}>{t('workingDirectory.defaultBadge')}</span>
            )}
          </div>
          <div className={styles.dirPath}>{entry.path}</div>
        </div>
        <div className="flex flex-none flex-row items-center gap-0.5">
          {/* The same Star toggles the device default in both directions. Remove
              (X) is hidden on the active row: you can't remove the selection out
              from under yourself. */}
          <div className={cn('wd-row-actions', styles.rowActions)}>
            <ActionIcon
              active={isDefault}
              aria-label={defaultActionLabel}
              aria-pressed={isDefault}
              icon={StarIcon}
              size={{ blockSize: 28, borderRadius: 6, size: 13 }}
              title={defaultActionLabel}
              onClick={(e) => void handleToggleDefault(e, entry, isDefault)}
            />
            {!isActive && (
              <ActionIcon
                aria-label={t('workingDirectory.removeRecent')}
                icon={XIcon}
                size={{ blockSize: 28, borderRadius: 6, size: 12 }}
                title={t('workingDirectory.removeRecent')}
                onClick={(e) => handleRemoveRecent(e, entry)}
              />
            )}
          </div>
          {isActive && (
            <span className="anticon flex-none text-success-text" role="img">
              <CheckIcon fill={'transparent'} height={16} size={16} width={16} />
            </span>
          )}
        </div>
      </div>
    );
  };

  const content = (
    <div className="flex w-80 max-w-[calc(100vw-48px)] flex-col gap-1">
      {showSearch && (
        <div className={styles.searchBar}>
          <div className="flex flex-row items-center gap-1.5 px-1.5">
            <span className="flex items-center">
              <span className="anticon" role="img">
                <SearchIcon fill={'transparent'} height={14} size={14} width={14} />
              </span>
            </span>
            <Input
              autoFocus
              placeholder={t('workingDirectory.searchPlaceholder')}
              value={search}
              visualSize="compact"
              className={
                'border-0 px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0'
              }
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="flex flex-row items-center justify-between">
        <div className={styles.sectionTitle}>{t('workingDirectory.recent')}</div>
        {hasClearableSelection && (
          <Button
            className={styles.clearText}
            size="sm"
            variant="ghost"
            onClick={() => void clear().then(() => setOpen(false))}
          >
            {t('workingDirectory.clear')}
          </Button>
        )}
      </div>
      <div className={styles.scrollContainer}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-3 px-2 text-sm leading-5.5 text-foreground-description">
            {search.trim() ? t('workingDirectory.noMatch') : t('workingDirectory.noRecent')}
          </div>
        ) : (
          filtered.map(renderRow)
        )}
      </div>

      {isLocalDevice ? (
        <ChooseLocalFolderRow defaultPath={selectedDir} onPick={pick} />
      ) : (
        <AddRemoteFolderRow
          defaultCwd={deviceDefaultCwd}
          deviceId={targetDeviceId}
          onBeforeOpen={() => setOpen(false)}
          onPick={pick}
        />
      )}
    </div>
  );

  const displayName = selectedDir
    ? (getWorkingDirectoryName(selectedDir) ?? selectedDir)
    : t('workingDirectory.title');

  const trigger = (
    <div className={cn(styles.button, open && styles.buttonOpen)}>
      {selectedDir ? (
        <DirIcon repoType={recents.find((r) => r.path === selectedDir)?.repoType} />
      ) : (
        <span className="anticon" role="img">
          <FolderIcon fill={'transparent'} height={14} size={14} width={14} />
        </span>
      )}
      <span data-workspace-label className={styles.buttonLabel}>
        {displayName}
      </span>
      <span className="anticon" role="img">
        <ChevronDownIcon fill={'transparent'} height={12} size={12} width={12} />
      </span>
    </div>
  );

  return (
    <Popover open={open && !isLocked} onOpenChange={setOpen}>
      <PopoverTrigger disabled={isLocked}>
        {open ? (
          trigger
        ) : (
          <SimpleTooltip
            title={
              isLocked
                ? t('workingDirectory.runningLocked')
                : selectedDir || t('workingDirectory.title')
            }
          >
            {trigger}
          </SimpleTooltip>
        )}
      </PopoverTrigger>
      <PopoverContent align={'start'} className={'w-auto p-1'} side={'bottom'}>
        {content}
      </PopoverContent>
    </Popover>
  );
});

WorkingDirectoryPicker.displayName = 'WorkingDirectoryPicker';

export default WorkingDirectoryPicker;
