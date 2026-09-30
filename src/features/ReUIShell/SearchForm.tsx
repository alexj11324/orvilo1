'use client';

import { SearchIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';
import { useGlobalStore } from '@/store/global';

/** Shell 9 search control, connected to Orvilo's existing command palette. */
export function SearchForm(props: ComponentProps<'form'>) {
  const { t } = useTranslation('common');
  const toggleCommandMenu = useGlobalStore((state) => state.toggleCommandMenu);

  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault();
        toggleCommandMenu(true);
      }}
    >
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <Button
            className="h-8 w-full justify-start border-none bg-sidebar-accent text-sidebar-foreground pl-7 font-normal transition-[width] duration-200 ease-linear hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground active:not-aria-[haspopup]:translate-y-0 in-data-[state=collapsed]:w-8! in-data-[state=collapsed]:pl-4! in-data-[state=collapsed]:text-transparent"
            id="search"
            type="button"
            variant="outline"
            onClick={() => toggleCommandMenu(true)}
          >
            {t('tab.search')}...
          </Button>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 opacity-50 select-none"
          />
          <Kbd className="absolute top-1/2 right-2 -translate-y-1/2 bg-sidebar-border text-sidebar-foreground in-data-[state=collapsed]:hidden">
            ⌘K
          </Kbd>
        </SidebarGroupContent>
      </SidebarGroup>
    </form>
  );
}
