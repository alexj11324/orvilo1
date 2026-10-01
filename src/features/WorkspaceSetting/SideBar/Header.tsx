'use client';

import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import BackButton from '@/features/NavPanel/components/BackButton';

const Header = () => {
  const { t } = useTranslation('setting');
  const workspace = useActiveWorkspace();

  if (!workspace?.slug) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="gap-2">
        <BackButton to={`/${workspace.slug}`} />
        <span className="truncate">{t('workspaceSetting.breadcrumb.backToApp')}</span>
      </SidebarGroupLabel>
    </SidebarGroup>
  );
};

export default Header;
