'use client';

import { Text } from '@lobehub/ui/base-ui';
import type { BuiltinPortalTitleProps } from '@orvilo/types';
import { Globe } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

/** Portal header for the web-browsing tool. */
const PortalTitle = memo<BuiltinPortalTitleProps>(() => {
  const { t } = useTranslation('plugin');

  return (
    <div className="flex flex-row items-center gap-2">
      <span className="anticon" role="img">
        <Globe fill={'transparent'} height={16} size={16} width={16} />
      </span>
      <Text style={{ fontSize: 16 }} type={'secondary'}>
        {t('search.title')}
      </Text>
    </div>
  );
});

PortalTitle.displayName = 'WebBrowsingPortalTitle';

export default PortalTitle;
