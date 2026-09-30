'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const Title = memo(() => {
  const { t } = useTranslation('portal');

  return (
    <div className="text-muted-foreground" style={{ fontSize: 16 }}>
      {t('title')}
    </div>
  );
});

export default Title;
