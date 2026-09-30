'use client';

import { useEditor } from '@lobehub/editor/react';
import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { Minimize2, Paperclip, X } from 'lucide-react';
import { type KeyboardEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import { useModalContext } from '@/components/Modal';
import Select from '@/components/Select';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { EditorCanvas } from '@/features/EditorCanvas';
import {
  getAttachmentFileIdsFromEditor,
  pickAndInsertAttachments,
} from '@/features/EditorCanvas/editorAttachments';
import { type TaskCreateDraft } from '@/features/TaskDrafts/taskCreateDrafts';
import { useTaskCreateDraftSync } from '@/features/TaskDrafts/useTaskCreateDraftSync';
import { usePermission } from '@/hooks/usePermission';
import { useGlobalStore } from '@/store/global';
import { useTaskStore } from '@/store/task';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import TaskPriorityTag from '../features/TaskPriorityTag';
import TaskVisibilityChipLabel from '../features/TaskVisibilityChipLabel';
import TaskVisibilityTag from '../features/TaskVisibilityTag';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { useAgentVisibility } from '../shared/useAgentVisibility';
import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';

export interface CreateTaskContentProps {
  agentId?: string;
  /**
   * Continue-editing an issue draft (Drafts page → Edit draft): hydrates
   * title/body/properties once and binds autosave to the draft's id, so edits
   * update it and a successful submit removes it.
   */
  draft?: TaskCreateDraft;
  /**
   * Locks the assignee to `agentId` and hides the agent picker. Used on the
   * agent-scoped task list where every task belongs to that agent.
   */
  lockAssignee?: boolean;
  onCreated?: (task: { agentId?: string; identifier: string; name?: string }) => void;
  projectId?: string;
  /**
   * Whether to show the "minimize to inline entry" button. Only the list view has an
   * inline entry target, so contexts like the Kanban board pass `false` to hide it.
   */
  showInlineToggle?: boolean;
  /** Execution-status preset — per-column board `+` on status-grouped boards. */
  status?: TaskStatus;
  /** Owning team for workspace tasks — create entry points on a team surface
   *  pass it so the issue lands on that team (Linear parity). */
  teamId?: string;
  /**
   * Joined teams the user may file the issue into. Rendered as a picker only
   *  when `teamId` is unset — a cross-team surface asks the one necessary
   *  choice instead of silently picking a team or hiding create entirely.
   */
  teamOptions?: { id: string; name: string }[];
  /** Business-workflow preset — per-column board `+` on work-query boards. */
  workflowCategory?: TaskWorkflowCategory;
}

const CreateTaskContent = memo<CreateTaskContentProps>(
  ({
    agentId,
    draft,
    lockAssignee,
    onCreated,
    projectId,
    showInlineToggle = true,
    status,
    teamId,
    teamOptions,
    workflowCategory,
  }) => {
    const { t } = useTranslation('chat');
    const { close } = useModalContext();
    const { allowed: canCreateTask, reason } = usePermission('create_content');

    const createTask = useTaskStore((s) => s.createTask);
    const isCreating = useTaskStore((s) => s.isCreatingTask);
    const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

    const activeWorkspaceId = useActiveWorkspaceId();

    const [title, setTitle] = useState('');
    const [priority, setPriority] = useState(0);
    const [assigneeAgentId, setAssigneeAgentId] = useState<string | undefined>(agentId);
    const [assigneeUserId, setAssigneeUserId] = useState<string | undefined>();
    // Default to workspace-visible: workspace tasks are team work by default,
    // and going private stays one click away. In personal mode the field is
    // irrelevant and the chip is hidden anyway.
    const [visibility, setVisibility] = useState<'private' | 'public'>('public');
    const [pickedTeamId, setPickedTeamId] = useState<string | undefined>(teamId);
    useEffect(() => setPickedTeamId(teamId), [teamId]);

    const assigneeVisibility = useAgentVisibility(assigneeAgentId);
    const isPrivateAgent = assigneeVisibility === 'private';
    const selfUserId = useUserStore(userProfileSelectors.userId);
    const isOtherMemberAssignee = Boolean(assigneeUserId) && assigneeUserId !== selfUserId;

    // Resolve the two visibility constraints in one place so an old draft or an
    // externally privatized agent cannot make separate effects toggle forever.
    // A private agent is the stronger constraint, so drop an incompatible member.
    useEffect(() => {
      if (isPrivateAgent) {
        if (isOtherMemberAssignee) setAssigneeUserId(undefined);
        if (visibility === 'public') setVisibility('private');
        return;
      }

      if (isOtherMemberAssignee && visibility === 'private') setVisibility('public');
    }, [isOtherMemberAssignee, isPrivateAgent, visibility]);

    const editor = useEditor();
    const instructionRef = useRef('');

    // Issue-draft sync (Drafts page continue-editing): a `draft` prop
    // rehydrates the composer once the editor mounts; either way the composer
    // autosaves so closing with content leaves a draft behind, and a
    // successful submit removes it.
    const applyDraft = useCallback(
      (next: TaskCreateDraft, markdown: string) => {
        setTitle(next.title);
        setPriority(next.priority);
        if (!lockAssignee) setAssigneeAgentId(next.assigneeAgentId);
        setAssigneeUserId(next.assigneeUserId);
        if (next.visibility) setVisibility(next.visibility);
        if (next.teamId) setPickedTeamId(next.teamId);
        instructionRef.current = markdown;
      },
      [lockAssignee],
    );
    const { markSubmitted: markDraftSubmitted, schedule: scheduleDraftPersist } =
      useTaskCreateDraftSync({
        applyDraft,
        draft,
        editor,
        enabled: canCreateTask,
        fields: {
          assigneeAgentId,
          assigneeUserId,
          priority,
          projectId,
          teamId: pickedTeamId,
          title,
          visibility,
        },
        workspaceId: activeWorkspaceId,
      });

    const assigneeMeta = useAgentDisplayMeta(assigneeAgentId);
    const memberMeta = useUserDisplayMeta(assigneeUserId);

    const handleAgentChange = useCallback((nextAgentId: string | null) => {
      setAssigneeAgentId(nextAgentId ?? undefined);
    }, []);
    const handleMemberChange = useCallback((nextUserId: string | null) => {
      setAssigneeUserId(nextUserId ?? undefined);
    }, []);

    const handleInline = useCallback(() => {
      // Minimize hands the in-progress text to the inline entry's scope draft
      // (same `orvilo:task-create-draft:*` convention as CreateTaskInlineEntry)
      // instead of parking it on the Drafts page — the user is still actively
      // composing, and an extra modal draft would go stale after inline submit.
      // Attachments can't ride the markdown-only inline format, and a failed
      // write means no handoff either — in both cases the modal's own autosave
      // keeps the draft on the Drafts page instead of losing content.
      const markdown = String(editor?.getDocument?.('markdown') ?? '');
      const hasFiles = getAttachmentFileIdsFromEditor(editor).length > 0;
      const handoff = [title.trim(), markdown.trim()].filter(Boolean).join('\n\n');
      let handedOff = false;
      if (handoff && !hasFiles) {
        try {
          localStorage.setItem(
            `orvilo:task-create-draft:${activeWorkspaceId ?? 'personal'}:${projectId ?? agentId ?? 'all'}`,
            JSON.stringify({
              assigneeAgentId: lockAssignee ? undefined : assigneeAgentId,
              assigneeUserId,
              markdown: handoff,
              priority,
              visibility,
            }),
          );
          handedOff = true;
        } catch {
          /* storage unavailable — fall through to the modal draft */
        }
      }
      if (handedOff || (!handoff && !hasFiles)) markDraftSubmitted();
      updateSystemStatus({ taskCreateInlineCollapsed: false }, 'expandTaskCreateInline');
      close();
    }, [
      activeWorkspaceId,
      agentId,
      assigneeAgentId,
      assigneeUserId,
      close,
      editor,
      lockAssignee,
      markDraftSubmitted,
      priority,
      projectId,
      title,
      updateSystemStatus,
      visibility,
    ]);

    const handleContentChange = useCallback(() => {
      if (!canCreateTask) return;
      if (!editor) return;
      instructionRef.current = String(editor.getDocument('markdown') ?? '');
      scheduleDraftPersist();
    }, [canCreateTask, editor, scheduleDraftPersist]);

    const handleAttach = useCallback(() => {
      pickAndInsertAttachments(editor);
    }, [editor]);

    const handleSubmit = useCallback(async () => {
      if (!canCreateTask || useTaskStore.getState().isCreatingTask) return;
      const instruction = instructionRef.current.trim();
      const hasFiles = getAttachmentFileIdsFromEditor(editor).length > 0;
      if (!instruction && !title.trim() && !hasFiles) return;

      const editorJson = editor?.getDocument?.('json') as unknown;

      // `createTask` keeps its rejecting contract; surface the failure here so a
      // failed create isn't silent and the modal stays open with its content.
      try {
        const result = await createTask({
          assigneeAgentId,
          assigneeUserId,
          editorData: editorJson,
          instruction: instruction || title.trim(),
          name: title.trim() || undefined,
          priority: priority || undefined,
          projectId,
          status,
          teamId: pickedTeamId,
          // Only send visibility in workspace mode; personal mode ignores it.
          visibility: activeWorkspaceId ? visibility : undefined,
          workflowCategory,
        });

        if (result) {
          // Draft → issue conversion: remove the draft before the modal's
          // unmount flush can write it back.
          markDraftSubmitted();
          close();
          onCreated?.({
            agentId: result.assigneeAgentId ?? undefined,
            identifier: result.identifier,
            name: result.name ?? undefined,
          });
        }
      } catch {
        toast.error(t('createTask.createFailed'));
      }
    }, [
      activeWorkspaceId,
      assigneeAgentId,
      assigneeUserId,
      canCreateTask,
      close,
      createTask,
      editor,
      markDraftSubmitted,
      onCreated,
      priority,
      projectId,
      t,
      pickedTeamId,
      title,
      status,
      workflowCategory,
      visibility,
    ]);

    const handleSubmitRef = useRef(handleSubmit);
    useEffect(() => {
      handleSubmitRef.current = handleSubmit;
    }, [handleSubmit]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        void handleSubmitRef.current?.();
      }
    }, []);

    return (
      <div className="flex flex-col" onKeyDown={handleKeyDown}>
        <div className="flex" style={{ padding: '16px 24px 0' }}>
          <div className="flex flex-1 flex-col" style={{ minHeight: 180 }}>
            <input
              autoFocus={canCreateTask}
              disabled={!canCreateTask}
              placeholder={t('createTask.titlePlaceholder')}
              value={title}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                fontFamily: 'inherit',
                fontSize: 20,
                fontWeight: 600,
                lineHeight: 1.4,
                outline: 'none',
                padding: '4px 0',
                width: '100%',
              }}
              onChange={(e) => setTitle(e.target.value)}
            />
            <EditorCanvas
              disabled={!canCreateTask}
              editor={editor}
              floatingToolbar={false}
              placeholder={t('createTask.instructionPlaceholder')}
              style={{ fontSize: 14, paddingBottom: 16 }}
              onContentChange={handleContentChange}
            />
          </div>
          <div className="flex gap-1" style={{ flexShrink: 0 }}>
            {showInlineToggle && (
              <ActionIcon
                icon={Minimize2}
                title={t('createTask.expandToInline')}
                onClick={handleInline}
              />
            )}
            <ActionIcon icon={X} onClick={close} />
          </div>
        </div>

        <div
          className="flex items-center justify-between"
          style={{ borderTop: `1px solid ${cssVar.colorBorderSecondary}`, padding: '8px 16px' }}
        >
          <div className="flex flex-wrap gap-0.5">
            <TaskPriorityTag priority={priority} onChange={setPriority}>
              <div className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-(--ant-color-fill-tertiary)">
                <TaskPriorityTag disableDropdown priority={priority} size={14} />
                <div className="text-[12px]">
                  {priority === 0
                    ? t('taskDetail.priority.none')
                    : t(
                        `taskDetail.priority.${(['', 'urgent', 'high', 'normal', 'low'] as const)[priority]}` as never,
                      )}
                </div>
              </div>
            </TaskPriorityTag>

            {activeWorkspaceId && (
              <AssigneeMemberSelector
                currentUserId={assigneeUserId}
                taskVisibility={visibility}
                onChange={handleMemberChange}
              >
                <div className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-(--ant-color-fill-tertiary)">
                  {assigneeUserId ? (
                    <>
                      <AssigneeUserAvatar size={18} userId={assigneeUserId} />
                      <div className="text-[12px]">{memberMeta?.title}</div>
                    </>
                  ) : (
                    <>
                      <UnassignedAssigneeIcon kind={'human'} size={14} />
                      <div className="text-[12px]" style={{ color: cssVar.colorTextDescription }}>
                        {t('createTask.member')}
                      </div>
                    </>
                  )}
                </div>
              </AssigneeMemberSelector>
            )}

            {lockAssignee ? (
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
                <AssigneeAvatar agentId={assigneeAgentId} size={18} />
                <div className="text-[12px]">{assigneeMeta?.title}</div>
              </div>
            ) : (
              <AssigneeAgentSelector
                currentAgentId={assigneeAgentId}
                taskVisibility={isOtherMemberAssignee ? 'public' : undefined}
                onChange={handleAgentChange}
              >
                <div className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-(--ant-color-fill-tertiary)">
                  {assigneeAgentId ? (
                    <>
                      <AssigneeAvatar agentId={assigneeAgentId} size={18} />
                      <div className="text-[12px]">{assigneeMeta?.title}</div>
                    </>
                  ) : (
                    <>
                      <UnassignedAssigneeIcon kind={'agent'} size={14} />
                      <div className="text-[12px]" style={{ color: cssVar.colorTextDescription }}>
                        {t('createTask.assignee')}
                      </div>
                    </>
                  )}
                </div>
              </AssigneeAgentSelector>
            )}

            {!teamId && activeWorkspaceId && (teamOptions?.length ?? 0) > 0 && (
              <Select
                options={teamOptions?.map((team) => ({ label: team.name, value: team.id }))}
                placeholder={t('createTask.team')}
                size={'small'}
                style={{ width: 160 }}
                value={pickedTeamId}
                onChange={(value) => setPickedTeamId(value as string | undefined)}
              />
            )}

            {activeWorkspaceId && (
              <TaskVisibilityTag
                visibility={visibility}
                lockedReason={
                  isPrivateAgent
                    ? t('createTask.visibility.privateAgentLocked', {
                        defaultValue: 'Private agents can only run private tasks.',
                      })
                    : isOtherMemberAssignee
                      ? t('createTask.visibility.memberAssigneeLocked', {
                          defaultValue:
                            'A task assigned to a member stays visible to the workspace.',
                        })
                      : undefined
                }
                onChange={setVisibility}
              >
                <TaskVisibilityChipLabel visibility={visibility} />
              </TaskVisibilityTag>
            )}

            <ActionIcon
              icon={Paperclip}
              title={t('upload.action.tooltip')}
              onClick={handleAttach}
            />
          </div>

          <Button
            className="rounded-full"
            disabled={!canCreateTask || isCreating}
            loading={isCreating}
            size="sm"
            title={canCreateTask ? undefined : reason}
            variant="default"
            onClick={handleSubmit}
          >
            {t('createTask.submit')}
          </Button>
        </div>
      </div>
    );
  },
);

export default CreateTaskContent;
