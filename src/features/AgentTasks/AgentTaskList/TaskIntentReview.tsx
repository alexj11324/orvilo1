'use client';

import { OptionCard } from '@orvilo/shared-tool-ui/components';
import type { TaskIntentAnalysis } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import type { ClarificationAnswers } from './taskIntent';

const styles = createStaticStyles(({ css }) => ({
  body: css`
    overflow-y: auto;

    /* Viewport-relative, because the footer holds the only way forward: a fixed
       cap sized for a tall window pushed "create" below the fold on a short one,
       leaving the panel's primary action unreachable without scrolling. The
       question list scrolls inside this box instead, and the footer stays put.
       (The absolute cap is the leftover from the confirm step's instruction
        editor, which no longer exists — the questions never needed it.) */
    max-height: min(420px, 42dvh);
    padding-block: 12px 16px;
    padding-inline: 16px;
  `,
  footer: css`
    padding-block: 8px;
    padding-inline: 8px 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  head: css`
    padding-block: 12px 0;
    padding-inline: 16px;
  `,
  // Mirrors OptionCard's own index chip so the free-text row reads as one more
  // numbered choice rather than a separate control below the list.
  customIndex: css`
    flex-shrink: 0;

    box-sizing: border-box;
    width: 22px;
    height: 22px;
    border-radius: 6px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    font-weight: 600;
    line-height: 22px;
    color: ${cssVar.colorTextSecondary};
    text-align: center;

    background: ${cssVar.colorFillTertiary};
  `,
  // Reuses OptionCard's row rhythm so the recap reads as the same list the
  // user just answered, not as a different kind of object.
  answerRow: css`
    cursor: pointer;

    padding-block: 8px;
    padding-inline: 12px;
    border-radius: 8px;

    transition: background 0.12s ease;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  customRow: css`
    margin-block-start: 2px;

    /* Align the chip under OptionCard's own index chips. */
    padding-inline: 12px;
  `,
  instruction: css`
    overflow-y: auto;
    max-height: 220px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
  `,
  tabs: css`
    [role='tablist'] {
      width: 100%;
    }
  `,
  title: css`
    box-sizing: border-box;
    width: 100%;
    padding-block: 2px;
    border: none;

    font-family: inherit;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.4;
    color: inherit;

    background: transparent;
    outline: none;
  `,
}));

export interface TaskIntentReviewProps {
  analysis: TaskIntentAnalysis;
  answers: ClarificationAnswers;
  /** True while the brief is being written and the task created. */
  isCreating?: boolean;
  onAnswerChange: (index: number, value: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  /** Omitted when goals are unavailable — the exit is then simply not offered. */
  onTitleChange: (title: string) => void;
  title: string;
}

/**
 * The confirmation step between typing a task and creating it.
 *
 * It only ever renders for a draft the reader could not settle on its own, so
 * everything here is something the user is the only one able to answer. The
 * questions stay optional: skipping them creates exactly the task the composer
 * would have created before, which keeps this a checkpoint rather than a form
 * to fill in. Answering the last one and pressing generate is the whole flow —
 * the brief is written from the answers and the task created in one step.
 */
const TaskIntentReview = memo<TaskIntentReviewProps>((props) => {
  const { analysis, answers, isCreating, onAnswerChange, onBack, onConfirm, onTitleChange, title } =
    props;
  const { t } = useTranslation('chat');

  // One question at a time, exactly like AskUserQuestionView: stacking them all
  // in a scroll box hid both that a next question existed and how to reach it.
  const [activeIndex, setActiveIndex] = useState(0);
  const clarifications = analysis.clarifications;
  // A new reading is a new set of questions, so the cursor goes back to the top
  // rather than pointing past the end of a shorter list.
  useEffect(() => setActiveIndex(0), [clarifications]);

  const isAnswered = useCallback((index: number) => Boolean(answers[index]?.trim()), [answers]);

  // One past the last question: the step that says what answering produced.

  const pickOption = useCallback(
    (index: number, option: string) => {
      // Tapping the option that is already the answer clears it, so a mis-tap
      // doesn't force the user to select the text and delete it by hand.
      const cleared = answers[index] === option;
      onAnswerChange(index, cleared ? '' : option);
      if (cleared) return;

      // Sweep to the next still-unanswered question. When there is none left
      // the form stays put: the primary button already reads "generate", so
      // the step the user is on is also the last thing they have to press.
      const next = clarifications.findIndex((_, i) => i !== index && !answers[i]?.trim());
      if (next >= 0) setActiveIndex(next);
    },
    [answers, clarifications, onAnswerChange],
  );

  const active = clarifications[activeIndex];
  const onLastQuestion = activeIndex >= clarifications.length - 1;

  // The primary button names the step it is on: advancing through the
  // questions, then generating. There is no confirmation page between the last
  // answer and the task — pressing generate writes the brief from the answers
  // and creates it, and the brief is on the task's own page afterwards.
  // One label for the last step, whether or not anything was answered. Naming
  // it for the machinery behind it ("generate") described what the product does
  // rather than what the user gets: either way the press ends with a task.
  const primary = onLastQuestion
    ? { action: onConfirm, label: t('taskIntent.create') }
    : { action: () => setActiveIndex(activeIndex + 1), label: t('taskIntent.next') };

  return (
    <>
      <div className={`flex flex-col gap-1.5 ${styles.head}`}>
        <div className="flex items-center gap-1.5">
          <Sparkles color={cssVar.colorTextDescription} size={13} />
          <div className="text-[12px] text-muted-foreground">{t('taskIntent.reviewStep')}</div>
        </div>
        <input
          className={styles.title}
          placeholder={t('createTask.titlePlaceholder')}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </div>

      <div className={`flex flex-col gap-4 ${styles.body}`}>
        <div className="text-sm text-muted-foreground">{analysis.summary}</div>

        {clarifications.length > 0 && (
          <Tabs
            className={styles.tabs}
            value={String(activeIndex)}
            onValueChange={(key) => setActiveIndex(Number(key))}
          >
            <TabsList>
              {clarifications.map((_, index) => (
                <TabsTrigger key={index} value={String(index)}>
                  <span className="inline-flex items-center gap-1.5">
                    <div>{`Q${index + 1}`}</div>
                    {isAnswered(index) && <Check size={12} />}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {active &&
          (() => {
            const index = activeIndex;
            const options = active.options ?? [];
            // An answer that isn't one of the offered options is the user's own
            // wording, so it belongs in the free-text row rather than leaving
            // every card unselected with the text stranded elsewhere.
            const picked = options.includes(answers[index] ?? '') ? answers[index] : undefined;
            const custom = picked === undefined ? (answers[index] ?? '') : '';

            return (
              <div className="flex flex-col gap-2.5" key={active.question}>
                <div className="flex flex-col gap-0.5">
                  <div className="font-semibold">{active.question}</div>
                  {active.impact && (
                    <div className="text-[12px] text-muted-foreground">{active.impact}</div>
                  )}
                </div>

                <div className="flex flex-col gap-1" role={'listbox'}>
                  {options.map((option, optionIndex) => (
                    <OptionCard
                      index={optionIndex + 1}
                      key={option}
                      label={option}
                      selected={picked === option}
                      onToggle={() => pickOption(index, option)}
                    />
                  ))}
                  <div className={`flex items-center gap-3 ${styles.customRow}`}>
                    <span className={styles.customIndex}>{options.length + 1}</span>
                    <Textarea
                      className="min-h-0"
                      placeholder={t('taskIntent.answerPlaceholder')}
                      rows={1}
                      style={{ flex: 1, maxHeight: 116 }}
                      value={custom}
                      onChange={(e) => onAnswerChange(index, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      <div className={`flex items-center justify-between ${styles.footer}`}>
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {t('taskIntent.back')}
        </Button>
        <Button
          className="rounded-full"
          disabled={isCreating}
          loading={isCreating}
          size="sm"
          variant="default"
          onClick={primary.action}
        >
          {primary.label}
        </Button>
      </div>
    </>
  );
});

export default TaskIntentReview;
