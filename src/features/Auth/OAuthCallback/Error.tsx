'use client';

import { cn } from 'cn';
import { FrownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { buttonVariants } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

import { resolveOAuthFailureReason } from './failureReason';

const FailedPage = () => {
  const { t } = useTranslation('oauth');
  const [searchParams] = useSearchParams();

  // Only a known reason code selects copy; no text from the URL is rendered.
  const reason = resolveOAuthFailureReason(searchParams.get('reason'));

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="default">{<FrownIcon size={96} />}</EmptyMedia>
        <EmptyTitle>{<div className="text-[32px] font-bold">{t('error.title')}</div>}</EmptyTitle>
        <EmptyDescription>
          {
            <div className="text-[16px] text-muted-foreground">
              {t(`error.explanation.${reason}`)}
            </div>
          }
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {
          <a
            className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
            href="/"
            style={{ minWidth: 240 }}
          >
            {t('error.backToHome')}
          </a>
        }
      </EmptyContent>
    </Empty>
  );
};

export default FailedPage;
