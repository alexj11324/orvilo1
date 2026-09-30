'use client';

import { memo, Suspense } from 'react';

import { usePermission } from '@/hooks/usePermission';

import List from './List';
import Skeleton from './Skeleton';
import { type SuggestMode } from './useRandomQuestions';

interface SuggestQuestionsProps {
  count?: number;
  disabled?: boolean;
  mode: SuggestMode;
}

const SuggestQuestions = memo<SuggestQuestionsProps>(({ mode, count = 3, disabled }) => {
  const { allowed: canCreateContent } = usePermission('create_content');
  const isDisabled = disabled || !canCreateContent;

  return (
    <div className="flex flex-col w-full">
      <Suspense fallback={<Skeleton count={count} />}>
        <List count={count} disabled={isDisabled} mode={mode} />
      </Suspense>
    </div>
  );
});

export default SuggestQuestions;

export { type SuggestMode } from './useRandomQuestions';
