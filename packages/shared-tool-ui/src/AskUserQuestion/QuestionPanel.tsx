'use client';

import { cn } from 'cn';
import { memo } from 'react';

import { Textarea } from '@/components/ui/textarea';

import { OptionCard } from '../components';
import type { AskUserQuestionItem } from './types';

const styles = {
  // Keep the free-text row aligned with OptionCard's numbered options.
  customRow: '[margin-block-start:2px] [padding-inline:12px]',
  index:
    'shrink-0 box-border size-[22px] rounded-(--radius-input) font-mono text-xs font-semibold leading-[22px] text-muted-foreground text-center bg-accent',
};

interface QuestionPanelProps {
  /** The picked option id(s), falling back to labels for legacy options. */
  answer: string | string[] | undefined;
  /** Placeholder for the trailing "write your own" free-text row. */
  customPlaceholder: string;
  /** The free-text "write your own" value for this question. */
  customValue: string;
  disabled: boolean;
  /** 0-based keyboard cursor over the option rows (↑/↓ navigation), if any. */
  highlightedIndex?: number;
  /** Tag shown next to the header when the question is multi-select. */
  multiSelectTag: string;
  onCustomChange: (q: AskUserQuestionItem, value: string) => void;
  /**
   * Arrow-key hand-off from the free-text row back into the option list:
   * `prev` fires on ↑ at the very start of the text, `next` on ↓ with the box
   * empty — anywhere else the arrows keep their native caret behavior.
   */
  onCustomNavigate?: (direction: 'next' | 'prev') => void;
  /**
   * Submit the whole form from the free-text box on Enter (Shift+Enter still
   * inserts a newline). Pass `undefined` while submit is unavailable so Enter
   * falls back to the default newline behavior.
   */
  onPressEnter?: () => void;
  onToggle: (q: AskUserQuestionItem, value: string) => void;
  question: AskUserQuestionItem;
  /** Badge text for options carrying the "(Recommended)" label marker. */
  recommendedTag: string;
}

/**
 * A single question: its header/title, the numbered options, and a trailing
 * free-text box so the user can answer in their own words instead of picking.
 *
 * Presentational and i18n-free — the visible strings come in as props so the
 * panel stays app-decoupled and reusable across surfaces.
 */
export const QuestionPanel = memo<QuestionPanelProps>(
  ({
    question,
    answer,
    customValue,
    customPlaceholder,
    disabled,
    highlightedIndex,
    multiSelectTag,
    onToggle,
    onCustomChange,
    onCustomNavigate,
    onPressEnter,
    recommendedTag,
  }) => {
    const isOptionSelected = (value: string): boolean =>
      question.multiSelect ? Array.isArray(answer) && answer.includes(value) : answer === value;

    return (
      <div className="flex flex-col gap-[10px]">
        <div className="flex items-center gap-2">
          {question.header && <div className="text-muted-foreground">{question.header}</div>}
          {question.multiSelect && (
            <div className="text-[12px] text-muted-foreground">{multiSelectTag}</div>
          )}
        </div>
        <div className="font-semibold">{question.question}</div>

        <div className="flex flex-col gap-1" role="listbox">
          {question.options.map((opt, optIdx) => {
            const value = opt.id ?? opt.label;
            return (
              <OptionCard
                description={opt.description}
                disabled={disabled}
                highlighted={highlightedIndex === optIdx}
                index={optIdx + 1}
                key={value}
                label={opt.label}
                recommendedText={opt.recommended ? recommendedTag : undefined}
                selected={isOptionSelected(value)}
                onToggle={() => onToggle(question, value)}
              />
            );
          })}
          {/* Last item: let the user write their own answer for this question.
              Numbered as the next option so it reads as one more choice. */}
          <div className={cn('flex', 'items-center', 'gap-3', styles.customRow)}>
            <span className={styles.index}>{question.options.length + 1}</span>
            <Textarea
              disabled={disabled}
              placeholder={customPlaceholder}
              style={{ flex: 1 }}
              value={customValue}
              onChange={(e) => onCustomChange(question, e.target.value)}
              onKeyDown={(e) => {
                // The IME guard keeps CJK composition confirms from acting.
                if (e.nativeEvent.isComposing) return;
                if (e.metaKey || e.ctrlKey || e.altKey) return;
                const el = e.currentTarget;
                if (e.key === 'ArrowUp' && onCustomNavigate) {
                  if (el.selectionStart === 0 && el.selectionEnd === 0) {
                    e.preventDefault();
                    el.blur();
                    onCustomNavigate('prev');
                  }
                  return;
                }
                if (e.key === 'ArrowDown' && onCustomNavigate) {
                  if (!el.value) {
                    e.preventDefault();
                    el.blur();
                    onCustomNavigate('next');
                  }
                  return;
                }
                if (e.key !== 'Enter' || e.shiftKey) return;
                if (!onPressEnter) return;
                e.preventDefault();
                onPressEnter();
              }}
            />
          </div>
        </div>
      </div>
    );
  },
);

QuestionPanel.displayName = 'AskUserQuestionPanel';

export default QuestionPanel;
