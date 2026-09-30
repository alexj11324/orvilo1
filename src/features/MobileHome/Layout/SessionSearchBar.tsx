'use client';

import { HotkeyEnum } from '@orvilo/const/hotkeys';
import { cssVar } from 'antd-style';
import { Loader2, SearchIcon, X } from 'lucide-react';
import { type ChangeEvent, memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { useHomeStore } from '@/store/home';
import { useSessionStore } from '@/store/session';
import { useUserStore } from '@/store/user';
import { settingsSelectors } from '@/store/user/selectors';

const SessionSearchBar = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t } = useTranslation('chat');
  const isLoaded = useUserStore((s) => s.isLoaded);
  const hotkey = useUserStore(settingsSelectors.getHotkeyById(HotkeyEnum.Search));

  const [keywords, updateSearchKeywords] = useSessionStore((s) => [
    s.sessionSearchKeywords,
    s.updateSearchKeywords,
  ]);
  const useSearchAgents = useHomeStore((s) => s.useSearchAgents);

  const { isValidating } = useSearchAgents(keywords?.trim() || undefined);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      updateSearchKeywords(e.target.value);
    },
    [updateSearchKeywords],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mobile || !hotkey) return;
    const parts = hotkey.toLowerCase().split('+');
    const key = parts.at(-1) ?? '';
    const handler = (e: KeyboardEvent) => {
      const isMac = /mac/i.test(navigator.platform);
      const modOk =
        parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta')
          ? isMac
            ? e.metaKey
            : e.ctrlKey
          : true;
      if (
        modOk &&
        (!parts.includes('shift') || e.shiftKey) &&
        (!parts.includes('alt') || e.altKey) &&
        e.key.toLowerCase() === key
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkey, mobile]);

  const loading = !isLoaded || isValidating;
  return (
    <div className="relative flex w-full items-center">
      <SearchIcon
        className="pointer-events-none absolute left-3"
        size={16}
        style={{ color: cssVar.colorTextTertiary }}
      />
      <Input
        className="w-full px-9"
        placeholder={t('searchAgentPlaceholder')}
        ref={inputRef}
        value={keywords ?? ''}
        onChange={handleChange}
      />
      <div className="absolute right-3 flex items-center gap-2">
        {loading && (
          <Loader2 className="animate-spin" size={14} style={{ color: cssVar.colorTextTertiary }} />
        )}
        {!mobile && !keywords && hotkey && (
          <Kbd className="pointer-events-none">{hotkey.toUpperCase()}</Kbd>
        )}
        {!!keywords && (
          <button
            aria-label={t('clear', { ns: 'common' })}
            type="button"
            onClick={() => updateSearchKeywords('')}
          >
            <X size={14} style={{ color: cssVar.colorTextTertiary }} />
          </button>
        )}
      </div>
    </div>
  );
});

export default SessionSearchBar;
