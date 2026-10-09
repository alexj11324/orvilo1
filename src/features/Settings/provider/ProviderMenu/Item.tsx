import { BRANDING_PROVIDER } from '@orvilo/business-const';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import Avatar from '@/components/Avatar';
import { ProductLogo } from '@/components/Branding/ProductLogo';
import { ProviderIcon } from '@/components/OrviloIcons';
import { isCustomBranding } from '@/const/version';
import NavItem from '@/features/NavPanel/components/NavItem';
import { type AiProviderListItem } from '@/types/aiProvider';
import { AiProviderSourceEnum } from '@/types/aiProvider';

interface ProviderItemProps extends AiProviderListItem {
  onClick: (id: string) => void;
}

const ProviderItem = memo<ProviderItemProps>(
  ({ id, name, source, enabled, logo, onClick = () => {} }) => {
    const { t } = useTranslation('modelProvider');
    const location = useLocation();

    // Extract providerId from pathname: /settings/provider/xxx -> xxx
    const activeKey = useMemo(() => {
      const pathParts = location.pathname.split('/');
      // pathname is like /settings/provider/all or /settings/provider/openai
      if (pathParts.length >= 4 && pathParts[2] === 'provider') {
        return pathParts[3];
      }
      return null;
    }, [location.pathname]);

    const isCustom = source === AiProviderSourceEnum.Custom;
    const providerIcon =
      isCustom && logo ? (
        <Avatar
          alt={name || id}
          avatar={logo}
          shape={'square'}
          size={22}
          style={{ borderRadius: 4 }}
        />
      ) : isCustomBranding && id === BRANDING_PROVIDER ? (
        <ProductLogo size={24} type={'flat'} />
      ) : (
        <ProviderIcon
          provider={id}
          shape={'square'}
          size={22}
          style={{ borderRadius: 4 }}
          type={'avatar'}
        />
      );

    return (
      <NavItem
        active={activeKey === id}
        icon={() => providerIcon}
        title={name}
        extra={
          enabled ? (
            <span className="flex w-6 items-center justify-center">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              <span className="sr-only">{t('menu.list.enabled')}</span>
            </span>
          ) : undefined
        }
        onClick={() => {
          onClick(id);
        }}
      />
    );
  },
);
export default ProviderItem;
