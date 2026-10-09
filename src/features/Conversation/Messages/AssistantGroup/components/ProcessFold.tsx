import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';

interface ProcessFoldProps {
  children: ReactNode;
  defaultExpanded?: boolean;
  durationText?: string;
  stepCount: number;
}

/** The process alone collapses; the persisted final answer remains outside. */
const ProcessFold = memo<ProcessFoldProps>(
  ({ children, durationText, stepCount, defaultExpanded = false }) => {
    const { t } = useTranslation('chat');
    return (
      <ChainOfThought defaultOpen={defaultExpanded}>
        <ChainOfThoughtHeader>
          {durationText
            ? t('turnProcess.ranFor', { count: stepCount, duration: durationText })
            : t('turnProcess.done', { count: stepCount })}
        </ChainOfThoughtHeader>
        <ChainOfThoughtContent>{children}</ChainOfThoughtContent>
      </ChainOfThought>
    );
  },
);

ProcessFold.displayName = 'ProcessFold';
export default ProcessFold;
