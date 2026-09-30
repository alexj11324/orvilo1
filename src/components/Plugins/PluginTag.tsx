import { Tag } from '@lobehub/ui/base-ui';
import { BadgeCheck, CircleUser, Package } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import MCPTag from './MCPTag';

interface PluginTagProps {
  author?: string;
  isMCP?: boolean;
  showIcon?: boolean;
  showText?: boolean;
  type: 'builtin' | 'customPlugin' | 'plugin';
}

const PluginTag = memo<PluginTagProps>(
  ({ showIcon = true, author, type, showText = true, isMCP }) => {
    const { t } = useTranslation('plugin');
    const isCustom = type === 'customPlugin';
    const isOfficial = author === 'Orvilo';

    const customTag = (
      <Tag color={'warning'} icon={showIcon && createElement(Package, { size: 16 })} size={'small'}>
        {t('store.customPlugin')}
      </Tag>
    );

    if (isMCP) {
      return (
        <>
          <MCPTag showIcon={showIcon} showText={false} />
          {isCustom && customTag}
        </>
      );
    }

    if (isCustom) return customTag;

    return (
      <Tag
        color={isOfficial ? 'success' : undefined}
        icon={showIcon && createElement(isOfficial ? BadgeCheck : CircleUser, { size: 16 })}
        size={'small'}
      >
        {showText && (author || t('store.communityPlugin'))}
      </Tag>
    );
  },
);

export default PluginTag;
