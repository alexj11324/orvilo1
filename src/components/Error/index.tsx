'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

const Highlighter = lazy(() => import('@/components/Highlighter'));

export type ErrorType = Error & { digest?: string };

interface ErrorCaptureProps {
  error: ErrorType;
  /** Where "back home" navigates; defaults to `/`. */
  resetPath?: string;
}

const ErrorCapture = ({ error, resetPath = '/' }: ErrorCaptureProps) => {
  const { t } = useTranslation('error');
  const hasStack = !!error?.stack;
  const defaultExpandedKeys: string[] = typeof __CI__ !== 'undefined' && __CI__ ? ['stack'] : [];
  const [expandedKeys, setExpandedKeys] = useState<string[]>(defaultExpandedKeys);

  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center justify-center gap-4 p-4 text-foreground">
      <span aria-hidden className="text-2xl">
        🤧
      </span>
      <h1 className="m-0 text-center text-2xl font-semibold">{t('error.title')}</h1>
      <p className="text-center text-sm text-muted-foreground">{t('error.desc')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('error.retry')}
        </Button>
        <Button onClick={() => (window.location.href = resetPath)}>{t('error.backHome')}</Button>
      </div>
      {hasStack && (
        <div
          className={`w-140 max-w-full overflow-hidden rounded-(--radius-card) border transition-[background-color,border-color] duration-(--orvilo-motion-mid) motion-reduce:transition-none ${expandedKeys.includes('stack') ? 'border-border' : 'border-transparent bg-secondary'}`}
        >
          <Accordion value={expandedKeys} onValueChange={setExpandedKeys}>
            <AccordionItem value="stack">
              <AccordionTrigger>{t('error.stack')}</AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={null}>
                  <Highlighter className="p-3" language={'plaintext'} variant={'borderless'}>
                    {error.stack!}
                  </Highlighter>
                </Suspense>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
};

export default ErrorCapture;
