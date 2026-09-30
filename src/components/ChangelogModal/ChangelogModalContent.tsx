'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { ScrollArea } from '@/components/ui/scroll-area';
import { changelogKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';

import ChangelogContent from './ChangelogContent';

const SCROLL_HEIGHT = 'min(80vh, 760px)';

const ChangelogModalContent = memo(() => {
  const { t } = useTranslation('common');
  const { data, isLoading } = useSWR(changelogKeys.modalIndex(), () =>
    lambdaClient.changelog.getIndex.query(),
  );

  return (
    <ScrollArea style={{ height: SCROLL_HEIGHT }}>
      {isLoading || !data || data.length === 0 ? (
        <div
          className={'flex flex-col items-center justify-center'}
          style={{ height: SCROLL_HEIGHT }}
        >
          {t('loading')}
        </div>
      ) : (
        <div className={'flex flex-col gap-4 p-4'} style={{ width: '100%' }}>
          <ChangelogContent data={data} />
        </div>
      )}
    </ScrollArea>
  );
});

ChangelogModalContent.displayName = 'ChangelogModalContent';

export default ChangelogModalContent;
