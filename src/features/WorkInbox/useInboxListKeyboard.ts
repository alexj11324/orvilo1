import { useHotkeys } from 'react-hotkeys-hook';

import { nextInboxSelection } from './inboxListSelection';

interface UseInboxListKeyboardOptions {
  ids: string[];
  onBack?: () => void;
  onOpen?: () => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

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
    { enableOnFormTags: false, preventDefault: true },
    [ids, onSelect, selectedId],
  );
  useHotkeys(
    'k,arrowup',
    () => {
      const next = nextInboxSelection(ids, selectedId, -1);
      if (next) onSelect(next);
    },
    { enableOnFormTags: false, preventDefault: true },
    [ids, onSelect, selectedId],
  );
  useHotkeys(
    'enter',
    () => {
      onOpen?.();
    },
    { enableOnFormTags: false, preventDefault: true },
    [onOpen],
  );
  useHotkeys(
    'esc',
    () => {
      onBack?.();
    },
    { enableOnFormTags: false, enabled: Boolean(onBack), preventDefault: true },
    [onBack],
  );
};
