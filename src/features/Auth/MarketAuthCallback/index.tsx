'use client';

import { CircleCheckIcon, FrownIcon, HourglassIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { persistMarketAuthResult } from '@/layout/AuthProvider/MarketAuth/handoff';

type CallbackStatus = 'loading' | 'success' | 'error';

const MarketAuthCallbackPage = () => {
  const { t } = useTranslation('marketAuth');
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    console.info('[MarketAuthCallback] Processing authorization callback');

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (error) {
      console.error('[MarketAuthCallback] Authorization error:', error, errorDescription);
      setStatus('error');
      setMessage(t('callback.messages.authFailed', { error: errorDescription || error }));

      persistMarketAuthResult({
        error: errorDescription || error,
        state: state || undefined,
        type: 'MARKET_AUTH_ERROR',
      });

      // Send error message to parent window
      if (window.opener) {
        window.opener.postMessage(
          {
            error: errorDescription || error,
            state,
            type: 'MARKET_AUTH_ERROR',
          },
          window.location.origin,
        );
      }
      return;
    }

    if (code && state) {
      console.info('[MarketAuthCallback] Authorization successful, code received');
      setStatus('success');
      setMessage(t('callback.messages.successWithRedirect'));

      persistMarketAuthResult({
        code,
        state,
        type: 'MARKET_AUTH_SUCCESS',
      });

      // Send success message to parent window
      if (window.opener) {
        window.opener.postMessage(
          {
            code,
            state,
            type: 'MARKET_AUTH_SUCCESS',
          },
          window.location.origin,
        );
      }

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
    } else {
      console.error('[MarketAuthCallback] Missing code or state parameter');
      setStatus('error');
      setMessage(t('callback.messages.missingParams'));

      persistMarketAuthResult({
        error: 'Missing authorization parameters',
        state: state || undefined,
        type: 'MARKET_AUTH_ERROR',
      });

      if (window.opener) {
        window.opener.postMessage(
          {
            error: 'Missing authorization parameters',
            state,
            type: 'MARKET_AUTH_ERROR',
          },
          window.location.origin,
        );
      }
    }
  }, [t]);

  const getStatusIcon = () => {
    switch (status) {
      case 'success': {
        return <CircleCheckIcon size={96} />;
      }
      case 'error': {
        return <FrownIcon size={96} />;
      }
      default: {
        return <HourglassIcon size={96} />;
      }
    }
  };

  const getTitle = () => {
    switch (status) {
      case 'loading': {
        return t('callback.titles.loading');
      }
      case 'success': {
        return t('callback.titles.success');
      }
      case 'error': {
        return t('callback.titles.error');
      }
    }
  };

  const getSubTitle = () => {
    if (status === 'loading') {
      return t('callback.messages.processing');
    }
    if (status === 'success') {
      return t('callback.messages.successWithCountdown', { countdown, message });
    }
    return message;
  };

  const getExtra = () => {
    if (status === 'error') {
      return (
        <Button
          className="w-full"
          size="lg"
          style={{ minWidth: 240 }}
          onClick={() => window.close()}
        >
          {t('callback.buttons.close')}
        </Button>
      );
    }
    return undefined;
  };

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="default">{getStatusIcon()}</EmptyMedia>
        <EmptyTitle>{<div className="text-[32px] font-bold">{getTitle()}</div>}</EmptyTitle>
        <EmptyDescription>
          {<div className="text-[16px] text-muted-foreground">{getSubTitle()}</div>}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{getExtra()}</EmptyContent>
    </Empty>
  );
};

export default MarketAuthCallbackPage;
