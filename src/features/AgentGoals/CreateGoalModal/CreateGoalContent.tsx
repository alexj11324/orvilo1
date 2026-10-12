'use client';

import { useEditor } from '@lobehub/editor/react';
import { resolveGoalAttemptBudget, resolveGoalConcurrency } from '@orvilo/builtin-tool-goal';
import type { CreateGoalParams, GoalCriterionDraft } from '@orvilo/builtin-tool-task';
import { DEFAULT_GOAL_MAX_ROUNDS } from '@orvilo/const/verify';
import { cn } from 'cn';
import {
  ArrowLeft,
  Paperclip,
  Pencil,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { type KeyboardEvent, memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import GeneratingBorder from '@/components/GeneratingBorder';
import { useModalContext } from '@/components/Modal';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/reui/number-field';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CriterionList,
  CriterionRequiredChip,
  CriterionRow,
  openCriterionEditModal,
} from '@/features/Acceptance';
import { EditorCanvas } from '@/features/EditorCanvas';
import { pickAndInsertAttachments } from '@/features/EditorCanvas/editorAttachments';
import { usePermission } from '@/hooks/usePermission';
import { goalService } from '@/services/goal';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { shinyTextStyles } from '@/styles';

import presentation from './CreateGoalContent.module.css';
import { buildGoalCreateInput, buildReviewedGoalContent } from './goalConfig';
import { createFallbackGoalCriterion, generateGoalCriteria } from './goalCriteria';
import { deriveGoalTitle } from './goalTitle';

const styles = {
  budgetField: presentation.budgetField,
  body: 'overflow-y-auto min-h-0 max-h-[min(70vh,calc(var(--spacing)*170))] pbs-2 pbe-6 px-4',
  close:
    'absolute inset-bs-3.5 inset-e-3.5 pointer-coarse:inset-bs-[calc(var(--spacing)*1.75)] pointer-coarse:inset-e-[calc(var(--spacing)*1.75)]',
  criteriaList: 'overflow-y-auto max-h-80',
  footer: 'py-2 px-4 border-bs border-divider',
  generatingStatus: 'min-h-9 py-1.5 text-muted-foreground',
  generatingTextItem: 'flex items-center h-5.5 text-sm leading-5.5 font-medium whitespace-nowrap',
  generatingTextTrack: presentation.generatingTextTrack,
  generatingTextViewport: 'overflow-hidden h-5.5',
  head: 'relative pbs-4 pbe-2 px-4',
  inputShell: 'overflow-hidden min-h-52 bg-popover',
  instructionEditor: 'min-h-9 pbs-0 pbe-1 px-3',
  reviewSection: 'py-4 first:pbs-0 first:pbe-1',
  sectionHint: 'text-muted-foreground',
  title: 'w-full py-1 pe-10 border-0 bg-transparent text-xl leading-7 font-semibold',
  titleStatic: 'pbs-1 pbe-2 pe-10 text-xl leading-7 font-semibold text-foreground',
};

const GENERATION_ESTIMATE_SECONDS = 90;

export const formatGoalGenerationRemainingTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

export interface CreateGoalContentProps {
  /** The agent that owns the goal. Goals are always agent-scoped. */
  agentId?: string;
  /** Seed from an empty-state example. Only the plain fields — the instruction
   *  body falls back to the title, so the editor is never fought over. */
  initialRequirement?: string;
  initialRoundBudget?: number;
  initialTitle?: string;
  onCreated?: (goal: { agentId?: string; goalId: string }) => void;
  projectId?: string;
}

/**
 * Create a goal — deliberately *not* the task modal with a flag.
 *
 * A goal commits the user to something a task never does: a standing acceptance
 * bar and a budget of autonomous rounds spent against it. Both were previously
 * invisible (the acceptance silently reused the instruction, the budget was
 * hardcoded), so this form asks for them outright.
 */
const CreateGoalContent = memo<CreateGoalContentProps>((props) => {
  const { agentId, initialRequirement, initialRoundBudget, initialTitle, onCreated, projectId } =
    props;
  const { t } = useTranslation('chat');
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const { close } = useModalContext();
  const { allowed: canCreate, reason } = usePermission('create_content');

  const [isCreating, setIsCreating] = useState(false);

  const [step, setStep] = useState<'describe' | 'preparing' | 'review'>('describe');
  const [plan, setPlan] = useState<CreateGoalParams>({
    criteria: [],
    instruction: initialRequirement ?? initialTitle ?? '',
    maxIterations: initialRoundBudget ?? DEFAULT_GOAL_MAX_ROUNDS,
    maxTotalCost: null,
    name: initialTitle ?? '',
  });
  const [remainingSeconds, setRemainingSeconds] = useState(GENERATION_ESTIMATE_SECONDS);

  const editor = useEditor();
  const instructionRef = useRef(plan.instruction);

  useEffect(() => {
    if (step !== 'preparing') return;
    setRemainingSeconds(GENERATION_ESTIMATE_SECONDS);
    const timer = window.setInterval(
      () => setRemainingSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [step]);

  const handleContentChange = useCallback(() => {
    if (!canCreate || !editor) return;
    instructionRef.current = String(editor.getDocument('markdown') ?? '');
    setPlan((current) => ({ ...current, instruction: instructionRef.current }));
  }, [canCreate, editor]);

  const handleAttach = useCallback(() => {
    pickAndInsertAttachments(editor);
  }, [editor]);

  const handleNext = useCallback(async () => {
    const instruction = instructionRef.current.trim() || plan.instruction.trim();
    if (!canCreate || !instruction) return;
    const name = plan.name.trim() || deriveGoalTitle(instruction);
    setPlan((current) => ({
      ...current,
      instruction,
      name,
    }));
    instructionRef.current = instruction;
    setStep('preparing');
    try {
      const generated = await generateGoalCriteria({
        agentId,
        context: name ? `Goal: ${name}` : undefined,
        goal: instruction,
      });
      instructionRef.current = generated.instruction;
      setPlan((current) => ({
        ...current,
        criteria: generated.criteria,
        instruction: generated.instruction,
        name: generated.title,
      }));
      setStep('review');
    } catch (error) {
      console.error('[CreateGoalContent] generate failed:', error);
      setPlan((current) => ({
        ...current,
        criteria: [createFallbackGoalCriterion(instruction)],
        instruction,
        name: instruction,
      }));
      setStep('review');
      toast.warning(t('createGoal.generateFailed'));
    }
  }, [agentId, canCreate, plan.instruction, plan.name, t]);

  const handleCreateBlank = useCallback(() => {
    if (!canCreate) return;
    const instruction = instructionRef.current.trim() || plan.instruction.trim();
    setPlan((current) => ({
      ...current,
      criteria:
        current.criteria.length > 0
          ? current.criteria
          : [{ onFail: 'auto_repair', required: true, title: '', verifierType: 'agent' }],
      instruction,
    }));
    instructionRef.current = instruction;
    setStep('review');
  }, [canCreate, plan.instruction]);

  const updateCriterion = useCallback((index: number, value: GoalCriterionDraft) => {
    setPlan((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, criterionIndex) =>
        criterionIndex === index ? value : criterion,
      ),
    }));
  }, []);

  const removeCriterion = useCallback((index: number) => {
    setPlan((current) => ({
      ...current,
      criteria: current.criteria.filter((_, criterionIndex) => criterionIndex !== index),
    }));
  }, []);

  const addCriterion = useCallback(() => {
    openCriterionEditModal({
      criterion: { onFail: 'auto_repair', required: true, title: '', verifierType: 'agent' },
      isNew: true,
      onSubmit: (criterion) =>
        setPlan((current) => ({ ...current, criteria: [...current.criteria, criterion] })),
    });
  }, []);

  const editCriterion = useCallback(
    (index: number) => {
      const criterion = plan.criteria[index];
      if (!criterion) return;
      openCriterionEditModal({
        criterion,
        onSubmit: (next) => updateCriterion(index, next),
      });
    },
    [plan.criteria, updateCriterion],
  );

  const handleSubmit = useCallback(async () => {
    if (!canCreate) return;
    const instruction =
      instructionRef.current.trim() || plan.instruction.trim() || plan.name.trim();
    const reviewedCriteria = plan.criteria.filter((criterion) => criterion.title.trim());
    if (!instruction || reviewedCriteria.length === 0) return;

    const title = plan.name.trim() || instruction;
    const budget = buildGoalCreateInput({
      costBudget: plan.maxTotalCost,
      instruction,
    });

    setIsCreating(true);
    try {
      const maxConcurrentTasks = resolveGoalConcurrency(plan.maxConcurrentTasks);
      const graph = await goalService.create({
        agentId,
        config: {
          ...(maxConcurrentTasks !== undefined ? { maxConcurrentTasks } : {}),
          recovery: { maxAttemptsPerTask: resolveGoalAttemptBudget(plan.maxIterations) },
        },
        // `maxIterations` is the per-Task attempt budget above; it is not the
        // graph-wide round cap, which counts runs across every Task and would
        // strand the fourth task of a goal whose limit is three attempts.
        // Structured criteria persist alongside the prose requirement: the goal
        // page shows/edits them and the terminal acceptance is gated on them.
        criteria: reviewedCriteria.map(({ description, instruction: how, title: name }) => ({
          description,
          instruction: how,
          title: name,
        })),
        maxTotalCost: budget.maxTotalCost ?? undefined,
        // No seed tasks: the coordinator plans the decomposition on first
        // advance, turning a complex ask into several explorable directions.
        ...buildReviewedGoalContent(instruction),
        projectId,
        title,
      });
      // `goal.create` already queued the first advance server-side, but on a
      // queue-less serverless deployment that kickoff is an in-process timer
      // the host may freeze before firing. This request-bound advance is the
      // durable fallback — fired and forgotten so the modal still closes
      // immediately; the server dedupes a raced decomposition.
      void goalService.advance(graph.goal.id).catch(() => {});
      close();
      onCreated?.({ agentId: graph.goal.agentId ?? undefined, goalId: graph.goal.id });
    } catch (error) {
      console.error('[CreateGoalContent] create failed:', error);
      toast.error(t('createGoal.createFailed'));
    } finally {
      setIsCreating(false);
    }
  }, [agentId, canCreate, close, onCreated, plan, projectId, t]);

  const handlePrimaryAction =
    step === 'describe' ? handleNext : step === 'review' ? handleSubmit : undefined;
  const handleSubmitRef = useRef(handlePrimaryAction);
  const generatingMessages = [
    t('createGoal.generating'),
    t('createGoal.generatingInstruction'),
    t('createGoal.generatingCriteria'),
    t('createGoal.generatingReview'),
    t('createGoal.generating'),
  ];
  useEffect(() => {
    handleSubmitRef.current = handlePrimaryAction;
  }, [handlePrimaryAction]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      void handleSubmitRef.current?.();
    }
  }, []);

  return (
    <div
      className={cn('flex flex-col', presentation.content)}
      data-motion-disabled={animationMode === 'disabled' || undefined}
      onKeyDown={handleKeyDown}
    >
      <div className={`flex ${styles.head}`}>
        <div className="flex flex-col flex-1 gap-1.5">
          {step === 'review' && (
            <div className="flex items-center gap-2">
              <span className="inline-flex flex-none pointer-coarse:p-[calc(var(--spacing)*1.75)]">
                <ActionIcon
                  className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                  icon={ArrowLeft}
                  size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                  title={t('createGoal.back')}
                  onClick={() => setStep('describe')}
                />
              </span>
              <div className="text-xs text-muted-foreground">{t('createGoal.reviewStep')}</div>
            </div>
          )}
          {step === 'review' ? (
            <Input
              aria-label={t('createGoal.titlePlaceholder')}
              className={styles.title}
              disabled={!canCreate}
              placeholder={t('createGoal.titlePlaceholder')}
              value={plan.name}
              visualSize="large"
              onChange={(e) => setPlan((current) => ({ ...current, name: e.target.value }))}
            />
          ) : (
            <div className={styles.titleStatic}>{t('createGoal.describeTitle')}</div>
          )}
          {step !== 'review' && (
            <>
              <GeneratingBorder className={styles.inputShell} generating={step === 'preparing'}>
                <EditorCanvas
                  contentClassName={presentation.editorDescribe}
                  disabled={!canCreate || step === 'preparing'}
                  editor={editor}
                  editorData={{ content: plan.instruction }}
                  entityId={'create-goal-description'}
                  floatingToolbar={false}
                  placeholder={t('createGoal.instructionPlaceholder')}
                  onContentChange={handleContentChange}
                />
              </GeneratingBorder>
              {step === 'preparing' ? (
                <div
                  className={`flex items-center gap-2.5 justify-between ${styles.generatingStatus}`}
                >
                  <div className="flex items-center gap-2">
                    <NeuralNetworkLoading size={16} />
                    <div
                      aria-label={t('createGoal.generating')}
                      className={styles.generatingTextViewport}
                      role={'status'}
                    >
                      <div aria-hidden className={styles.generatingTextTrack}>
                        {generatingMessages.map((message, index) => (
                          <div
                            className={`${styles.generatingTextItem} ${shinyTextStyles.shinyText}`}
                            key={index}
                          >
                            {message}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {remainingSeconds > 0
                      ? t('createGoal.generatingCountdown', {
                          time: formatGoalGenerationRemainingTime(remainingSeconds),
                        })
                      : t('createGoal.generatingAlmostDone')}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">{t('createGoal.describeHint')}</div>
              )}
            </>
          )}
        </div>
        <span
          className={cn(styles.close, 'inline-flex pointer-coarse:p-[calc(var(--spacing)*1.75)]')}
        >
          <ActionIcon
            className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
            icon={X}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={t('close', { ns: 'common' })}
            onClick={close}
          />
        </span>
      </div>

      {step === 'review' && (
        <div className={`flex flex-col ${styles.body}`}>
          <div className={`flex flex-col gap-2.5 ${styles.reviewSection}`}>
            <div className={`flex flex-col ${styles.instructionEditor}`}>
              <EditorCanvas
                contentClassName={presentation.editorReview}
                disabled={!canCreate}
                editor={editor}
                editorData={{ content: plan.instruction }}
                entityId={'create-goal-instruction'}
                floatingToolbar={false}
                placeholder={t('createGoal.instructionPlaceholder')}
                reserveDocumentFooter={false}
                onContentChange={handleContentChange}
              />
            </div>
          </div>

          <div className={`flex flex-col gap-2.5 ${styles.reviewSection}`}>
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-foreground-tertiary" size={16} />
                <div className="text-sm leading-5.5 font-semibold">
                  {t('createGoal.criteriaTitle')}
                </div>
                <div className={cn('text-xs', styles.sectionHint)}>
                  {t('createGoal.criteriaHint')}
                </div>
              </div>
              <span className="inline-flex flex-none pointer-coarse:py-[calc(var(--spacing)*1.75)]">
                <Button
                  className="relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-px pointer-coarse:after:-inset-y-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                  size="compact"
                  variant="ghost"
                  onClick={addCriterion}
                >
                  <Plus data-icon="inline-start" />
                  {t('createGoal.addCriterion')}
                </Button>
              </span>
            </div>
            {/* Draft rows keep the C{seq} anchor but no status icon — the pending
                circle belongs to the post-creation check list, not to authoring. */}
            <CriterionList className={styles.criteriaList}>
              {plan.criteria.map((criterion, index) => (
                <CriterionRow
                  key={index}
                  seq={index + 1}
                  title={criterion.title || t('createGoal.criterionPlaceholder')}
                  actions={
                    <>
                      <span className="inline-flex flex-none pointer-coarse:p-[calc(var(--spacing)*1.75)]">
                        <ActionIcon
                          className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                          icon={Pencil}
                          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                          title={t('edit', { ns: 'common' })}
                          onClick={(event) => {
                            event.stopPropagation();
                            editCriterion(index);
                          }}
                        />
                      </span>
                      <span className="inline-flex flex-none pointer-coarse:p-[calc(var(--spacing)*1.75)]">
                        <ActionIcon
                          className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                          icon={Trash2}
                          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                          title={t('createGoal.removeCriterion')}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeCriterion(index);
                          }}
                        />
                      </span>
                    </>
                  }
                  onOpen={() => editCriterion(index)}
                >
                  <CriterionRequiredChip
                    required={criterion.required ?? true}
                    onToggle={() =>
                      updateCriterion(index, {
                        ...criterion,
                        required: !(criterion.required ?? true),
                      })
                    }
                  />
                </CriterionRow>
              ))}
            </CriterionList>
          </div>

          <div className={`flex flex-col gap-2.5 ${styles.reviewSection}`}>
            <div className="text-sm leading-5.5 font-semibold">{t('createGoal.budgetTitle')}</div>
            <div className="flex flex-col gap-3">
              <div className={styles.budgetField}>
                <div className="text-xs text-muted-foreground">
                  {t('createGoal.roundBudgetLabel')}
                </div>
                <NumberField
                  disabled={!canCreate}
                  min={2}
                  size="normal"
                  value={plan.maxIterations ?? undefined}
                  onValueChange={(value) =>
                    setPlan((current) => ({ ...current, maxIterations: value }))
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement />
                    <NumberFieldInput aria-label={t('createGoal.roundBudgetLabel')} />
                    <NumberFieldIncrement />
                    <span className="text-muted-foreground pr-2 text-xs">
                      {t('createGoal.roundsUnit')}
                    </span>
                  </NumberFieldGroup>
                </NumberField>
                <div className={cn('text-xs', styles.sectionHint)}>
                  {t('createGoal.roundBudgetHint')}
                </div>
              </div>

              <div className={styles.budgetField}>
                <div className="text-xs text-muted-foreground">
                  {t('createGoal.costBudgetLabel')}
                </div>
                <NumberField
                  disabled={!canCreate}
                  min={0}
                  size="normal"
                  value={plan.maxTotalCost}
                  onValueChange={(value) =>
                    setPlan((current) => ({ ...current, maxTotalCost: value }))
                  }
                >
                  <NumberFieldGroup>
                    <span className="text-muted-foreground pl-2 text-xs">$</span>
                    <NumberFieldInput
                      aria-label={t('createGoal.costBudgetLabel')}
                      placeholder={t('createGoal.costBudgetPlaceholder')}
                    />
                  </NumberFieldGroup>
                </NumberField>
                <div className={cn('text-xs', styles.sectionHint)}>
                  {t('createGoal.costBudgetHint')}
                </div>
              </div>

              <div className={styles.budgetField}>
                <div className="text-xs text-muted-foreground">
                  {t('createGoal.parallelismLabel')}
                </div>
                <NumberField
                  disabled={!canCreate}
                  max={10}
                  min={1}
                  size="normal"
                  value={plan.maxConcurrentTasks ?? undefined}
                  onValueChange={(value) =>
                    setPlan((current) => ({ ...current, maxConcurrentTasks: value }))
                  }
                >
                  <NumberFieldGroup>
                    <NumberFieldDecrement />
                    <NumberFieldInput
                      aria-label={t('createGoal.parallelismLabel')}
                      placeholder={t('createGoal.parallelismPlaceholder')}
                    />
                    <NumberFieldIncrement />
                    <span className="text-muted-foreground pr-2 text-xs">
                      {t('createGoal.parallelismUnit')}
                    </span>
                  </NumberFieldGroup>
                </NumberField>
                <div className={cn('text-xs', styles.sectionHint)}>
                  {t('createGoal.parallelismHint')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`flex flex-wrap items-center justify-between gap-2 ${styles.footer}`}>
        <div className="flex items-center gap-2 flex-wrap">
          {step === 'review' && (
            <span className="inline-flex flex-none pointer-coarse:p-[calc(var(--spacing)*1.75)]">
              <ActionIcon
                className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                icon={Paperclip}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                title={t('upload.action.tooltip')}
                onClick={handleAttach}
              />
            </span>
          )}
        </div>

        <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
          {step === 'describe' && (
            <span className="inline-flex flex-none pointer-coarse:py-[calc(var(--spacing)*1.25)]">
              <Button
                className="text-foreground-tertiary relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-px pointer-coarse:after:-inset-y-[calc(var(--spacing)*1.25)] pointer-coarse:after:content-['']"
                disabled={!canCreate || isCreating}
                size="normal"
                title={canCreate ? undefined : reason}
                variant="ghost"
                onClick={handleCreateBlank}
              >
                <PencilLine data-icon="inline-start" />
                {t('createModal.createBlank')}
              </Button>
            </span>
          )}
          <span className="inline-flex flex-none pointer-coarse:py-[calc(var(--spacing)*1.25)]">
            <Button
              className="relative pointer-coarse:min-w-11 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-px pointer-coarse:after:-inset-y-[calc(var(--spacing)*1.25)] pointer-coarse:after:content-['']"
              loading={isCreating || step === 'preparing'}
              size="normal"
              title={canCreate ? undefined : reason}
              variant="outline"
              disabled={
                !canCreate ||
                isCreating ||
                step === 'preparing' ||
                (step === 'describe'
                  ? !plan.instruction.trim()
                  : !plan.name.trim() ||
                    plan.criteria.every((criterion) => !criterion.title.trim()))
              }
              onClick={step === 'describe' ? handleNext : handleSubmit}
            >
              {step === 'preparing'
                ? t('createGoal.preparing')
                : step === 'describe'
                  ? t('createGoal.next')
                  : t('createGoal.submit')}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
});

CreateGoalContent.displayName = 'CreateGoalContent';

export default CreateGoalContent;
