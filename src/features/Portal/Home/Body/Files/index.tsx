import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import FileList from './FileList';

export const Files = memo(() => {
  const { t } = useTranslation('portal');

  return (
    <div className="flex flex-col gap-2">
      <h5 style={{ marginInline: 12 }}>{t('files')}</h5>
      <FileList />
    </div>
  );
});

export default Files;
