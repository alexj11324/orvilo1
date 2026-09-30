'use client';

import { FrownIcon } from 'lucide-react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

interface ClientProps {
  error: {
    message?: string;
    messageKey?: string;
    title?: string;
    titleKey?: string;
    values?: Record<string, string>;
  };
}

const ConsentClientError = memo<ClientProps>(({ error }) => {
  const { t } = useTranslation('oauth');

  const title = error.titleKey
    ? t(error.titleKey as any, { ...error.values, defaultValue: error.titleKey })
    : error.title;
  const message = error.messageKey
    ? t(error.messageKey as any, { ...error.values, defaultValue: error.messageKey })
    : error.message;

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="default">{<FrownIcon size={96} />}</EmptyMedia>
        <EmptyTitle>{<div className="text-[32px] font-bold">{title}</div>}</EmptyTitle>
        <EmptyDescription>
          {<div className="text-[16px] text-muted-foreground">{message}</div>}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
});

ConsentClientError.displayName = 'ConsentClientError';

export default ConsentClientError;
