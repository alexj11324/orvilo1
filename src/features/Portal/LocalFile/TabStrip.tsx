'use client';

import { SkillsIcon } from '@lobehub/ui/icons';
import { isDesktop } from '@orvilo/const';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { confirmModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { localFileService } from '@/services/electron/localFileService';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { getLocalFileTabId } from '@/store/chat/slices/portal/helpers';

interface TabContextMenuItem {
  disabled?: boolean;
  key?: string;
  label?: string;
  onClick?: () => void;
  type?: 'divider';
}

const SKILL_PATH_RE = /\/\.(?:agents|claude)\/skills\/([^/]+)\/SKILL\.md$/;

const resolveSkillName = (filePath: string): string | null => {
  const match = filePath.match(SKILL_PATH_RE);
  return match ? match[1] : null;
};

const styles = {
  tabIcon: 'inline-flex shrink-0 items-center justify-center size-3.5',
  tabClose:
    'group/tab-close cursor-pointer p-0 text-inherit opacity-60 hover:bg-selected hover:opacity-100',
  tabItem:
    'cursor-pointer select-none flex shrink-0 items-center gap-1 max-w-40 rounded-(--radius-button) px-2 py-1 text-xs leading-5 text-muted-foreground transition-[color,background-color] duration-150 hover:text-foreground',
  tabItemActive: 'bg-selected text-foreground hover:bg-selected',
  tabLabel: 'overflow-hidden flex-1 min-w-0 text-ellipsis whitespace-nowrap',
};

const TabStrip = memo(() => {
  const { t } = useTranslation('chat');
  const openLocalFiles = useChatStore(chatPortalSelectors.openLocalFiles);
  const activeLocalFileId = useChatStore(chatPortalSelectors.activeLocalFileId);
  const dirtyContents = useChatStore(chatPortalSelectors.dirtyLocalFileContents);
  const setActiveLocalFile = useChatStore((s) => s.setActiveLocalFile);
  const closeLocalFileTab = useChatStore((s) => s.closeLocalFileTab);
  const closeLeftLocalFileTabs = useChatStore((s) => s.closeLeftLocalFileTabs);
  const closeOtherLocalFileTabs = useChatStore((s) => s.closeOtherLocalFileTabs);
  const closeRightLocalFileTabs = useChatStore((s) => s.closeRightLocalFileTabs);

  const confirmClose = useCallback(
    (id: string, filePath: string, perform: () => void) => {
      // Edit buffers are keyed by tab identity, not bare file path.
      if (!(id in dirtyContents)) {
        perform();
        return;
      }
      const filename = filePath.split('/').at(-1) ?? filePath;
      confirmModal({
        cancelText: t('cancel', { defaultValue: 'Cancel' }),
        content: t('workingPanel.localFile.closeDirty.content', {
          defaultValue: `${filename} has unsaved changes. Close without saving?`,
          filename,
        }),
        okButtonProps: { danger: true },
        okText: t('workingPanel.localFile.closeDirty.confirm', {
          defaultValue: 'Close without saving',
        }),
        onOk: perform,
        title: t('workingPanel.localFile.closeDirty.title', {
          defaultValue: 'Unsaved changes',
        }),
      });
    },
    [dirtyContents, t],
  );

  const getContextMenuItems = useCallback(
    (id: string, filePath: string, index: number): TabContextMenuItem[] => [
      {
        disabled: index === 0,
        key: 'closeLeft',
        label: t('workingPanel.localFile.closeLeft'),
        onClick: () => closeLeftLocalFileTabs(id),
      },
      {
        disabled: index === openLocalFiles.length - 1,
        key: 'closeRight',
        label: t('workingPanel.localFile.closeRight'),
        onClick: () => closeRightLocalFileTabs(id),
      },
      {
        disabled: openLocalFiles.length <= 1,
        key: 'closeOther',
        label: t('workingPanel.localFile.closeOther'),
        onClick: () => closeOtherLocalFileTabs(id),
      },
      // Sandbox-backed tabs point at paths inside the cloud sandbox — a local
      // "show in system" would open an unrelated folder or fail.
      ...(isDesktop &&
      !openLocalFiles.find((file) => getLocalFileTabId(file) === id)?.sandboxTopicId
        ? [
            {
              key: 'showInSystem',
              label: t('workingPanel.files.showInSystem'),
              onClick: () => void localFileService.openFileFolder(filePath),
            },
          ]
        : []),
      { type: 'divider' },
      {
        key: 'close',
        label: t('workingPanel.localFile.close'),
        onClick: () => {
          const filePath =
            openLocalFiles.find((file) => getLocalFileTabId(file) === id)?.filePath ?? id;
          confirmClose(id, filePath, () => closeLocalFileTab(id));
        },
      },
    ],
    [
      closeLeftLocalFileTabs,
      closeLocalFileTab,
      closeOtherLocalFileTabs,
      closeRightLocalFileTabs,
      confirmClose,
      openLocalFiles,
      t,
    ],
  );

  if (openLocalFiles.length === 0) return null;

  return (
    <ScrollArea className="flex-1 min-w-0 rounded-none bg-transparent">
      <div className="flex w-max flex-row items-center gap-1 py-2 ps-2">
        {openLocalFiles.map((file, index) => {
          const { filePath } = file;
          const id = getLocalFileTabId(file);
          const filename = filePath.split('/').at(-1) ?? filePath;
          const skillName = resolveSkillName(filePath);
          const label = skillName ?? filename;
          const isActive = id === activeLocalFileId;

          return (
            <ContextMenu key={id}>
              <ContextMenuTrigger
                render={
                  <div
                    aria-selected={isActive}
                    className={cn(styles.tabItem, isActive && styles.tabItemActive)}
                    role="tab"
                    tabIndex={0}
                    title={filePath}
                    onClick={() => setActiveLocalFile(id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveLocalFile(id);
                      }
                    }}
                  >
                    {skillName ? (
                      <span className={styles.tabIcon} role="img">
                        <SkillsIcon fill={'transparent'} height={12} size={12} width={12} />
                      </span>
                    ) : (
                      <span className={styles.tabIcon}>
                        <FileIcon fileName={filename} size={14} variant={'raw'} />
                      </span>
                    )}
                    <span className={styles.tabLabel}>{label}</span>
                    <Button
                      aria-label={`Close ${filename}`}
                      className={styles.tabClose}
                      data-dirty={id in dirtyContents ? 'true' : 'false'}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmClose(id, filePath, () => closeLocalFileTab(id));
                      }}
                    >
                      <span className="cm-tab-close-x inline-flex group-data-[dirty=true]/tab-close:hidden group-data-[dirty=true]/tab-close:group-hover/tab-close:inline-flex">
                        <XIcon size={12} />
                      </span>
                      <span className="cm-tab-close-dot hidden size-2 rounded-full bg-primary group-data-[dirty=true]/tab-close:inline-block group-data-[dirty=true]/tab-close:group-hover/tab-close:hidden" />
                    </Button>
                  </div>
                }
              />
              <ContextMenuContent>
                {getContextMenuItems(id, filePath, index).map((item) =>
                  item.type === 'divider' ? (
                    <ContextMenuSeparator key={item.key ?? 'divider'} />
                  ) : (
                    <ContextMenuItem disabled={item.disabled} key={item.key} onClick={item.onClick}>
                      {item.label}
                    </ContextMenuItem>
                  ),
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </ScrollArea>
  );
});

TabStrip.displayName = 'LocalFileTabStrip';

export default TabStrip;
