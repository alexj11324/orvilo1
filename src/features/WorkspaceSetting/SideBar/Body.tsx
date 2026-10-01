'use client';

import { ChevronDown } from 'lucide-react';
import { memo, useMemo } from 'react';
import { Link } from 'react-router';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import NavItem from '@/features/NavPanel/components/SidebarNavItem';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { DEFAULT_WORKSPACE_SETTINGS_TAB, WorkspaceSettingsTabs } from '@/types/workspaceSettings';
import { isModifierClick } from '@/utils/navigation';

import { useWorkspaceSettingCategory } from '../hooks/useCategory';

const Body = memo(() => {
  const navigate = useWorkspaceAwareNavigate();
  const location = useActiveLocation();
  const slug = useActiveWorkspaceSlug();
  const groups = useWorkspaceSettingCategory();

  const activeTab = useMemo(() => {
    if (!slug) return DEFAULT_WORKSPACE_SETTINGS_TAB;
    const parts = location.pathname.split('/').filter(Boolean);
    const tab = parts[2];
    return tab && (Object.values(WorkspaceSettingsTabs) as string[]).includes(tab)
      ? (tab as WorkspaceSettingsTabs)
      : DEFAULT_WORKSPACE_SETTINGS_TAB;
  }, [location.pathname, slug]);

  if (!slug) return null;

  return (
    <>
      {groups.map((group) => (
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
                    const url = `/${slug}/settings/${item.key}`;
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
                          navigate(url);
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
    </>
  );
});

export default Body;
