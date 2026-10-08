'use client';

import { useTranslation } from 'react-i18next';

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

const GoalEmptyState = () => {
  const { t } = useTranslation('chat');
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{t('goalEmpty.recordsTitle')}</EmptyTitle>
        <EmptyDescription>{t('goalEmpty.recordsDescription')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
};

export default GoalEmptyState;
