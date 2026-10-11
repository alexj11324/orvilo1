'use client';

import { normalizeAskUserQuestions } from '@orvilo/shared-tool-ui/ask-user';
import { inspectorTextStyles, shinyTextStyles } from '@orvilo/shared-tool-ui/styles';
import type { BuiltinInspectorProps } from '@orvilo/types';
import { cx } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { AskUserQuestionArgs } from '../../../types';

const styles = {
  chip: 'overflow-hidden min-w-0 ms-1.5 py-0.5 px-2.5 rounded-(--radius-chip) text-xs leading-5 text-foreground text-ellipsis whitespace-nowrap bg-muted',
};

export const AskUserQuestionInspector = memo<BuiltinInspectorProps<AskUserQuestionArgs>>(
  ({ args, partialArgs, isArgumentsStreaming, isLoading }) => {
    const { t } = useTranslation('plugin');
    const label = t('builtins.orvilo-user-interaction.apiName.askUserQuestion');
    const argsQuestions = normalizeAskUserQuestions(args);
    const questions = argsQuestions.length ? argsQuestions : normalizeAskUserQuestions(partialArgs);
    const firstQuestion = questions[0];
    const firstSummary = firstQuestion?.header || firstQuestion?.question;
    const summary =
      questions.length > 1 && firstSummary
        ? `${firstSummary} +${questions.length - 1}`
        : firstSummary;

    if (isArgumentsStreaming && !summary) {
      return (
        <div
          className={cx(inspectorTextStyles.root, shinyTextStyles.shinyText, 'text-sm leading-5.5')}
          data-testid="ask-user-question-inspector"
        >
          {label}
        </div>
      );
    }

    return (
      <div
        className={cx(inspectorTextStyles.root, 'text-sm leading-5.5')}
        data-testid="ask-user-question-inspector"
      >
        <span className={cx((isArgumentsStreaming || isLoading) && shinyTextStyles.shinyText)}>
          {label}
        </span>
        {summary && <span className={styles.chip}>{summary}</span>}
      </div>
    );
  },
);

AskUserQuestionInspector.displayName = 'AskUserQuestionInspector';

export default AskUserQuestionInspector;
