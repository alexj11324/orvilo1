import { BlocksIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';

const EmptyState = memo(() => {
  const { t } = useTranslation('setting');

  return (
    <Empty style={{ paddingBlock: 40 }}>
      <EmptyHeader>
        <EmptyMedia variant={'icon'}>
          <BlocksIcon />
        </EmptyMedia>
        <EmptyDescription>
          {t('tools.installed.empty', { defaultValue: 'No skills enabled' })}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
});

EmptyState.displayName = 'ProfileEditorEmpty';

export default EmptyState;
