'use client';

import { CircleCheckIcon } from 'lucide-react';
import React, { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

const SuccessPage = memo(() => {
  const { t } = useTranslation('oauth');
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // Check if this is a Orvilo Skill OAuth callback
    const provider = searchParams.get('provider');

    if (provider && window.opener) {
      // Notify parent window about successful OAuth
      window.opener.postMessage(
        {
          provider,
          type: 'ORVILO_SKILL_AUTH_SUCCESS',
        },
        window.location.origin,
      );

      // Start countdown and close window after 3 seconds
      let timeLeft = 3;
      setCountdown(timeLeft);

      const countdownTimer = setInterval(() => {
        timeLeft -= 1;
        setCountdown(timeLeft);

        if (timeLeft <= 0) {
          clearInterval(countdownTimer);
          window.close();
        }
      }, 1000);

      return () => clearInterval(countdownTimer);
    }
  }, [searchParams]);

  const provider = searchParams.get('provider');

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="default">{<CircleCheckIcon size={96} />}</EmptyMedia>
        <EmptyTitle>{<div className="text-[32px] font-bold">{t('success.title')}</div>}</EmptyTitle>
        <EmptyDescription>
          {
            <div className="text-[16px] text-muted-foreground">
              {provider
                ? t('success.subTitleWithCountdown', {
                    countdown,
                    defaultValue: `You may close this page. Auto-closing in ${countdown}s...`,
                  })
                : t('success.subTitle')}
            </div>
          }
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
});

SuccessPage.displayName = 'SuccessPage';

export default SuccessPage;
