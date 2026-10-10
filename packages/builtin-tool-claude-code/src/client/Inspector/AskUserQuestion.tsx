'use client';

import { normalizeAskUserQuestions } from '@orvilo/shared-tool-ui/ask-user';
import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { AskUserQuestionArgs } from '../../types';
import { ClaudeCodeApiName } from '../../types';

/**
 * A tool card in the message list is ~470px wide, leaving ~210px for the chips.
 * Two headers fit at their natural width; a third forces all of them to shrink and
 * every chip ellipsizes to two characters, which says less than showing fewer. So
 * cap at two and fold the rest into `+N` — fewer, fully legible beats more, truncated.
 */
const MAX_CHIPS = 2;

const styles = {
  chip: 'overflow-hidden min-w-0 py-0.5 px-2.5 rounded-[999px] text-[12px] text-foreground text-ellipsis whitespace-nowrap bg-accent',
  chips: 'overflow-hidden flex gap-1 items-center min-w-0 ms-1.5',
  /** Never shrinks — the chips absorb the compression and ellipsize instead. */
  label: 'shrink-0',
  more: 'shrink-0 text-[12px] text-[var(--ant-color-text-tertiary)]',
};

export const AskUserQuestionInspector = memo<BuiltinInspectorProps<AskUserQuestionArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t(ClaudeCodeApiName.AskUserQuestion as any);
    const argsQuestions = normalizeAskUserQuestions(args);
    const questions = argsQuestions.length ? argsQuestions : normalizeAskUserQuestions(partialArgs);

    // One chip per question, so a collapsed card still says *what* was asked. The
    // old `header +N` named only the first and turned the rest into a count.
    const headers = questions
      .map((q) => q.header || q.question)
      .filter((header): header is string => !!header);
    const shown = headers.slice(0, MAX_CHIPS);
    const rest = headers.length - shown.length;

    if (isArgumentsStreaming && shown.length === 0) {
      return <div className={cn(inspectorTextStyles.root, shinyTextStyles.shinyText)}>{label}</div>;
    }

    return (
      <div className={inspectorTextStyles.root}>
        <span
          className={cn(
            styles.label,
            (isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText,
          )}
        >
          {label}
        </span>
        {shown.length > 0 && (
          <div className={styles.chips}>
            {shown.map((header, idx) => (
              <span className={styles.chip} key={`${header}-${idx}`}>
                {header}
              </span>
            ))}
            {rest > 0 && <span className={styles.more}>{`+${rest}`}</span>}
          </div>
        )}
      </div>
    );
  },
);

AskUserQuestionInspector.displayName = 'ClaudeCodeAskUserQuestionInspector';
