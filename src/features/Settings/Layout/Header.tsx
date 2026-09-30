'use client';

import { useTranslation } from 'react-i18next';

import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import BackButton from '@/features/NavPanel/components/BackButton';

const Header = () => {
  const { t } = useTranslation('common');

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="gap-2">
        <BackButton />
        <span>{t('tab.setting')}</span>
      </SidebarGroupLabel>
    </SidebarGroup>
  );
};

export default Header;
