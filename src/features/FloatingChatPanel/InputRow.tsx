'use client';

import './FloatingChatPanel.module.css';

import {
  type FocusEvent,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { flushSync } from 'react-dom';

import { ChatInput } from '@/features/Conversation';
import { inputSelectors, useConversationStore } from '@/features/Conversation/store';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import HoverExpandBar from './HoverExpandBar';

const styles = {
  row: 'relative shrink-0',
  surface: '[view-transition-name:floating-chat-panel-input]',
};

interface ViewTransitionLike {
  finished: Promise<void>;
  skipTransition: () => void;
}

interface ActiveViewTransition {
  restore: () => void;
  transition: ViewTransitionLike;
}

type ActiveViewTransitionRef = { current: ActiveViewTransition | null };

const cancelActiveViewTransition = (activeRef: ActiveViewTransitionRef) => {
  const active = activeRef.current;
  if (!active) return;
  // Public platform cancellation skips the visual capture, not its DOM update.
  active.transition.skipTransition();
  active.restore();
};

type DocumentWithVT = Document & {
  startViewTransition?: (cb: () => void) => ViewTransitionLike;
};

const supportsViewTransition =
  typeof document !== 'undefined' &&
  typeof (document as DocumentWithVT).startViewTransition === 'function';

// View Transition snapshots the DOM before and after this callback. The DOM mutation
// must commit synchronously inside it, otherwise the "after" snapshot is identical
// to the "before" one and nothing animates.
//
// Setting `view-transition-name: none` on <html> for the duration of the transition
// suppresses the default root snapshot, so only the named `floating-chat-panel-input`
// element participates. Elements outside the panel keep their native CSS animations
// instead of being frozen under the root crossfade.
const commitWithViewTransition = (
  commit: () => void,
  disableMotion: boolean,
  activeRef: ActiveViewTransitionRef,
) => {
  cancelActiveViewTransition(activeRef);
  if (
    !supportsViewTransition ||
    disableMotion ||
    userGeneralSettingsSelectors.animationMode(useUserStore.getState()) === 'disabled' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    commit();
    return;
  }
  const root = document.documentElement;
  const previousViewTransitionName = root.style.viewTransitionName;
  root.style.viewTransitionName = 'none';
  const transition = (document as DocumentWithVT).startViewTransition!(() => {
    // eslint-disable-next-line @eslint-react/dom/no-flush-sync
    flushSync(commit);
  });
  const active: ActiveViewTransition = {
    restore: () => {
      // An earlier finished promise must not restore over a newer transition.
      if (activeRef.current !== active) return;
      root.style.viewTransitionName = previousViewTransitionName;
      activeRef.current = null;
    },
    transition,
  };
  activeRef.current = active;
  transition.finished.then(active.restore, active.restore);
};

const EMPTY_ACTIONS: never[] = [];
const EXPANDED_LEFT_ACTIONS: 'typo'[] = ['typo'];
const EXPANDED_RIGHT_ACTIONS: 'contextWindow'[] = ['contextWindow'];

export interface InputRowProps {
  isCollapsed: boolean;
  onExpand: () => void;
  showExpandBar?: boolean;
}

const InputRow = memo<InputRowProps>(({ isCollapsed, onExpand, showExpandBar = true }) => {
  const s = styles;
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const reducedMotion = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }, []),
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
  const disableMotion = animationMode === 'disabled' || reducedMotion;
  const activeTransitionRef = useRef<ActiveViewTransition | null>(null);

  useLayoutEffect(() => {
    if (disableMotion) cancelActiveViewTransition(activeTransitionRef);
  }, [disableMotion]);

  useLayoutEffect(() => () => cancelActiveViewTransition(activeTransitionRef), []);

  const [renderedCollapsed, setRenderedCollapsed] = useState(isCollapsed);
  const collapsedRef = useRef(isCollapsed);
  const [focused, setFocused] = useState(false);
  const focusedRef = useRef(false);
  const overlayHeight = useConversationStore(inputSelectors.chatInputOverlayHeight);

  useLayoutEffect(() => {
    collapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  useEffect(() => {
    if (renderedCollapsed === isCollapsed) return;
    commitWithViewTransition(
      () => setRenderedCollapsed(collapsedRef.current),
      disableMotion,
      activeTransitionRef,
    );
  }, [disableMotion, isCollapsed, renderedCollapsed]);

  // Focus inside the collapsed strip releases the compact rendering so the action bar
  // (Send + actions) shows while the panel itself stays collapsed. Blurring back outside
  // the row returns to compact. View Transition makes the footer enter / leave smoothly.
  const handleFocus = useCallback(() => {
    if (focusedRef.current) return;
    focusedRef.current = true;
    commitWithViewTransition(
      () => setFocused(focusedRef.current),
      disableMotion,
      activeTransitionRef,
    );
  }, [disableMotion]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget as Node | null;
      if (next && event.currentTarget.contains(next)) return;
      if (!focusedRef.current) return;
      focusedRef.current = false;
      commitWithViewTransition(
        () => setFocused(focusedRef.current),
        disableMotion,
        activeTransitionRef,
      );
    },
    [disableMotion],
  );

  const effectiveCompact = renderedCollapsed && !focused;

  return (
    <>
      <div
        className={s.row}
        data-collapsed={isCollapsed}
        data-testid="floating-chat-panel-input-row"
        onBlur={handleBlur}
        onFocus={handleFocus}
      >
        {showExpandBar && (
          <HoverExpandBar
            bottomOffset={overlayHeight}
            visible={isCollapsed && focused}
            onExpand={onExpand}
          />
        )}
        <div className={s.surface}>
          <ChatInput
            allowExpand={false}
            compact={effectiveCompact}
            leftActions={effectiveCompact ? EMPTY_ACTIONS : EXPANDED_LEFT_ACTIONS}
            rightActions={effectiveCompact ? EMPTY_ACTIONS : EXPANDED_RIGHT_ACTIONS}
            showControlBar={false}
          />
        </div>
      </div>
    </>
  );
});

InputRow.displayName = 'FloatingChatPanelInputRow';

export default InputRow;
