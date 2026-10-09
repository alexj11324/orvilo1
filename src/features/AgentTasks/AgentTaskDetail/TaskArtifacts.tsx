import type { TaskDetailWorkspaceNode } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { cn } from 'cn';
import { FileLock2Icon, FileTextIcon, MoreHorizontal, Package, Trash } from 'lucide-react';
import { createElement, memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import { Badge as Tag } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { openDocumentModal } from '@/features/DocumentModal/loader';
import Time from '@/features/Home/components/Time';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import AccordionArrowIcon from '../shared/AccordionArrowIcon';
import { PRESSABLE_FOCUS_CLASS, pressableProps } from '../shared/pressableProps';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

const flattenWorkspace = (nodes: TaskDetailWorkspaceNode[]): TaskDetailWorkspaceNode[] =>
  nodes.flatMap((node) => [
    node,
    ...(node.children?.length ? flattenWorkspace(node.children) : []),
  ]);

const ArtifactCard = memo<{ node: TaskDetailWorkspaceNode }>(({ node }) => {
  const { t } = useTranslation('chat');
  const unpinDocument = useTaskStore((s) => s.unpinDocument);
  const activeTaskId = useTaskDetailTaskId();
  // Tombstone: the viewer lost access to the pinned document (switched back
  // to private by its owner). The server strips title/metadata; clicking
  // through still works — the document preview renders its own 404 terminal.
  const inaccessible = !!node.inaccessible;
  const title = inaccessible
    ? t('taskDetail.artifactInaccessible')
    : node.title || t('taskDetail.untitled');
  const sizeLabel =
    node.size == null ? undefined : t('taskDetail.artifactSize', { value: node.size });

  const handleDelete = useCallback(() => {
    const taskId = node.sourceTaskId ?? activeTaskId;
    if (!taskId) return;
    confirmModal({
      content: t('taskDetail.artifactMenu.deleteConfirm.content'),
      okButtonProps: { danger: true },
      okText: t('taskDetail.artifactMenu.deleteConfirm.ok'),
      onOk: () => unpinDocument(taskId, node.documentId),
      title: t('taskDetail.artifactMenu.deleteConfirm.title'),
    });
  }, [activeTaskId, node.documentId, node.sourceTaskId, t, unpinDocument]);

  const menuItems = useMemo(
    () => [
      {
        danger: true,
        icon: <Trash />,
        key: 'delete',
        label: t('taskDetail.artifactMenu.delete'),
        onClick: handleDelete,
      },
    ],
    [handleDelete, t],
  );

  return (
    // The document-opening button and the menu trigger are siblings: a button
    // must not contain another interactive control.
    <div
      className="flex items-center gap-1 pr-2"
      style={{ border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG }}
    >
      <Button
        className="h-auto min-w-0 flex-1 justify-start gap-2.5 rounded-[inherit] py-2 pr-1 pl-3 text-left font-normal"
        variant="ghost"
        onClick={() => void openDocumentModal(node.documentId)}
      >
        {createElement(inaccessible ? FileLock2Icon : FileTextIcon, {
          color: cssVar.colorTextSecondary,
          size: 18,
          strokeWidth: 1.5,
          style: { flexShrink: 0 },
        })}
        <span
          className={cn('truncate', 'block', inaccessible ? 'text-muted-foreground' : undefined)}
          style={{ flex: 1, minWidth: 0 }}
        >
          {title}
        </span>
        {sizeLabel && (
          <span className="text-[12px] text-muted-foreground" style={{ flexShrink: 0 }}>
            {sizeLabel}
          </span>
        )}
        {node.sourceTaskIdentifier && (
          <Tag size="sm" style={{ flexShrink: 0 }}>
            {node.sourceTaskIdentifier}
          </Tag>
        )}
        {/* Which run produced this — the plan's "trace an artifact back to the
          specific run". Information only: linking into the conversation needs the
          run's agent id, which the projection does not carry yet. */}
        {node.sourceTopicTitle && (
          <Tag size="sm" style={{ flexShrink: 0 }} title={node.sourceTopicTitle}>
            {node.sourceTopicTitle}
          </Tag>
        )}
        {node.createdAt && <Time date={node.createdAt} />}
      </Button>
      <SidebarDropdownMenu items={menuItems}>
        <ActionIcon aria-label={t('more', { ns: 'common' })} icon={MoreHorizontal} size="small" />
      </SidebarDropdownMenu>
    </div>
  );
});

const TaskArtifacts = memo(() => {
  const { t } = useTranslation('chat');
  const workspace = useTaskDetailSelector(taskDetailSelectors.taskWorkspace);
  const [isExpanded, setIsExpanded] = useState(true);

  const items = useMemo(
    () =>
      [...flattenWorkspace(workspace)].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }),
    [workspace],
  );

  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div
          aria-expanded={isExpanded}
          className={cn('flex items-center gap-2 px-2 py-1', PRESSABLE_FOCUS_CLASS)}
          style={{ cursor: 'pointer', width: 'fit-content' }}
          {...pressableProps(() => setIsExpanded((prev) => !prev))}
        >
          <Package color={cssVar.colorTextDescription} size={16} />
          <div className="text-[13px] font-medium" style={{ color: cssVar.colorTextSecondary }}>
            {t('taskDetail.artifacts')}
          </div>
          <Tag size="sm">{items.length}</Tag>
          <AccordionArrowIcon isOpen={isExpanded} style={{ color: cssVar.colorTextDescription }} />
        </div>
      </div>
      {isExpanded && (
        <div className="flex flex-col gap-2 px-3">
          {items.map((node) => (
            <ArtifactCard key={node.documentId} node={node} />
          ))}
        </div>
      )}
    </div>
  );
});

export default TaskArtifacts;
