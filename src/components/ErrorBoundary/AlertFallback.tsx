'use client';

import { CircleAlert, X } from 'lucide-react';
import { lazy, memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const Highlighter = lazy(() => import('@lobehub/ui/es/Highlighter/index'));

interface AlertFallbackProps {
  error: Error;
  resetErrorBoundary: (...args: unknown[]) => void;
  title?: string;
}

const AlertFallback = memo<AlertFallbackProps>(({ error, resetErrorBoundary, title }) => {
  const { t } = useTranslation();
  return (
    <Alert style={{ overflow: 'hidden', position: 'relative', width: '100%' }}>
      <CircleAlert size={16} />
      <AlertTitle>{title || 'Render Error'}</AlertTitle>
      <AlertDescription>{error?.message || 'An unknown error occurred'}</AlertDescription>
      {error?.stack ? (
        <Suspense fallback={null}>
          <Highlighter actionIconSize="small" language="plaintext" padding={8} variant="borderless">
            {error.stack}
          </Highlighter>
        </Suspense>
      ) : undefined}
      <button
        aria-label={t('close', { ns: 'common' })}
        style={{ position: 'absolute', right: 8, top: 8 }}
        type="button"
        onClick={resetErrorBoundary}
      >
        <X size={16} />
      </button>
    </Alert>
  );
});

AlertFallback.displayName = 'AlertFallback';

export default AlertFallback;
