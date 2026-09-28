'use client';

import { Center, Empty } from '@lobehub/ui';
import { FileTextIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Linear's Documents tab. There is no team-scoped documents source today —
 * `document.queryDocuments` lists workspace/KB files with no `teamId`
 * predicate, and no team-resources domain exists — so the tab renders an
 * honest empty state instead of a populated fake or a dead composer button.
 */
const TeamHomeDocuments = memo(() => {
  const { t } = useTranslation('common');

  return (
    <Center flex={1} padding={48}>
      <Empty description={t('teams.documentsEmpty')} icon={FileTextIcon} />
    </Center>
  );
});

TeamHomeDocuments.displayName = 'TeamHomeDocuments';

export default TeamHomeDocuments;
