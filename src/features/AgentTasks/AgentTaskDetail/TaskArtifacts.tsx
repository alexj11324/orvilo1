import { ActionIcon, confirmModal, Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskDetailWorkspaceNode } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { FileLock2Icon, FileTextIcon, MoreHorizontal, Package, Trash } from 'lucide-react';
import { createElement, memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { openDocumentModal } from '@/features/DocumentModal/loader';
import Time from '@/features/Home/components/Time';
import SidebarDropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import AccordionArrowIcon from '../shared/AccordionArrowIcon';
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
    <div
      className="flex items-center gap-2.5 px-3 py-2"
      style={{
        border: `1px solid ${cssVar.colorBorder}`,
        borderRadius: cssVar.borderRadiusLG,
        cursor: 'pointer',
      }}
      onClick={() => void openDocumentModal(node.documentId)}
    >
      {createElement(inaccessible ? FileLock2Icon : FileTextIcon, {
        color: cssVar.colorTextSecondary,
        size: 18,
        strokeWidth: 1.5,
        style: { flexShrink: 0 },
      })}
      <Text ellipsis style={{ flex: 1, minWidth: 0 }} type={inaccessible ? 'secondary' : undefined}>
        {title}
      </Text>
      {sizeLabel && (
        <Text fontSize={12} style={{ flexShrink: 0 }} type="secondary">
          {sizeLabel}
        </Text>
      )}
      {node.sourceTaskIdentifier && (
        <Tag size="small" style={{ flexShrink: 0 }}>
          {node.sourceTaskIdentifier}
        </Tag>
      )}
      {/* Which run produced this — the plan's "trace an artifact back to the
          specific run". Information only: linking into the conversation needs the
          run's agent id, which the projection does not carry yet. */}
      {node.sourceTopicTitle && (
        <Tag size="small" style={{ flexShrink: 0 }} title={node.sourceTopicTitle}>
          {node.sourceTopicTitle}
        </Tag>
      )}
      {node.createdAt && <Time date={node.createdAt} />}
      <SidebarDropdownMenu items={menuItems}>
        <ActionIcon
          icon={MoreHorizontal}
          size="small"
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
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
          className="flex items-center gap-2 px-2 py-1"
          style={{ cursor: 'pointer', width: 'fit-content' }}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <Package color={cssVar.colorTextDescription} size={16} />
          <Text color={cssVar.colorTextSecondary} fontSize={13} weight={500}>
            {t('taskDetail.artifacts')}
          </Text>
          <Tag size="small">{items.length}</Tag>
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
