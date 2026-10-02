'use client';

import { ChevronLeftIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { SidebarGroup, SidebarGroupContent, SidebarMenu } from '@/components/ui/sidebar';
import NavItem from '@/features/NavPanel/components/SidebarNavItem';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { isModifierClick } from '@/utils/navigation';

const Header = () => {
  const { t } = useTranslation('setting');
  const workspace = useActiveWorkspace();
  const navigate = useWorkspaceAwareNavigate();
  const slug = workspace?.slug;

  if (!slug) return null;

  const to = `/${slug}`;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.25">
          <NavItem
            href={to}
            icon={ChevronLeftIcon}
            render={<Link to={to} />}
            title={t('workspaceSetting.breadcrumb.backToApp')}
            onClick={(event) => {
              if (isModifierClick(event)) return;
              navigate(to);
            }}
          />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default Header;
