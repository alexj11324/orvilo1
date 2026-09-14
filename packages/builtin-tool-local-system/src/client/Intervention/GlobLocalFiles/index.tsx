import { Flexbox, Highlighter } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { type GlobFilesParams } from '@orvilo/electron-client-ipc';
import { type BuiltinInterventionProps } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import OutOfScopeWarning from '../OutOfScopeWarning';

const GlobLocalFiles = memo<BuiltinInterventionProps<GlobFilesParams>>(({ args }) => {
  const { t } = useTranslation('tool');
  const { pattern } = args;

  return (
    <Flexbox gap={12}>
      <OutOfScopeWarning paths={[pattern]} />
      <Flexbox gap={4}>
        <Text type="secondary">{t('localFiles.globFiles.pattern')}</Text>
        <Highlighter language="text" showLanguage={false} variant="outlined">
          {pattern}
        </Highlighter>
      </Flexbox>
    </Flexbox>
  );
});

GlobLocalFiles.displayName = 'GlobLocalFilesIntervention';

export default GlobLocalFiles;
