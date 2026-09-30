'use client';

import { type ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MAX_WIDTH } from '@/const/layoutTokens';

const NotFound = memo<{
  desc?: string;
  extra?: ReactNode;
  hideWatermark?: boolean;
  status?: number | string;
  title?: string;
}>(({ extra, hideWatermark, status = 404, title, desc }) => {
  const { t } = useTranslation('error');
  return (
    <div
      className={'flex flex-col items-center justify-center'}
      style={{ minHeight: '100%', width: '100%' }}
    >
      {!hideWatermark && (
        <h1
          style={{
            filter: 'blur(8px)',
            fontSize: `min(${MAX_WIDTH / 3}px, 50vw)`,
            fontWeight: 'bolder',
            margin: 0,
            opacity: 0.12,
            position: 'absolute',
            zIndex: 0,
          }}
        >
          {status}
        </h1>
      )}
      <span style={{ fontSize: 64, lineHeight: 1 }}>👀</span>
      <h2 style={{ fontWeight: 'bold', marginTop: '1em', textAlign: 'center' }}>
        {title || t('notFound.title')}
      </h2>
      <div style={{ lineHeight: '1.8', marginBottom: '2em', textAlign: 'center' }}>
        <div>{desc || t('notFound.desc')}</div>
        <div style={{ marginTop: '0.5em' }}>{t('notFound.check')}</div>
      </div>
      {extra || (
        <Button type={'primary'} onClick={() => (window.location.href = '/')}>
          {t('notFound.backHome')}
        </Button>
      )}
    </div>
  );
});

NotFound.displayName = 'NotFound';

export default NotFound;
