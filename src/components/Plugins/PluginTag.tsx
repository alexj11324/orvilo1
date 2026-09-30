import { BadgeCheck, CircleUser, Package } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';

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
      <Badge size="sm" variant="warning">
        {showIcon && createElement(Package, { size: 16 })}
        {t('store.customPlugin')}
      </Badge>
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
      <Badge size="sm" variant={isOfficial ? 'success' : 'secondary'}>
        {showIcon && createElement(isOfficial ? BadgeCheck : CircleUser, { size: 16 })}
        {showText && (author || t('store.communityPlugin'))}
      </Badge>
    );
  },
);

export default PluginTag;
