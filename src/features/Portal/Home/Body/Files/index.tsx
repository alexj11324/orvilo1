import { Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import FileList from './FileList';

export const Files = memo(() => {
  const { t } = useTranslation('portal');

  return (
    <div className="flex flex-col gap-2">
      <Text as={'h5'} style={{ marginInline: 12 }}>
        {t('files')}
      </Text>
      <FileList />
    </div>
  );
});

export default Files;
