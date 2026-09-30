'use client';

import { ChevronDown } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Link } from 'react-router';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import NavItem from '@/features/NavPanel/components/SidebarNavItem';
import { getTabUrl, SearchSection } from '@/features/SettingsSearch';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { SettingsTabs } from '@/store/global/initialState';
import { isModifierClick } from '@/utils/navigation';

import { useCategory } from '../../hooks/useCategory';

const Body = memo(() => {
  const categoryGroups = useCategory();
  const navigate = useWorkspaceAwareNavigate();
  const location = useActiveLocation();

  // Extract current tab from pathname: /settings/profile -> profile
  const activeTab = useMemo(() => {
    const pathParts = location.pathname.split('/');
    // pathname is like /settings/profile or /settings/<tab>/xxx
    if (pathParts.length >= 3) {
      return pathParts[2] as SettingsTabs;
    }
    return SettingsTabs.Profile;
  }, [location.pathname]);

  return (
    <SearchSection>
      {categoryGroups.map((group) => (
        <Collapsible defaultOpen className="group/collapsible" key={group.key}>
          <SidebarGroup>
            <SidebarGroupLabel render={<CollapsibleTrigger />}>
              {group.title}
              <ChevronDown className="ml-auto transition-transform group-data-[closed]/collapsible:-rotate-90" />
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.25">
                  {group.items.map((item) => {
                    const url = item.href ?? getTabUrl(item.key);
                    return (
                      <NavItem
                        active={activeTab === item.key}
                        href={url}
                        icon={item.icon}
                        key={item.key}
                        render={<Link to={url} />}
                        title={item.label}
                        onClick={(e) => {
                          if (isModifierClick(e)) return;
                          navigate(url, { escape: true });
                        }}
                      />
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      ))}
    </SearchSection>
  );
});

export default Body;
