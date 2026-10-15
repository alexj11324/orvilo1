'use client';

import type { ProjectFileIndexEntry } from '@orvilo/electron-client-ipc';
import { cn } from 'cn';
import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';

import FileIcon from '@/components/FileIcon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjectFiles } from '@/features/Conversation/WorkingSidebar/Files/useProjectFiles';
import { useChatStore } from '@/store/chat';

import {
  type BreadcrumbSegment,
  groupChildrenByParent,
  toBreadcrumbSegments,
} from './filePathBreadcrumb';

const styles = {
  crumb:
    'inline-flex items-center overflow-hidden min-w-0 h-8 rounded-(--radius-button) border-0 bg-transparent px-1 py-0 text-foreground-tertiary [font-family:inherit] [font-size:inherit] text-ellipsis whitespace-nowrap',
  crumbInteractive:
    'cursor-pointer hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  crumbStatic: 'cursor-default hover:bg-transparent hover:text-foreground-tertiary',
  // The previewed file is the last crumb to give up width.
  group: 'overflow-hidden min-w-0 shrink',
  groupLast: 'shrink-0 [&_span]:text-foreground',
  separator: 'flex flex-none items-center text-foreground-quaternary',
};

interface CrumbMenuItem {
  children?: CrumbMenuItem[];
  icon?: ReactNode;
  key: string;
  label: ReactNode;
  onClick?: () => void;
  openOnHover?: boolean;
  type?: 'submenu';
}

const renderMenuItem = (item: CrumbMenuItem) => {
  const label = (
    <span className="flex flex-1 flex-row items-center gap-1.5">
      {item.icon}
      {item.label}
    </span>
  );

  if (item.type === 'submenu')
    return (
      <DropdownMenuSub key={item.key}>
        <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>{item.children?.map(renderMenuItem)}</DropdownMenuSubContent>
      </DropdownMenuSub>
    );

  return (
    <DropdownMenuItem key={item.key} onClick={item.onClick}>
      {label}
    </DropdownMenuItem>
  );
};

interface BuildMenuParams {
  byParent: Map<string, ProjectFileIndexEntry[]>;
  deviceId?: string;
  openFile: (filePath: string) => void;
  parentRelativePath: string;
}

/**
 * The contents of one folder as menu items: files open the preview, folders
 * become submenus of their own contents, so the breadcrumb walks the tree the
 * way a desktop editor's does.
 *
 * A folder with nothing indexed under it is left out rather than rendered as an
 * empty submenu — there would be nothing to pick.
 */
const buildFolderItems = ({
  byParent,
  deviceId,
  openFile,
  parentRelativePath,
}: BuildMenuParams): CrumbMenuItem[] => {
  const children = byParent.get(parentRelativePath) ?? [];

  return children.flatMap((child): CrumbMenuItem[] => {
    const relativePath = child.relativePath.replace(/\/$/, '');
    const icon = (
      <FileIcon fileName={child.name} isDirectory={child.isDirectory} size={16} variant={'raw'} />
    );

    if (!child.isDirectory) {
      return [{ icon, key: child.path, label: child.name, onClick: () => openFile(child.path) }];
    }

    const grandChildren = buildFolderItems({
      byParent,
      deviceId,
      openFile,
      parentRelativePath: relativePath,
    });
    if (grandChildren.length === 0) return [];

    return [
      {
        children: grandChildren,
        icon,
        key: child.path,
        label: child.name,
        openOnHover: true,
        type: 'submenu',
      },
    ];
  });
};

/**
 * One level of the path. A level backed by the project index opens a menu of
 * that folder's contents, so the breadcrumb doubles as a file switcher.
 */
const Crumb = memo<{
  byParent?: Map<string, ProjectFileIndexEntry[]>;
  deviceId?: string;
  isLast: boolean;
  rootPath?: string;
  segment: BreadcrumbSegment;
}>(({ byParent, deviceId, isLast, rootPath, segment }) => {
  const openLocalFile = useChatStore((s) => s.openLocalFile);

  const ownFolder = useMemo(() => {
    if (segment.relativePath === undefined) return;
    // The last crumb is the previewed file, so its menu lists its siblings.
    return isLast ? segment.relativePath.split('/').slice(0, -1).join('/') : segment.relativePath;
  }, [isLast, segment.relativePath]);

  const items = useMemo(() => {
    if (!byParent || !rootPath || ownFolder === undefined) return [];

    return buildFolderItems({
      byParent,
      deviceId,
      openFile: (filePath) => openLocalFile({ deviceId, filePath, workingDirectory: rootPath }),
      parentRelativePath: ownFolder,
    });
  }, [byParent, deviceId, openLocalFile, ownFolder, rootPath]);

  // A folder on the path holds at least the open file, so an empty result means
  // the index does not reach here — a project past the walk's cap.
  const canBrowse = items.length > 0;

  if (!canBrowse) {
    return <span className={cn(styles.crumb, styles.crumbStatic)}>{segment.name}</span>;
  }

  // Public Menu.Trigger defaults to nativeButton=true and merges the native
  // button's focus/keyboard props; an indexed folder keeps that contract.
  const crumb = (
    <Button
      size="compact"
      type="button"
      variant="ghost"
      className={cn(
        'justify-start font-normal leading-[inherit]',
        styles.crumb,
        styles.crumbInteractive,
      )}
    >
      {segment.name}
    </Button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={crumb} />
      <DropdownMenuContent align={'start'} className={'w-auto'} side={'bottom'}>
        {items.map(renderMenuItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

Crumb.displayName = 'Crumb';

interface PathBreadcrumbProps {
  deviceId?: string;
  path: string;
  rootPath?: string;
}

const PathBreadcrumb = memo<PathBreadcrumbProps>(({ deviceId, path, rootPath }) => {
  const { data } = useProjectFiles(deviceId, rootPath);
  const segments = useMemo(() => toBreadcrumbSegments(path, rootPath), [path, rootPath]);
  const byParent = useMemo(
    () => (data?.entries ? groupChildrenByParent(data.entries) : undefined),
    [data?.entries],
  );

  return (
    <>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;

        return (
          <div
            key={segment.path}
            className={cn(
              'flex flex-row items-center',
              cn(styles.group, isLast && styles.groupLast),
            )}
          >
            {index > 0 && (
              <span aria-hidden className={styles.separator}>
                <span className="inline-flex" role="img">
                  <ChevronRightIcon fill={'transparent'} height={16} size={16} width={16} />
                </span>
              </span>
            )}
            <Crumb
              byParent={byParent}
              deviceId={deviceId}
              isLast={isLast}
              rootPath={rootPath}
              segment={segment}
            />
          </div>
        );
      })}
    </>
  );
});

PathBreadcrumb.displayName = 'PathBreadcrumb';

export default PathBreadcrumb;
