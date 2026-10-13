'use client';

import { clsx as cx, cn } from 'cn';
import { ChevronsUpDownIcon } from 'lucide-react';
import type { DragEvent } from 'react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import BusinessKnowledgeBaseImportAction from '@/business/client/BusinessKnowledgeBaseImportAction';
import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import { type DropdownItem, DropdownMenu } from '@/components/ItemsMenu';
import LibraryStatusIcon from '@/components/LibIcon/StatusIcon';
import { Skeleton } from '@/components/ui/skeleton';
import { useDragActive } from '@/features/ResourceManager/DndContextWrapper';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { knowledgeBaseSelectors, useKnowledgeBaseStore } from '@/store/library';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import nativeStyles from './LibraryHead.module.css';
import type { LibraryMenuEntry } from './libraryMenuItems';
import { buildLibraryMenuItems } from './libraryMenuItems';

const styles = {
  dropZoneActive: nativeStyles.dropZoneActive,
  menuIcon: 'text-foreground-tertiary',
};

/**
 * Quickly switch between libraries
 */
const Head = memo<{ id: string }>(({ id }) => {
  const { t } = useTranslation('common');
  const navigate = useWorkspaceAwareNavigate();
  const activeWorkspaceId = useActiveWorkspaceId();
  const name = useKnowledgeBaseStore(knowledgeBaseSelectors.getKnowledgeBaseNameById(id));
  const [setMode, setLibraryId] = useResourceManagerStore((s) => [s.setMode, s.setLibraryId]);
  const isDragActive = useDragActive();
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);

  const useFetchKnowledgeBaseList = useKnowledgeBaseStore((s) => s.useFetchKnowledgeBaseList);
  const { data: libraries } = useFetchKnowledgeBaseList();
  const activeLibrary = libraries?.find((library) => library.id === id) as
    (NonNullable<typeof libraries>[number] & { memberRestricted?: boolean }) | undefined;

  const handleClick = useCallback(() => {
    navigate(`/resource/library/${id}`);
    setMode('explorer');
  }, [id, navigate, setMode]);

  const handleLibrarySwitch = useCallback(
    (libraryId: string) => {
      setLibraryId(libraryId);
      setMode('explorer');
      // Use setTimeout to ensure navigate is called in the next event loop
      setTimeout(() => {
        navigate(`/resource/library/${libraryId}`);
      }, 0);
    },
    [navigate, setLibraryId, setMode],
  );

  // Native HTML5 drag-and-drop handlers for root directory drop
  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!isDragActive) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDropZoneActive(true);
    },
    [isDragActive],
  );

  const handleDragLeave = useCallback(() => {
    setIsDropZoneActive(false);
  }, []);

  const handleDrop = useCallback(() => {
    setIsDropZoneActive(false);
  }, []);

  const menuItems = useMemo<DropdownItem[]>(() => {
    if (!libraries) return [];

    const entries = libraries.map((library): LibraryMenuEntry => ({
      item: {
        icon: (
          <div
            className={cx('flex min-w-4 flex-col items-center justify-center w-4', styles.menuIcon)}
          >
            <LibraryStatusIcon
              size={16}
              visibility={library.visibility}
              memberRestricted={
                (library as typeof library & { memberRestricted?: boolean }).memberRestricted
              }
            />
          </div>
        ),
        key: library.id,
        label: library.name,
        onClick: () => handleLibrarySwitch(library.id),
        className: library.id === id ? 'bg-selected' : undefined,
      },
      visibility: library.visibility,
    }));

    return buildLibraryMenuItems(entries, Boolean(activeWorkspaceId), {
      private: t('navPanel.privateAgents'),
      workspace: t('navPanel.publicAgents'),
    });
  }, [activeWorkspaceId, libraries, handleLibrarySwitch, id, t]);

  return (
    <div
      {...clickableProps()}
      data-drop-target-id="root"
      data-is-folder="true"
      data-root-drop="true"
      className={cn(
        cx(
          'flex min-w-8 cursor-pointer flex-row items-center gap-2 overflow-hidden p-0.5',
          isDropZoneActive && styles.dropZoneActive,
        ),
        CLICKABLE_FOCUS_RING,
      )}
      onClick={handleClick}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex min-w-8 flex-col items-center justify-center w-8">
        <LibraryStatusIcon
          color={isDropZoneActive ? 'var(--invert-foreground)' : undefined}
          memberRestricted={activeLibrary?.memberRestricted}
          size={16}
          visibility={activeLibrary?.visibility}
        />
      </div>
      {!name ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <DropdownMenu items={menuItems} placement="bottomRight">
          <div
            className="flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="min-w-0 flex-1 truncate text-sm leading-5.5 font-medium">{name}</div>
            <ActionIcon
              aria-label={t('switch')}
              className={nativeStyles.compactAction}
              icon={ChevronsUpDownIcon}
              size={{
                blockSize: 32,
                borderRadius: 'var(--radius-button)',
                size: 16,
              }}
            />
          </div>
        </DropdownMenu>
      )}
      <BusinessKnowledgeBaseImportAction knowledgeBaseId={id} />
    </div>
  );
});

Head.displayName = 'Head';

export default Head;
