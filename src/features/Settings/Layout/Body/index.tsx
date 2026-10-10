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
import { getTabUrl, SearchSection } from '@/features/SettingsSearch';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { stripWorkspaceSlug } from '@/features/Workspace/workspaceAwarePath';
import { useActiveLocation } from '@/hooks/useActiveLocation';
import { SettingsTabs } from '@/store/global/initialState';
import { isModifierClick } from '@/utils/navigation';

import { type CategoryItem, useCategory } from '../../hooks/useCategory';

/**
 * The tab segment of a settings URL, whichever tree it lives in:
 * `/settings/profile` and `/acme/settings/general` both sit at index 2 once
 * the workspace prefix is gone.
 */
const settingsTabOf = (pathname: string, slug: string | null) =>
  stripWorkspaceSlug(pathname, slug).split(/[/?#]/)[2];

const urlOf = (item: CategoryItem) => item.href ?? getTabUrl(item.key as SettingsTabs);

const Body = memo(() => {
  const categoryGroups = useCategory();
  const navigate = useWorkspaceAwareNavigate();
  const location = useActiveLocation();

  const slug = useActiveWorkspaceSlug();

  // A row is active when the current URL sits on its page. Compared by URL
  // segment rather than by key, because a row may point at the workspace page
  // of its capability (`stats` → `/:slug/settings/statistics`).
  const activeTab = useMemo(
    () => settingsTabOf(location.pathname, slug) || SettingsTabs.Profile,
    [location.pathname, slug],
  );

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
                    const url = urlOf(item);
                    return (
                      <NavItem
                        active={activeTab === settingsTabOf(url, slug)}
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
