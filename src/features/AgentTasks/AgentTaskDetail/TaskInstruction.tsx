import { useEditor } from '@lobehub/editor/react';
import { Paperclip } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthorInfo } from '@/business/client/hooks/useAuthorInfo';
import ActionIcon from '@/components/ActionIcon';
import CollapsibleContent from '@/components/CollapsibleContent';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EditingIndicator, type EditLockClient, useEditLock } from '@/features/EditLock';
import { EditorCanvas } from '@/features/EditorCanvas';
import { seedAttachments } from '@/features/EditorCanvas/attachmentRegistry';
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import { taskInstructionStyles } from './taskInstructionStyles';
import { useAttachInstructionFiles } from './useAttachInstructionFiles';
import { useTaskInstructionAutosave } from './useTaskInstructionAutosave';

// Stable lock RPC binding for the task resource.
const taskLockClient: EditLockClient = {
  acquire: (id) => lambdaClient.task.acquireTaskLock.mutate({ id }),
  peek: (id) => lambdaClient.task.getTaskLock.query({ id }),
  release: async (id) => {
    await lambdaClient.task.releaseTaskLock.mutate({ id });
  },
};

// Roomier than the chat-bubble default: the instruction is the primary content
// of the page, so the preview should carry a paragraph or two before it clamps.
const INSTRUCTION_MAX_HEIGHT = 320;

const TaskInstruction = memo(() => {
  const { t } = useTranslation('chat');
  const { allowed: canEditTask, reason: permissionReason } = usePermission('create_content');
  const instruction = useTaskDetailSelector(taskDetailSelectors.taskInstruction);
  const instructionRevision = useTaskDetailSelector(taskDetailSelectors.taskInstructionRevision);
  const persistedEditorData = useTaskDetailSelector(taskDetailSelectors.taskEditorData);
  const taskId = useTaskDetailTaskId();
  const taskWorkspaceId = useTaskDetailSelector(taskDetailSelectors.taskWorkspaceId);
  const persistedFiles = useTaskDetailSelector(taskDetailSelectors.taskFiles);
  const updateTask = useTaskStore((s) => s.updateTask);
  const editor = useEditor();

  // Collaborative edit lock for workspace tasks (same model as pages): read-only
  // when another member is editing; acquired implicitly on the first edit.
  const [edited, setEdited] = useState(false);
  // A long instruction opens clamped so the properties, subtasks and activity
  // below it stay reachable; a short one never collapses and stays directly
  // editable. Both reset per task — the next task gets its own first read.
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const taskIdRef = useRef(taskId);
  if (taskIdRef.current !== taskId) {
    taskIdRef.current = taskId;
    setEdited(false);
    setExpanded(false);
  }
  const lock = useEditLock({
    client: taskLockClient,
    // Only workspace tasks lock — personal (non-workspace) tasks stay fully
    // editable with no peek/pending, matching the server's workspace gating.
    enabled: Boolean(taskId && canEditTask && taskWorkspaceId),
    isDirty: edited,
    resourceId: taskId ?? undefined,
  });
  // Read-only until the lock resolves, so the user can't start typing on a task
  // that turns out to be locked and get bounced mid-edit.
  const editable = canEditTask && !lock.lockedByOther && !lock.pending;
  const lockHolder = useAuthorInfo(lock.lockedByOther ? (lock.holderId ?? undefined) : undefined);

  // The attach affordance shares the same edit capability as the editor body:
  // read-only, locked, or unresolved states never open the picker.
  const attachBlockedReason = !canEditTask
    ? (permissionReason ?? t('taskDetail.attachmentsReadOnly'))
    : lock.pending
      ? t('pageEditor.editMode.checking', { ns: 'file' })
      : lock.lockedByOther
        ? lockHolder?.fullName
          ? t('pageEditor.editMode.lockedByOther', { name: lockHolder.fullName, ns: 'file' })
          : t('pageEditor.editMode.lockedBySomeone', { ns: 'file' })
        : undefined;

  const editorData = useMemo(
    () => ({
      content: instruction ?? '',
      editorData: persistedEditorData,
    }),
    [instruction, persistedEditorData],
  );

  useEffect(() => {
    if (persistedFiles && persistedFiles.length > 0) {
      seedAttachments(
        persistedFiles.map((f) => ({ downloadUrl: f.downloadUrl, id: f.id, url: f.url })),
      );
    }
  }, [persistedFiles]);

  const handleEdit = useCallback(() => setEdited(true), []);
  const handleContentChange = useTaskInstructionAutosave({
    contentRevision: instructionRevision,
    editable,
    editor,
    onEdit: handleEdit,
    taskId,
    updateTask,
  });

  const handleAttach = useAttachInstructionFiles({ editable, editor, taskId: taskId ?? null });

  // Clicking into the clamped text focuses the editor, so expanding on focus
  // makes one click both open the instruction and land the caret where it was
  // aimed — no "expand, then click again to type".
  const handleFocus = useCallback(() => setExpanded(true), []);

  const handleCollapsedChange = useCallback(
    (collapsed: boolean) => {
      // Collapsing while the editor still holds the caret would let Lexical
      // restore focus and immediately re-expand.
      if (collapsed) editor?.blur();
      setExpanded(!collapsed);
    },
    [editor],
  );

  // Attaching a file only makes sense once the whole instruction is in view;
  // while clamped, the collapse toggle is the single affordance below the text.
  const showAttach = !overflowing || expanded;

  return (
    <div className="flex flex-col gap-1">
      <EditingIndicator
        holderId={lock.lockedByOther ? lock.holderId : null}
        pending={canEditTask && lock.pending}
      />
      {/* editTask can update this mounted editor. The store revision changes only for external
          snapshots, so local autosave echoes and unchanged polling snapshots do not reload live
          input. Collapsing is pure CSS around the same mounted editor — never a remount, which
          would drop unsaved input. */}
      <CollapsibleContent
        collapsed={!expanded}
        maxHeight={INSTRUCTION_MAX_HEIGHT}
        onCollapsedChange={handleCollapsedChange}
        onOverflowChange={setOverflowing}
      >
        <div className={taskInstructionStyles.content} onFocus={handleFocus}>
          <EditorCanvas
            contentRevision={instructionRevision}
            // Linear's issue body runs 15px at a slightly darker weight than
            // the editor's 16/400 default — the description reads as prose,
            // not as a comment.
            contentStyle={{ fontSize: 15, fontWeight: 450 }}
            disabled={!canEditTask}
            editable={!lock.lockedByOther && !lock.pending}
            editor={editor}
            editorData={editorData}
            entityId={taskId}
            placeholder={t('taskDetail.instructionPlaceholder')}
            onContentChange={handleContentChange}
          />
        </div>
      </CollapsibleContent>
      {showAttach && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                // The wrapper span keeps the tooltip reachable — a disabled
                // button swallows pointer events, so the reason would never
                // surface.
                <span className="inline-flex">
                  <ActionIcon
                    aria-label={t('upload.action.tooltip')}
                    disabled={!editable}
                    icon={Paperclip}
                    size={'small'}
                    onClick={handleAttach}
                  />
                </span>
              }
            />
            <TooltipContent>
              {editable ? t('upload.action.tooltip') : attachBlockedReason}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});

export default TaskInstruction;
