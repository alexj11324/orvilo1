'use client';

import { LoaderCircle } from 'lucide-react';
import { createElement } from 'react';
import { useTranslation } from 'react-i18next';

const CircleLoading = () => {
  const { t } = useTranslation('common');
  return (
    <div
      className={'flex flex-col items-center justify-center'}
      style={{ height: '100%', width: '100%' }}
    >
      <div className={'flex flex-col gap-2 items-center'}>
        <div>{createElement(LoaderCircle, { size: 16 })}</div>
        <div className="text-muted-foreground" style={{ letterSpacing: '0.1em' }}>
          {t('loading')}
        </div>
      </div>
    </div>
  );
};

export default CircleLoading;
