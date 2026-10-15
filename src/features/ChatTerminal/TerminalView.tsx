'use client';

import { ThemeContext } from '@emotion/react';
import { memo, use, useEffect, useRef } from 'react';

import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

import { buildXtermTheme } from './theme';
import { xtermManager } from './xtermManager';

/**
 * Attaches the keep-alive xterm instance of `sessionId` to the DOM. The
 * instance itself (and its scrollback) lives in `xtermManager`, so unmounting
 * this view — collapsing the panel, switching tab or topic — loses nothing.
 */
const TerminalView = memo<{ sessionId: string }>(({ sessionId }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const theme = use(ThemeContext) as Parameters<typeof buildXtermTheme>[0] & {
    fontFamilyCode: string;
  };
  const terminalFontFamily = useUserStore(preferenceSelectors.terminalFontFamily);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    xtermManager.attach(sessionId, host);
    xtermManager.fit(sessionId);
    xtermManager.focus(sessionId);

    // The panel animates its height on open/close, so ResizeObserver fires every
    // frame. Resizing the PTY per frame floods the shell with SIGWINCH and its
    // redraws read as a phantom Enter — debounce so the PTY only learns the final
    // size once the animation settles.
    let fitTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (fitTimer) clearTimeout(fitTimer);
      fitTimer = setTimeout(() => xtermManager.fit(sessionId), 100);
    });
    observer.observe(host);

    return () => {
      if (fitTimer) clearTimeout(fitTimer);
      observer.disconnect();
      xtermManager.detach(sessionId);
    };
  }, [sessionId]);

  useEffect(() => {
    xtermManager.applyTheme(buildXtermTheme(theme), terminalFontFamily || theme.fontFamilyCode);
  }, [terminalFontFamily, theme, sessionId]);

  return <div className="h-full min-h-0 w-full overflow-hidden" ref={hostRef} />;
});

export default TerminalView;
