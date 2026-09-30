'use client';

// Highlighter is intentionally avoided: it pulls every shiki grammar (~10 MB) into the auth bundle
import { Button, Result, Text } from '@lobehub/ui/base-ui';
import { FrownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

const FailedPage = () => {
  const { t } = useTranslation('oauth');
  const [searchParams] = useSearchParams();

  const reason = searchParams.get('reason');
  const errorMessage = searchParams.get('errorMessage');

  return (
    <Result
      icon={<FrownIcon size={96} />}
      status="error"
      extra={
        <a href="/">
          <Button block size={'large'} style={{ minWidth: 240 }}>
            {t('error.backToHome')}
          </Button>
        </a>
      }
      subTitle={
        <div className="flex flex-col gap-2">
          <Text fontSize={16} type="secondary">
            {t('error.desc', {
              reason: t(`error.reason.${reason}` as any, { defaultValue: reason ?? '' }),
            })}
          </Text>
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
      title={
        <Text fontSize={32} weight={'bold'}>
          {t('error.title')}
        </Text>
      }
    />
  );
};

export default FailedPage;
