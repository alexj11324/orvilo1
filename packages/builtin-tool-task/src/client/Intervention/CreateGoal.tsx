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
import { ChevronRight } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import InputNumber from '@/components/InputNumber';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { CreateGoalParams } from '../../types';
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

const CreateGoalIntervention = memo<BuiltinInterventionProps<CreateGoalParams>>(
  ({ args, onArgsChange, registerBeforeApprove }) => {
    const { t } = useTranslation('plugin');
    const editor = useEditor();
    const [openSections, setOpenSections] = useState({
      budget: true,
      instruction: true,
    });
    const patch = (value: Partial<CreateGoalParams>) => onArgsChange?.({ ...args, ...value });
    const toggleSection = (key: keyof typeof openSections) =>
      setOpenSections((previous) => ({ ...previous, [key]: !previous[key] }));
    // The instruction lives in the rich editor; args carry its persisted
    // draft. The editor mounts once from the persisted value (a changing
    // `content` prop would reset it mid-edit), while edits flow back through
    // a debounced onArgsChange — the same DB-backed draft path every other
    // field uses, so a refresh loses at most the debounce window. The
    // before-approve flush closes even that window.
    const [initialInstruction] = useState(
      [...new Set([args.instruction, args.criteriaDescription].filter(Boolean))].join('\n\n'),
    );
    const persistTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

    const saveInstruction = useCallback(async () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      if (!editor) return;
      const markdown = String(editor.getDocument('markdown') ?? '');
      await onArgsChange?.({ ...args, instruction: markdown, criteriaDescription: markdown });
    }, [editor, onArgsChange, args]);
    const saveInstructionRef = useRef(saveInstruction);
    saveInstructionRef.current = saveInstruction;

    const handleInstructionChange = useCallback(() => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => void saveInstructionRef.current(), 800);
    }, []);

    useEffect(
      () => registerBeforeApprove?.('createGoal', () => saveInstructionRef.current()),
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
