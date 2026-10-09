'use client';

import { useEditor } from '@lobehub/editor/react';
import { canWorkspaceRoleBeTaskAssignee } from '@orvilo/const/rbac';
import type { TaskIntentAnalysis } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { $getRoot } from 'lexical';
import { ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import { type KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useFetchWorkspaceMembers } from '@/business/client/hooks/useFetchWorkspaceMembers';
import { useWorkspaceMembers } from '@/business/client/hooks/useWorkspaceMembers';
import ActionIcon from '@/components/ActionIcon';
import GeneratingBorder from '@/components/GeneratingBorder';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditorCanvas } from '@/features/EditorCanvas';
import {
  getAttachmentFileIdsFromEditor,
  pickAndInsertAttachments,
} from '@/features/EditorCanvas/editorAttachments';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { taskService } from '@/services/task';
import { useGlobalStore } from '@/store/global';
import { useTaskStore } from '@/store/task';
import { shinyTextStyles } from '@/styles';

import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import AssigneeMemberSelector from '../features/AssigneeMemberSelector';
import AssigneeUserAvatar from '../features/AssigneeUserAvatar';
import TaskPriorityTag from '../features/TaskPriorityTag';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { taskDetailPath } from '../shared/taskDetailPath';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { useUserDisplayMeta } from '../shared/useUserDisplayMeta';
import {
  answeredClarifications,
  buildConfirmedDraft,
  type ClarificationAnswers,
  shouldConfirmIntent,
} from './taskIntent';
import TaskIntentReview from './TaskIntentReview';

interface CreateTaskInlineEntryProps {
  agentId?: string;
  autoFocus?: boolean;
  /** Legacy parent input; workspace tasks are always shared. */
  defaultVisibility?: 'private' | 'public';
  /**
   * Locks the assignee to `agentId` and hides the agent picker. Used on the
   * agent-scoped task list where every task belongs to that agent.
   */
  lockAssignee?: boolean;
  onCollapse?: () => void;
  onCreated?: (task: { agentId?: string; identifier: string }) => void;
  parentTaskId?: string;
  placeholder?: string;
  projectId?: string;
}

const CreateTaskInlineEntry = memo<CreateTaskInlineEntryProps>((props) => {
  const {
    agentId,
    autoFocus,
    lockAssignee,
    onCollapse,
    onCreated,
    parentTaskId,
    placeholder,
    projectId,
  } = props;
  const { t } = useTranslation('chat');
  const { allowed: canCreateTask, reason } = usePermission('create_content');

  const createTask = useTaskStore((s) => s.createTask);
  const isCreating = useTaskStore((s) => s.isCreatingTask);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const activeWorkspaceId = useActiveWorkspaceId();
  const { isLoading: isMembersLoading } = useFetchWorkspaceMembers();
  const workspaceMembers = useWorkspaceMembers();
  const assignableMemberIds = useMemo(
    () =>
      new Set(
        workspaceMembers
          .filter((member) => canWorkspaceRoleBeTaskAssignee(member.role))
          .map((member) => member.userId),
      ),
    [workspaceMembers],
  );
  const navigate = useWorkspaceAwareNavigate();
  const [priority, setPriority] = useState(0);
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | undefined>(agentId);
  const [assigneeUserId, setAssigneeUserId] = useState<string | undefined>();
  const [instruction, setInstruction] = useState('');
  const [hasAttachments, setHasAttachments] = useState(false);
  // Reading the draft is what submit does now. It only stops for confirmation
  // when it found something the user alone can settle, so the escape hatch is
  // the dropdown's "create directly" rather than a setting nobody would find.
  const [analysis, setAnalysis] = useState<TaskIntentAnalysis | null>(null);
  const [intentTitle, setIntentTitle] = useState('');
  const [intentAnswers, setIntentAnswers] = useState<ClarificationAnswers>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // The instruction the review step shows is a real editor, not a preview: it
  // is what gets created, so the user has to be able to read it and change it.
  // It is a second editor rather than the composer's own so that going back
  // returns to the untouched draft.
  // Set once the second reading has folded the answers into the instruction.
  // The appended Q&A block is then already redundant — leaving it on would put
  // the answers in the brief twice, once woven in and once as a list.
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const editor = useEditor();

  // Persist the in-progress draft per scope so a reload / accidental close
  // doesn't eat a long prompt. Skipped for the transient subtask composer.
  const draftStorageKey = useMemo(
    () =>
      parentTaskId
        ? null
        : `orvilo:task-create-draft:${activeWorkspaceId ?? 'personal'}:${projectId ?? agentId ?? 'all'}`,
    [activeWorkspaceId, agentId, parentTaskId, projectId],
  );
  // Tracks which scope key the editor is currently hydrated for. The component
  // is reused across workspace and task-scope route switches without unmounting.
  // State (instead of a ref) keeps the persistence effect from writing the old
  // scope's member into the new key during the same effect flush as the reset.
  const [draftHydratedKey, setDraftHydratedKey] = useState<string | null>(null);

  const assigneeMeta = useAgentDisplayMeta(assigneeAgentId);
  const memberMeta = useUserDisplayMeta(assigneeUserId);

  const handleAgentChange = useCallback((nextAgentId: string | null) => {
    setAssigneeAgentId(nextAgentId ?? undefined);
  }, []);
  const handleMemberChange = useCallback((nextUserId: string | null) => {
    setAssigneeUserId(nextUserId ?? undefined);
  }, []);

  // When the assignee is locked to a scoped agent, keep it in sync with the
  // `agentId` prop. The route subtree is reused across /agent/A/tasks ->
  // /agent/B/tasks and /agent/A/tasks -> /tasks, so without this the hidden
  // assignee would stay on the previous scoped agent.
  useEffect(() => {
    if (lockAssignee) {
      setAssigneeAgentId(agentId);
      setAssigneeUserId(undefined);
      return;
    }

    if (!agentId) setAssigneeAgentId(undefined);
  }, [agentId, lockAssignee]);

  useEffect(() => {
    if (!canCreateTask) return;
    if (autoFocus) editor?.focus?.();
  }, [autoFocus, canCreateTask, editor]);

  // Hydrate the editor with the current scope's saved draft. Re-runs whenever
  // the scope key changes (not just on mount): it first resets to this scope's
  // baseline so a previous scope's draft can't leak across a switch, then loads
  // the new key's draft. The editor's onContentChange syncs `instruction`.
  useEffect(() => {
    if (!draftStorageKey || !editor) return;
    // Workspace drafts depend on the member directory. Wait for its first
    // response so a removed or downgraded member is never restored into a
    // composer state that the create API will reject.
    if (activeWorkspaceId && isMembersLoading) return;
    if (draftHydratedKey === draftStorageKey) return;
    setDraftHydratedKey(draftStorageKey);

    // Reset to baseline for the new scope before hydrating.
    editor.cleanDocument?.();
    setPriority(0);
    if (!lockAssignee) setAssigneeAgentId(agentId);
    setAssigneeUserId(undefined);

    let raw: string | null;
    try {
      raw = localStorage.getItem(draftStorageKey);
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as {
        assigneeAgentId?: string;
        assigneeUserId?: string;
        markdown?: string;
        priority?: number;
      };
      if (draft.markdown) editor.setDocument?.('markdown', draft.markdown);
      if (typeof draft.priority === 'number') setPriority(draft.priority);
      if (!lockAssignee && draft.assigneeAgentId) setAssigneeAgentId(draft.assigneeAgentId);
      if (
        draft.assigneeUserId &&
        (!activeWorkspaceId || assignableMemberIds.has(draft.assigneeUserId))
      ) {
        setAssigneeUserId(draft.assigneeUserId);
      }
    } catch {
      /* ignore a malformed draft */
    }
  }, [
    activeWorkspaceId,
    agentId,
    assignableMemberIds,
    draftHydratedKey,
    draftStorageKey,
    editor,
    isMembersLoading,
    lockAssignee,
  ]);

  // Back the draft to storage on every change. Gated behind the restore pass so
  // the initial render can't clobber a just-read draft. Write-only on non-empty:
  // the key is cleared only on a successful submit (below), never here — so a
  // `setDocument`-timing gap right after restore can't wipe a valid draft.
  useEffect(() => {
    if (!draftStorageKey || draftHydratedKey !== draftStorageKey || !editor) return;
    const markdown = String(editor.getDocument?.('markdown') ?? '').trim();
    if (!markdown) return;
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          assigneeAgentId: lockAssignee ? undefined : assigneeAgentId,
          // `lockAssignee` locks only the scoped Agent. The responsible
          // member remains an independent draft field and must survive reloads.
          assigneeUserId,
          markdown,
          priority,
        }),
      );
    } catch {
      /* storage unavailable / quota — persistence is best-effort */
    }
  }, [
    assigneeAgentId,
    assigneeUserId,
    draftHydratedKey,
    draftStorageKey,
    editor,
    instruction,
    lockAssignee,
    priority,
  ]);

  const handleCollapse = useCallback(() => {
    if (onCollapse) {
      onCollapse();
      return;
    }
    updateSystemStatus({ taskCreateInlineCollapsed: true }, 'collapseTaskCreateInline');
  }, [onCollapse, updateSystemStatus]);

  const handleContentChange = useCallback(() => {
    if (!canCreateTask) return;
    const lexicalEditor = editor?.getLexicalEditor?.();
    if (!lexicalEditor) return;
    lexicalEditor.getEditorState().read(() => {
      setInstruction($getRoot().getTextContent());
    });
    setHasAttachments(getAttachmentFileIdsFromEditor(editor).length > 0);
  }, [canCreateTask, editor]);

  const handleAttach = useCallback(() => {
    pickAndInsertAttachments(editor);
  }, [editor]);

  const resetComposer = useCallback(() => {
    setPriority(0);
    setAssigneeAgentId(agentId);
    setAssigneeUserId(undefined);
    setInstruction('');
    setAnalysis(null);
    setIntentAnswers({});
    editor?.cleanDocument?.();
    if (draftStorageKey) {
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        /* ignore */
      }
    }
  }, [agentId, draftStorageKey, editor]);

  /** What the composer currently holds, or null when there is nothing to create. */
  const readDraft = useCallback(() => {
    const markdown = String(editor?.getDocument?.('markdown') ?? '').trim();
    const trimmedText = instruction.trim();
    const hasFiles = getAttachmentFileIdsFromEditor(editor).length > 0;
    if (!trimmedText && !markdown && !hasFiles) return null;

    const firstLine =
      trimmedText
        .split('\n')
        .find((line) => line.trim())
        ?.trim() ?? trimmedText;
    let name: string | undefined;
    if (firstLine) {
      name = firstLine.length > 30 ? `${firstLine.slice(0, 30)}…` : firstLine;
    }

    return {
      editorJson: editor?.getDocument?.('json') as unknown,
      instruction: markdown || trimmedText || name || '',
      name,
    };
  }, [editor, instruction]);

  const submitDraft = useCallback(
    async (draft: { editorJson: unknown; instruction: string; name?: string }) => {
      // Drop the persisted draft BEFORE the request, not in the success reset.
      // Creating the first task flips the list from empty to non-empty, which
      // swaps the hero composer for the one that sits above the list — a
      // different component instance, mounted while this await is still in
      // flight. That new instance hydrates itself from this key, so a draft
      // still on disk here comes straight back onto the screen and the reset
      // below lands on the old, dying instance. Kept in hand so a failed
      // create can put it back.
      let persistedDraft: string | null = null;
      if (draftStorageKey) {
        try {
          persistedDraft = localStorage.getItem(draftStorageKey);
          localStorage.removeItem(draftStorageKey);
        } catch {
          /* storage unavailable — persistence is best-effort */
        }
      }

      // `createTask` keeps its rejecting contract (other callers rely on `catch`);
      // handle the composer's own failure here so it isn't silent, keeping the
      // draft intact (the reset only runs on success).
      try {
        const result = await createTask({
          assigneeAgentId,
          assigneeUserId,
          editorData: draft.editorJson,
          instruction: draft.instruction,
          name: draft.name,
          parentTaskId,
          priority: priority || undefined,
          projectId,
          // Only send visibility in workspace mode; personal mode lets the server
          // fall through to the schema default ('public', inert in personal mode).
          visibility: activeWorkspaceId ? 'public' : undefined,
        });

        if (result) {
          resetComposer();
          // Creating from here leaves the user on the list, so without this the
          // whole flow ends in a spinner blinking out — nothing says the task
          // exists, what it ended up called, or where it went. The name matters
          // most after a reading, since that name is what the reading produced.
          toast.success({
            // The open affordance rides in the description rather than the
            // action slot: the toast's job is to say the task exists, and a
            // filled button pulled to the far right read as the thing to do
            // next. The action slot is right-aligned and shrink-wrapped by the
            // toast itself, so lining the link up under the task name means
            // putting it in the same column as the name.
            description: (
              <div className="flex flex-col items-start gap-0.5">
                <div>{result.name || draft.name}</div>
                <Button
                  size="sm"
                  style={{ paddingInline: 0 }}
                  variant="ghost"
                  onClick={() =>
                    navigate(
                      taskDetailPath(
                        result.identifier,
                        result.assigneeAgentId ?? undefined,
                        result.name || draft.name,
                      ),
                    )
                  }
                >
                  {t('taskIntent.openCreated')}
                </Button>
              </div>
            ),
            title: t('taskIntent.created'),
          });
          onCreated?.({
            agentId: result.assigneeAgentId ?? undefined,
            identifier: result.identifier,
          });
        }
      } catch {
        // Nothing was created, so the draft is still the user's work: put it
        // back on disk to match the text the composer is still showing.
        if (draftStorageKey && persistedDraft !== null) {
          try {
            localStorage.setItem(draftStorageKey, persistedDraft);
          } catch {
            /* storage unavailable — persistence is best-effort */
          }
        }
        toast.error(t('createTask.createFailed'));
      }
    },
    [
      t,
      activeWorkspaceId,
      draftStorageKey,
      assigneeAgentId,
      assigneeUserId,
      createTask,
      navigate,
      onCreated,
      parentTaskId,
      priority,
      projectId,
      resetComposer,
    ],
  );

  const handleSubmit = useCallback(async () => {
    if (!canCreateTask) return;
    const draft = readDraft();
    if (!draft) return;

    setIsAnalyzing(true);
    try {
      const result = await taskService.analyzeIntent({
        context: assigneeMeta?.title ? `Assigned agent: ${assigneeMeta.title}` : undefined,
        instruction: draft.instruction,
      });

      // An unambiguous draft is never held up — it goes straight through, just
      // with a real name instead of the first thirty characters of line one.
      if (shouldConfirmIntent(result)) {
        setAnalysis(result);
        setIntentTitle(result.title);
        setIntentAnswers({});
        return;
      }

      await submitDraft({ ...draft, name: result.title || draft.name });
    } catch {
      // Reading the draft is an assist, never a gate: when the model call fails
      // the task is created exactly as it would have been without this step.
      await submitDraft(draft);
    } finally {
      setIsAnalyzing(false);
    }
  }, [assigneeMeta?.title, canCreateTask, readDraft, submitDraft]);

  /**
   * The escape hatch, one click away in the submit dropdown: create the task
   * with no reading at all. Same path the composer took before this feature —
   * first line truncated for the name, draft text handed straight over — so a
   * user who finds the reading slow or wrong is never stuck behind it.
   */
  const handleCreateDirectly = useCallback(async () => {
    if (!canCreateTask) return;
    const draft = readDraft();
    if (!draft) return;
    await submitDraft(draft);
  }, [canCreateTask, readDraft, submitDraft]);

  const handleAnswerChange = useCallback((index: number, value: string) => {
    setIntentAnswers((current) => ({ ...current, [index]: value }));
  }, []);

  /**
   * The review editor is the source of truth for what gets created, not the
   * composer draft it was seeded from — the user may have rewritten any of it.
   * Markdown and its rich-text mirror are read from the same editor and get the
   * answers appended together, so the task page cannot show one and the agent
   * read the other.
   */
  /**
   * Generate and create, in one press.
   *
   * The first reading ran before the user answered, so its brief still names
   * the answered details as open — creating from it, or from it with the
   * answers stapled underneath, hands the executor a document that contradicts
   * itself. So pressing generate writes the brief again with the answers folded
   * in as settled facts, and creates the task from that. There is no page in
   * between: the brief is on the task's own page the moment it exists.
   *
   * Like the first reading it is an assist, never a gate — a failed rewrite
   * falls back to the draft with the answers appended, which is what the flow
   * did before this step existed.
   */
  const handleConfirmIntent = useCallback(async () => {
    const draft = readDraft();
    if (!analysis || !draft) return;

    const pairs = answeredClarifications(analysis, intentAnswers);

    if (pairs.length > 0) {
      setIsSynthesizing(true);
      try {
        const written = await taskService.synthesizeInstruction({
          answers: pairs,
          context: assigneeMeta?.title ? `Assigned agent: ${assigneeMeta.title}` : undefined,
          instruction: draft.instruction,
        });

        await submitDraft({
          // Freshly written prose has no mirror to inherit. Sending the
          // pre-answer draft's document instead would win over this markdown
          // when the task renders, showing a brief the agent never received.
          editorJson: undefined,
          instruction: written.instruction,
          name: written.title.trim() || intentTitle.trim() || analysis.title,
        });
        return;
      } catch {
        // Fall through to the append path below.
      } finally {
        setIsSynthesizing(false);
      }
    }

    const confirmed = buildConfirmedDraft({
      analysis,
      answers: intentAnswers,
      editorJson: draft.editorJson,
      heading: t('taskIntent.answersHeading'),
      instruction: draft.instruction,
    });

    await submitDraft({
      editorJson: confirmed.editorData,
      instruction: confirmed.instruction,
      name: intentTitle.trim() || analysis.title,
    });
  }, [analysis, assigneeMeta?.title, intentAnswers, intentTitle, readDraft, submitDraft, t]);

  const isReviewing = Boolean(analysis);

  // Cmd+Enter means "the primary action of what is on screen": submit the
  // draft while composing, confirm the reading while reviewing.
  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => {
    handleSubmitRef.current = isReviewing ? handleConfirmIntent : handleSubmit;
  }, [handleConfirmIntent, handleSubmit, isReviewing]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      void handleSubmitRef.current?.();
    }
  }, []);

  return (
    // The ring belongs to the whole input surface — editor, controls and submit
    // are one thing being read, so lighting only the text area would draw a
    // second boundary the composer does not otherwise have.
    <GeneratingBorder generating={isAnalyzing || isSynthesizing}>
      <div
        className="relative overflow-hidden rounded-md border"
        style={{
          borderColor: cssVar.colorBorderSecondary,
          background: cssVar.colorBgContainer,
        }}
        onKeyDownCapture={handleKeyDown}
      >
        {!isReviewing && (
          <ActionIcon
            icon={ChevronUp}
            size={'small'}
            style={{ position: 'absolute', right: 8, top: 8, zIndex: 1 }}
            title={t('createTask.collapse')}
            onClick={handleCollapse}
          />
        )}
        {isReviewing && analysis && (
          <TaskIntentReview
            analysis={analysis}
            answers={intentAnswers}
            isCreating={isCreating || isSynthesizing}
            title={intentTitle}
            onAnswerChange={handleAnswerChange}
            onBack={() => setAnalysis(null)}
            onConfirm={handleConfirmIntent}
            onTitleChange={setIntentTitle}
          />
        )}
        {/* Kept mounted through the review step so going back restores the draft
            exactly as it was, attachments and all. */}
        <div
          className="flex flex-col"
          style={{
            display: isReviewing ? 'none' : undefined,
            fontSize: 14,
            // Cap the editor so a long draft scrolls inside the box instead of
            // growing the composer until it pushes the task list below the fold.
            maxHeight: 200,
            overflowY: 'auto',
            padding: '8px 40px 0 16px',
          }}
        >
          <EditorCanvas
            disabled={!canCreateTask}
            editor={editor}
            floatingToolbar={false}
            placeholder={placeholder ?? t('createTask.instructionPlaceholder')}
            style={{
              fontSize: 14,
              paddingBottom: 12,
            }}
            onContentChange={handleContentChange}
          />
        </div>
        <div
          className="flex items-center justify-between"
          style={{
            borderTop: `1px solid ${cssVar.colorBorderSecondary}`,
            display: isReviewing ? 'none' : undefined,
            paddingBlock: 8,
            paddingInline: '8px 16px',
          }}
        >
          <div className="flex flex-wrap items-center gap-0.5">
            <TaskPriorityTag priority={priority} onChange={setPriority}>
              <div className="flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 py-[3px] transition-colors hover:bg-(--ant-color-fill-tertiary)">
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
              <AssigneeMemberSelector currentUserId={assigneeUserId} onChange={handleMemberChange}>
                <div className="flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 py-[3px] transition-colors hover:bg-(--ant-color-fill-tertiary)">
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
              <div className="flex h-6 items-center gap-1.5 rounded-md px-2 py-[3px]">
                <AssigneeAvatar agentId={assigneeAgentId} size={18} />
                <div className="text-[12px]">{assigneeMeta?.title}</div>
              </div>
            ) : (
              <AssigneeAgentSelector currentAgentId={assigneeAgentId} onChange={handleAgentChange}>
                <div className="flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 py-[3px] transition-colors hover:bg-(--ant-color-fill-tertiary)">
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

            <ActionIcon
              icon={Paperclip}
              size={'small'}
              title={t('upload.action.tooltip')}
              onClick={handleAttach}
            />
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5">
              {/* The shimmer is a text-clipped gradient in the foreground color, so
                  it only reads on a light surface. Dropping the filled style while
                  reading also matches what is happening: the button has handed the
                  draft off and is no longer the thing to press. */}
              <Button
                className="rounded-full"
                loading={isCreating || isAnalyzing}
                size="sm"
                title={canCreateTask ? undefined : reason}
                variant={isAnalyzing ? 'outline' : 'default'}
                disabled={
                  !canCreateTask ||
                  isCreating ||
                  isAnalyzing ||
                  (!instruction.trim() && !hasAttachments)
                }
                onClick={handleSubmit}
              >
                {isAnalyzing ? (
                  // Same shimmer every other "a model is working on this" label in
                  // the app uses, so the wait reads as the product thinking rather
                  // than as the button having gone inert.
                  <span className={shinyTextStyles.shinyText}>{t('taskIntent.analyzing')}</span>
                ) : (
                  t('createTask.submit')
                )}
              </Button>
              {/* The escape hatch sits on the button it bypasses, so a user who
                  does not want the reading finds it exactly where they already
                  are — rather than in a setting they would have to know exists. */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <ActionIcon
                      icon={ChevronDown}
                      size={'small'}
                      title={t('taskIntent.moreCreateOptions')}
                      disabled={
                        !canCreateTask ||
                        isCreating ||
                        isAnalyzing ||
                        (!instruction.trim() && !hasAttachments)
                      }
                    />
                  }
                />
                <DropdownMenuContent align={'end'}>
                  <DropdownMenuItem onClick={() => void handleCreateDirectly()}>
                    {t('taskIntent.createDirectly')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </GeneratingBorder>
  );
});

export default CreateTaskInlineEntry;
