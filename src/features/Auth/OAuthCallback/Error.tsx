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
        <EmptyTitle>{<div className="text-3xl font-semibold">{t('error.title')}</div>}</EmptyTitle>
        <EmptyDescription>
          {
            <div className="text-sm leading-5.5 text-muted-foreground">
              {t(`error.explanation.${reason}`)}
            </div>
          }
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {
          <a
            href="/"
            className={cn(
              buttonVariants({ size: 'normal' }),
              'min-h-9 h-auto w-full min-w-60 whitespace-normal text-center',
            )}
          >
            {t('error.backToHome')}
          </a>
        }
      </EmptyContent>
    </Empty>
  );
};

export default FailedPage;
