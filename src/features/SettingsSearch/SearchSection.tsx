'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import { memo, type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';

import SearchResults from './SearchResults';
import { useSettingsSearch } from './useSettingsSearch';

/**
 * Self-contained settings-search unit: owns the query state, renders the
 * search bar, and swaps `children` (the category list) for live results while
 * a query is present. Living here (not in the route layout) also means the
 * search index — and the lazy pinyin dict — starts warming up as soon as the
 * sidebar mounts, well before the first keystroke.
 */
const SearchSection = memo<PropsWithChildren>(({ children }) => {
  const { t } = useTranslation('setting');
  const { state, isMobile, setOpen } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';
  const inputRef = useRef<HTMLInputElement>(null);
  const [focusOnExpand, setFocusOnExpand] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (focusOnExpand && !collapsed) {
      inputRef.current?.focus();
      setFocusOnExpand(false);
    }
  }, [collapsed, focusOnExpand]);
  const { isIndexing, results } = useSettingsSearch(query);

  const showResults = !!query.trim();

  return (
    <>
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          {collapsed ? (
            <SidebarMenuButton
              aria-label={t('settingsSearch.placeholder')}
              tooltip={t('settingsSearch.placeholder')}
              onClick={() => {
                setFocusOnExpand(true);
                setOpen(true);
              }}
            >
              <SearchIcon aria-hidden />
            </SidebarMenuButton>
          ) : (
            <InputGroup className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
              <InputGroupInput
                aria-label={t('settingsSearch.placeholder')}
                className="placeholder:text-[var(--sidebar-muted)]"
                placeholder={t('settingsSearch.placeholder')}
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && query) {
                    event.stopPropagation();
                    setQuery('');
                  }
                }}
              />
              {query && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={t('settingsSearch.clear')}
                    size="icon-xs"
                    onClick={() => {
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                  >
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
      {showResults && !collapsed ? (
        <SearchResults isIndexing={isIndexing} query={query} results={results} />
      ) : (
        children
      )}
    </>
  );
});

SearchSection.displayName = 'SettingsSearchSection';

export default SearchSection;
