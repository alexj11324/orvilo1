import { useServerConfigStore } from '@/store/serverConfig';

// Touch keyboards have no chorded send shortcut, so the hotkey hint is
// meaningless chrome on mobile.
export const useComposerHotkeyHint = () => !useServerConfigStore((s) => s.isMobile);
