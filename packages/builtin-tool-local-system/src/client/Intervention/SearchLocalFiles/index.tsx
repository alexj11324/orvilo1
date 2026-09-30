import { type LocalSearchFilesParams } from '@orvilo/electron-client-ipc';
import { type BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { LocalFolder } from '@/features/LocalFile';

import OutOfScopeWarning from '../OutOfScopeWarning';

const SearchLocalFiles = memo<BuiltinInterventionProps<LocalSearchFilesParams>>(({ args }) => {
  const { t } = useTranslation('tool');
  const { keywords, scope } = args;

  return (
    <div className="flex flex-col gap-3">
      <OutOfScopeWarning paths={scope ? [scope] : []} />
      {scope && <LocalFolder path={scope} />}
      <div className="text-muted-foreground">
        {t('localFiles.searchFiles.keywords')}: {keywords}
      </div>
    </div>
  );
});

SearchLocalFiles.displayName = 'SearchLocalFilesIntervention';

export default SearchLocalFiles;
