'use client';

import { CircleAlert, X } from 'lucide-react';
import { lazy, memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const Highlighter = lazy(() => import('@/components/Highlighter'));

interface AlertFallbackProps {
  error: Error;
  resetErrorBoundary: (...args: unknown[]) => void;
  title?: string;
}

const AlertFallback = memo<AlertFallbackProps>(({ error, resetErrorBoundary, title }) => {
  const { t } = useTranslation();
  return (
    <Alert className="relative w-full overflow-hidden">
      <CircleAlert className="size-4" />
      <AlertTitle>{title || t('error.title', { ns: 'error' })}</AlertTitle>
      <AlertDescription>{error?.message || t('error.desc', { ns: 'error' })}</AlertDescription>
      {error?.stack ? (
        <Suspense fallback={null}>
          <Highlighter
            actionIconSize="small"
            className="p-2"
            language="plaintext"
            variant="borderless"
          >
            {error.stack}
          </Highlighter>
        </Suspense>
      ) : undefined}
      <Button
        aria-label={t('close', { ns: 'common' })}
        className="absolute end-2 top-2"
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={resetErrorBoundary}
      >
        <X className="size-4" />
      </Button>
    </Alert>
  );
});

AlertFallback.displayName = 'AlertFallback';

export default AlertFallback;
