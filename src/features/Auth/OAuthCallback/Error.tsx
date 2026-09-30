'use client';

// Highlighter is intentionally avoided: it pulls every shiki grammar (~10 MB) into the auth bundle
import { FrownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

const FailedPage = () => {
  const { t } = useTranslation('oauth');
  const [searchParams] = useSearchParams();

  const reason = searchParams.get('reason');
  const errorMessage = searchParams.get('errorMessage');

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="default">{<FrownIcon size={96} />}</EmptyMedia>
        <EmptyTitle>{<div className="text-[32px] font-bold">{t('error.title')}</div>}</EmptyTitle>
        <EmptyDescription>
          {
            <div className="flex flex-col gap-2">
              <div className="text-[16px] text-muted-foreground">
                {t('error.desc', {
                  reason: t(`error.reason.${reason}` as any, { defaultValue: reason ?? '' }),
                })}
              </div>
              {!!errorMessage && (
                <div className="flex flex-col p-3" style={{ maxHeight: 240, overflowY: 'auto' }}>
                  <pre
                    style={{
                      fontFamily: 'monospace',
                      margin: 0,
                      overflowX: 'auto',
                      textAlign: 'start',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {errorMessage}
                  </pre>
                </div>
              )}
            </div>
          }
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {
          <a href="/">
            <Button className="w-full" size="lg" style={{ minWidth: 240 }}>
              {t('error.backToHome')}
            </Button>
          </a>
        }
      </EmptyContent>
    </Empty>
  );
};

export default FailedPage;
