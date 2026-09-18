import { useHotkeys } from 'react-hotkeys-hook';

import { nextInboxSelection } from './inboxListSelection';

interface UseInboxListKeyboardOptions {
  ids: string[];
  onBack?: () => void;
  onOpen?: () => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

export const INBOX_LIST_HOTKEY_OPTIONS = {
  enableOnContentEditable: false,
  enableOnFormTags: false,
  preventDefault: true,
} as const;

/**
 * Page-local Inbox list keys. Disabled inside inputs so the command palette
 * and editors keep J/K. Not registered as a global rebindable hotkey.
 */
export const useInboxListKeyboard = ({
  ids,
  onBack,
  onOpen,
  onSelect,
  selectedId,
}: UseInboxListKeyboardOptions) => {
  useHotkeys(
    'j,arrowdown',
    () => {
      const next = nextInboxSelection(ids, selectedId, 1);
      if (next) onSelect(next);
    },
    INBOX_LIST_HOTKEY_OPTIONS,
    [ids, onSelect, selectedId],
  );
  useHotkeys(
    'k,arrowup',
    () => {
      const next = nextInboxSelection(ids, selectedId, -1);
      if (next) onSelect(next);
    },
    INBOX_LIST_HOTKEY_OPTIONS,
    [ids, onSelect, selectedId],
  );
  useHotkeys(
    'enter',
    () => {
      onOpen?.();
    },
    INBOX_LIST_HOTKEY_OPTIONS,
    [onOpen],
  );
  useHotkeys(
    'esc',
    () => {
      onBack?.();
    },
    { ...INBOX_LIST_HOTKEY_OPTIONS, enabled: Boolean(onBack) },
    [onBack],
  );
};
