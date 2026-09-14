'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { BuiltinPortalTitleProps } from '@orvilo/types';
import { Globe } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

/** Portal header for the web-browsing tool. */
const PortalTitle = memo<BuiltinPortalTitleProps>(() => {
  const { t } = useTranslation('plugin');

  return (
    <Flexbox horizontal align={'center'} gap={8}>
      <Icon icon={Globe} size={16} />
      <Text style={{ fontSize: 16 }} type={'secondary'}>
        {t('search.title')}
      </Text>
    </Flexbox>
  );
});

PortalTitle.displayName = 'WebBrowsingPortalTitle';

export default PortalTitle;
