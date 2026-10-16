'use client';
import {
  ReactCodeblockPlugin,
  ReactCodePlugin,
  ReactHRPlugin,
  ReactLinkPlugin,
  ReactListPlugin,
  ReactTablePlugin,
} from '@lobehub/editor';
import { Editor, useEditor } from '@lobehub/editor/react';
import type { BuiltinInterventionProps } from '@orvilo/types';
import { cn } from 'cn';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import InputNumber from '@/components/InputNumber';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CriterionList,
  CriterionRequiredChip,
  CriterionRow,
  openCriterionEditModal,
} from '@/features/Acceptance/CriterionList';

import type {
  CreateOrchestrationWorkflowParams,
  OrchestrationWorkflowCriterionDraft,
} from '../../types';
import editorStyles from './CreateGoal.module.css';

const styles = {
  header: 'sticky z-2 -inset-bs-2 pbs-2 pbe-1 bg-popover',
  instructionEditor: 'py-2 px-3 rounded-(--radius-input) bg-fill-quaternary',
  list: '[background:transparent] dark:[&>*+*]:border-bs-border',
  root: '-mbs-2',
  section: 'py-2 [&+&]:border-bs [&+&]:border-divider',
  sectionHeader:
    'w-full justify-start px-0 text-start whitespace-normal duration-(--orvilo-motion-fast) motion-reduce:transition-none pointer-coarse:min-bs-11',
  sectionLabel: 'text-sm font-medium text-muted-foreground',
  seq: 'text-xs text-foreground-tertiary',
  titleInput: 'py-0.5 px-0 text-base md:text-base leading-6 font-semibold',
};

interface SectionProps {
  children: React.ReactNode;
  extra?: React.ReactNode;
  label: string;
  onToggle: () => void;
  open: boolean;
}

/**
 * One collapsible module. The plan card is three distinct decisions (what to
 * do, how to judge it, how much to spend) — each gets a header the user can
 * fold away, instead of three flat blocks bleeding into each other.
 */
const Section = memo<SectionProps>(({ children, extra, label, onToggle, open }) => (
  <div className={cn('flex', 'flex-col', 'gap-1.75', styles.section)}>
    <Button
      aria-expanded={open}
      className={styles.sectionHeader}
      size="compact"
      type="button"
      variant="ghost"
      onClick={onToggle}
    >
      <ChevronRight
        className="size-4 text-foreground-quaternary transition-transform duration-(--orvilo-motion-mid) motion-reduce:transition-none"
        size={16}
        style={{ transform: open ? 'rotate(90deg)' : 'none' }}
      />
      <span className={styles.sectionLabel}>{label}</span>
      {extra}
    </Button>
    {open && children}
  </div>
));

Section.displayName = 'CreateGoalSection';

const CreateGoalIntervention = memo<BuiltinInterventionProps<CreateOrchestrationWorkflowParams>>(
  ({ args, onArgsChange, registerBeforeApprove }) => {
    const { t } = useTranslation('plugin');
    const editor = useEditor();
    const [openSections, setOpenSections] = useState({
      budget: true,
      criteria: true,
      instruction: true,
    });
    const patch = (value: Partial<CreateOrchestrationWorkflowParams>) =>
      onArgsChange?.({ ...args, ...value });
    const openEditModal = (index: number) =>
      openCriterionEditModal({
        criterion: args.criteria[index],
        onSubmit: (value) => updateCriterion(index, value),
      });
    const updateCriterion = (index: number, value: Partial<OrchestrationWorkflowCriterionDraft>) =>
      patch({
        criteria: args.criteria.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...value } : item,
        ),
      });
    const toggleSection = (key: keyof typeof openSections) =>
      setOpenSections((previous) => ({ ...previous, [key]: !previous[key] }));
    // The instruction lives in the rich editor; args carry its persisted
    // draft. The editor mounts once from the persisted value (a changing
    // `content` prop would reset it mid-edit), while edits flow back through
    // a debounced onArgsChange — the same DB-backed draft path every other
    // field uses, so a refresh loses at most the debounce window. The
    // before-approve flush closes even that window.
    const [initialInstruction] = useState(args.instruction);
    const persistTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

    const saveInstruction = useCallback(async () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      if (!editor) return;
      const markdown = String(editor.getDocument('markdown') ?? '');
      await onArgsChange?.({ ...args, instruction: markdown });
    }, [editor, onArgsChange, args]);
    const saveInstructionRef = useRef(saveInstruction);
    saveInstructionRef.current = saveInstruction;

    const handleInstructionChange = useCallback(() => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => void saveInstructionRef.current(), 800);
    }, []);

    useEffect(
      () =>
        registerBeforeApprove?.('startOrchestrationWorkflow', () => saveInstructionRef.current()),
      [registerBeforeApprove],
    );

    return (
      <div className={cn('flex', 'flex-col', styles.root)}>
        <div className={cn('flex', 'flex-col', styles.header)}>
          <Input
            className={styles.titleInput}
            value={args.name}
            visualSize="normal"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>

        <Section
          label={t('builtins.orvilo-task.goal.sectionInstruction')}
          open={openSections.instruction}
          onToggle={() => toggleSection('instruction')}
        >
          <div
            className={cn(
              'flex',
              'flex-col',
              styles.instructionEditor,
              editorStyles.instructionEditor,
            )}
          >
            <Editor
              content={initialInstruction}
              editor={editor}
              type={'markdown'}
              plugins={[
                ReactCodePlugin,
                ReactCodeblockPlugin,
                ReactHRPlugin,
                ReactLinkPlugin,
                ReactListPlugin,
                ReactTablePlugin,
              ]}
              onTextChange={handleInstructionChange}
            />
          </div>
        </Section>

        <Section
          extra={<span className={styles.seq}>{args.criteria.length}</span>}
          label={t('builtins.orvilo-task.goal.criteria')}
          open={openSections.criteria}
          onToggle={() => toggleSection('criteria')}
        >
          <div className="flex flex-col gap-1.75">
            <CriterionList className={styles.list}>
              {/* Rows are read-only on purpose. A focusable input sitting in a
                dense list is one stray click away from silently rewriting a
                criterion; edits belong in the modal, where they are deliberate
                and cancellable. */}
              {args.criteria.map((criterion, index) => (
                <CriterionRow
                  key={index}
                  seq={index + 1}
                  title={criterion.title}
                  actions={
                    <>
                      <span className="inline-flex flex-none pointer-coarse:p-1.5">
                        <ActionIcon
                          className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                          icon={Pencil}
                          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                          title={t('builtins.orvilo-task.goal.editCriterion')}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditModal(index);
                          }}
                        />
                      </span>
                      <span className="inline-flex flex-none pointer-coarse:p-1.5">
                        <ActionIcon
                          className="relative pointer-coarse:after:absolute pointer-coarse:after:-inset-[calc(var(--spacing)*1.75)] pointer-coarse:after:content-['']"
                          icon={Trash2}
                          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            patch({
                              criteria: args.criteria.filter((_, itemIndex) => itemIndex !== index),
                            });
                          }}
                        />
                      </span>
                    </>
                  }
                  onOpen={() => openEditModal(index)}
                >
                  <CriterionRequiredChip
                    required={criterion.required ?? true}
                    onToggle={() =>
                      updateCriterion(index, { required: !(criterion.required ?? true) })
                    }
                  />
                </CriterionRow>
              ))}
            </CriterionList>
            <div className="flex">
              <Button
                size="compact"
                variant="ghost"
                onClick={() =>
                  openCriterionEditModal({
                    criterion: {
                      onFail: 'auto_repair',
                      required: true,
                      title: '',
                      verifierType: 'agent',
                    },
                    isNew: true,
                    onSubmit: (value) => patch({ criteria: [...args.criteria, value] }),
                  })
                }
              >
                <Plus /> {t('builtins.orvilo-task.goal.addCriterion')}
              </Button>
            </div>
          </div>
        </Section>

        <Section
          label={t('builtins.orvilo-task.goal.sectionBudget')}
          open={openSections.budget}
          onToggle={() => toggleSection('budget')}
        >
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-col gap-1">
              <div className={styles.seq}>{t('builtins.orvilo-task.goal.roundBudget')}</div>
              <div className="flex items-center gap-2">
                <InputNumber
                  className="w-30"
                  min={2}
                  size="normal"
                  value={args.maxIterations ?? undefined}
                  onChange={(value) => patch({ maxIterations: value })}
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {t('builtins.orvilo-task.goal.roundsUnit')}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className={styles.seq}>{t('builtins.orvilo-task.goal.costBudget')}</div>
              <InputNumber
                className="w-30"
                min={0}
                placeholder={t('builtins.orvilo-task.goal.uncapped')}
                prefix={'$'}
                size="normal"
                value={args.maxTotalCost ?? undefined}
                onChange={(value) => patch({ maxTotalCost: value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className={styles.seq}>{t('builtins.orvilo-task.goal.parallelism')}</div>
              <InputNumber
                className="w-30"
                max={10}
                min={1}
                placeholder={t('builtins.orvilo-task.goal.parallelismAuto')}
                size="normal"
                value={args.maxConcurrentTasks ?? undefined}
                onChange={(value) => patch({ maxConcurrentTasks: value })}
              />
            </div>
          </div>
        </Section>
      </div>
    );
  },
);

CreateGoalIntervention.displayName = 'CreateGoalIntervention';

export default CreateGoalIntervention;
