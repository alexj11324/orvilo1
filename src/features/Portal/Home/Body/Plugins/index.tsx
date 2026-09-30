import { Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ArtifactList from './ArtifactList';

export const Artifacts = memo(() => {
  const { t } = useTranslation('portal');

  return (
    <div className="flex flex-col gap-2">
      <Text as={'h5'} style={{ marginInline: 12 }}>
        {t('Plugins')}
      </Text>
      <ArtifactList />
    </div>
  );
});

export default Artifacts;
