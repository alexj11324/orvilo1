import { Flexbox } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
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
    <Flexbox gap={12}>
      <OutOfScopeWarning paths={scope ? [scope] : []} />
      {scope && <LocalFolder path={scope} />}
      <Text type="secondary">
        {t('localFiles.searchFiles.keywords')}: {keywords}
      </Text>
    </Flexbox>
  );
});

SearchLocalFiles.displayName = 'SearchLocalFilesIntervention';

export default SearchLocalFiles;
