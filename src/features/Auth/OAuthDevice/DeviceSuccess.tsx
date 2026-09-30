'use client';

import { CircleCheckIcon } from 'lucide-react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

const DeviceSuccess = memo(() => {
  const { t } = useTranslation('oauth');

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="default">{<CircleCheckIcon size={96} />}</EmptyMedia>
        <EmptyTitle>
          {<div className="text-[32px] font-bold">{t('device.success.title')}</div>}
        </EmptyTitle>
        <EmptyDescription>
          {
            <div className="text-[16px] text-muted-foreground">
              {t('device.success.description')}
            </div>
          }
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
});

DeviceSuccess.displayName = 'DeviceSuccess';

export default DeviceSuccess;
