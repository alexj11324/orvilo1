'use client';

import { cn } from 'cn';
import { memo } from 'react';

import type { AskUserQuestionItem } from './types';

const styles = {
  // Preserve the tertiary answer tone separately from the secondary badge tone.
  answer: 'text-sm leading-[1.5] text-(--ant-color-text-tertiary) [overflow-wrap:anywhere]',
  container: '[padding-block:8px_4px]',
  divider: 'self-stretch h-px [margin-block:4px] bg-selected',
  header:
    'shrink-0 [padding-inline:8px] rounded-(--radius-chip) text-xs font-normal leading-5 text-(--ant-color-text-tertiary) whitespace-nowrap bg-(--ant-color-fill-quaternary)',
  ordinal:
    'shrink-0 box-border w-7 h-5 rounded-(--radius-chip) font-mono text-xs tabular-nums leading-5 text-(--ant-color-text-tertiary) text-center bg-(--ant-color-fill-quaternary)',
  question: 'text-sm font-normal leading-[1.5] text-foreground [overflow-wrap:anywhere]',
  questionContent: 'min-w-0',
  recommendedBadge:
    'shrink-0 [padding-block:1px] [padding-inline:8px] rounded-[999px] text-[11px] leading-[18px] text-muted-foreground bg-selected',
  titleRow: 'flex flex-wrap gap-2 items-baseline',
  unanswered: 'text-sm leading-[1.5] text-(--ant-color-text-quaternary)',
};

export interface AskUserQuestionResultLabels {
  noAnswer: string;
  notAnswered: string;
  /** Badge text for a chosen option carrying the recommended marker. */
  recommendedTag: string;
  supplement: string;
}

interface QuestionAnswerProps {
  answer?: string | string[];
  index?: number;
  notAnswered: string;
  question: AskUserQuestionItem;
  recommendedTag: string;
}

const QuestionAnswer = memo<QuestionAnswerProps>(
  ({ question, answer, index, notAnswered, recommendedTag }) => {
    const labels: string[] = Array.isArray(answer) ? answer : answer ? [answer] : [];
    const isRecommended = (label: string) =>
      question.options.some((o) => o.label === label && o.recommended);

    return (
      <div className="flex items-start gap-2">
        {!!index && <span className={styles.ordinal}>{`Q${index}`}</span>}
        <div className={cn('flex', 'flex-col', 'flex-1', 'gap-1', styles.questionContent)}>
          <div className={index ? styles.titleRow : undefined}>
            <span className={styles.question}>{question.question}</span>
            {!!index && question.header && <span className={styles.header}>{question.header}</span>}
          </div>
          {labels.length > 0 ? (
            labels.map((label) => (
              <div className="flex items-center gap-2" key={label}>
                <span className={styles.answer}>{label}</span>
                {isRecommended(label) && (
                  <span className={styles.recommendedBadge}>{recommendedTag}</span>
                )}
              </div>
            ))
          ) : (
            <span className={styles.unanswered}>{notAnswered}</span>
          )}
        </div>
      </div>
    );
  },
);

QuestionAnswer.displayName = 'AskUserQuestionResultQuestionAnswer';

export interface AskUserQuestionResultProps {
  answers?: Record<string, string | string[]>;
  isError?: boolean;
  labels: AskUserQuestionResultLabels;
  questions: AskUserQuestionItem[];
}

/**
 * Read-only result for a completed AskUserQuestion call.
 *
 * The enclosing tool already supplies the card chrome, so this view stays flat
 * and uses question/answer typography instead of nesting another panel.
 */
export const AskUserQuestionResult = memo<AskUserQuestionResultProps>(
  ({ answers, isError, labels, questions }) => {
    const freeform = answers?.__freeform__;
    const freeformText = typeof freeform === 'string' ? freeform.trim() : '';
    const supplement = answers?.__supplement__;
    const supplementText = typeof supplement === 'string' ? supplement.trim() : '';
    const multiple = questions.length > 1;

    if (freeformText) {
      return (
        <div className={cn('flex', 'flex-col', 'gap-4', styles.container)}>
          {questions.map((question, index) => (
            <div className="flex items-start gap-2" key={`${question.question}-${index}`}>
              {multiple && <span className={styles.ordinal}>{`Q${index + 1}`}</span>}
              <div
                className={`${styles.questionContent} ${multiple ? styles.titleRow : ''}`.trim()}
              >
                <span className={styles.question}>{question.question}</span>
                {multiple && question.header && (
                  <span className={styles.header}>{question.header}</span>
                )}
              </div>
            </div>
          ))}
          {multiple && <div className={styles.divider} />}
          <span className={styles.answer}>{freeformText}</span>
          {isError && <div className="text-warning">{labels.noAnswer}</div>}
        </div>
      );
    }

    return (
      <div className={cn('flex', 'flex-col', 'gap-4', styles.container)}>
        {questions.map((question, index) => (
          <QuestionAnswer
            answer={answers?.[question.question]}
            index={multiple ? index + 1 : undefined}
            key={`${question.question}-${index}`}
            notAnswered={labels.notAnswered}
            question={question}
            recommendedTag={labels.recommendedTag}
          />
        ))}
        {supplementText && (
          <div className="flex flex-col gap-1">
            <span className={styles.header}>{labels.supplement}</span>
            <span className={styles.answer}>{supplementText}</span>
          </div>
        )}
        {isError && <div className="text-warning">{labels.noAnswer}</div>}
      </div>
    );
  },
);

AskUserQuestionResult.displayName = 'AskUserQuestionResult';

export default AskUserQuestionResult;
