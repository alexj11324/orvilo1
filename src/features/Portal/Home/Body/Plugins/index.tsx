import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ArtifactList from './ArtifactList';

export const Artifacts = memo(() => {
  const { t } = useTranslation('portal');

  return (
    <div className="flex flex-col gap-2">
      <h5 style={{ marginInline: 12 }}>{t('Plugins')}</h5>
      <ArtifactList />
    </div>
  );
});

export default Artifacts;
