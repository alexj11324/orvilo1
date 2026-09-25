import { type AssistantContentBlock, type UIChatMessage } from '@orvilo/types';
import debug from 'debug';
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type VListHandle } from 'virtua';

import { useSingleton } from '@/hooks/useSingleton';

import { dataSelectors, messageStateSelectors, useConversationStore } from '../../store';
import { useAutoScrollEnabled } from '../components/AutoScroll/useAutoScrollEnabled';

const log = debug('orvilo:conversation:scroll');

// In-page ring buffer so e2e can read the hook's verdicts directly from the
// DOM instead of relying on console forwarding (which races on CI workers).
const pushScrollDiag = (entry: string) => {
  try {
    const w = globalThis as { __orviloScrollDiag?: string[] };
    const buf = (w.__orviloScrollDiag ??= []);
    buf.push(entry);
    if (buf.length > 300) buf.splice(0, 100);
  } catch {
    // diagnostics must never break rendering
  }
};
const diag = (entry: string) => {
  log('%s', entry);
  pushScrollDiag(entry);
};

// Module-load stamp: if a failure dump shows an empty buffer despite a live
// chat page, the page either reloaded (wiping window state) or this bundle
// never loaded there — the stamp disambiguates that without console lines.
pushScrollDiag(`useConversationScroll module loaded t=${Math.round(performance.now())}`);

export const CONVERSATION_SPACER_ID = '__conversation_spacer__';
export const CONVERSATION_SPACER_TRANSITION_MS = 200;

const SCROLL_SHRINK_END_DELAY_MS = 150;

// The send scroll fires before the spacer row exists, so virtua clamps it and
// the slide really happens on the settle re-pins that follow mount. Those must
// stay smooth too, otherwise their instant `scroll()` aborts the in-flight
// animation. Settles after this window (e.g. the workflow collapse at turn
// completion) must stay instant so the correction is imperceptible.
const SEND_SCROLL_ANIMATION_WINDOW_MS = 800;

// -------- pure helpers --------

export const calculateConversationSpacerHeight = (
  viewportHeight: number,
  userHeight: number,
  assistantHeight: number,
) => Math.max(Math.round(viewportHeight - userHeight - assistantHeight), 0);

interface ConversationSpacerScrollEffectOptions {
  delta: number;
  hasPrevOffset: boolean;
  hasUserIntent: boolean;
  isAIGenerating: boolean;
  isMounted: boolean;
}

export const getConversationSpacerScrollEffect = ({
  delta,
  hasPrevOffset,
  hasUserIntent,
  isAIGenerating,
  isMounted,
}: ConversationSpacerScrollEffectOptions) => {
  const cancelPin = isMounted && hasPrevOffset && hasUserIntent && delta < 0;

  return {
    cancelPin,
    shrinkSpacer: cancelPin && !isAIGenerating,
  };
};

const getMessageElement = (messageId: string | null) => {
  if (!messageId) return null;

  return document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
};

const getMessageHeight = (messageId: string | null) => {
  return getMessageElement(messageId)?.getBoundingClientRect().height || 0;
};

const getRenderableTailSignature = (message: UIChatMessage | undefined) => {
  if (!message) return '';

  const tailBlock: AssistantContentBlock | UIChatMessage =
    message.children && message.children.length > 0 ? message.children.at(-1)! : message;

  const contentLength = tailBlock.content?.length || 0;
  const reasoningLength = tailBlock.reasoning?.content?.length || 0;
  const toolCount = tailBlock.tools?.length || 0;

  return `${contentLength}:${reasoningLength}:${toolCount}:${message.updatedAt || 0}`;
};

// ---------------------------------------------------------------------------
// Sub-hook: spacer layout signal
// ---------------------------------------------------------------------------
//
// Watches the spacer DOM node with a scoped ResizeObserver. Every size change
// bumps `spacerLayoutVersion`, which the pin controller uses as "layout
// settled" beats to retry its scroll.
//
// A scoped observer (rather than a document-wide selector) is deliberate:
// ConversationProvider can mount several chat lists simultaneously, and a
// global selector would attach to another panel's spacer.
// ---------------------------------------------------------------------------
const useSpacerLayoutSignal = () => {
  const [spacerLayoutVersion, setSpacerLayoutVersion] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const cleanup = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  const registerSpacerNode = useCallback(
    (node: HTMLElement | null) => {
      cleanup();

      if (!node || typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(() => {
        setSpacerLayoutVersion((v) => v + 1);
      });
      observer.observe(node);
      observerRef.current = observer;
      setSpacerLayoutVersion((v) => v + 1);
    },
    [cleanup],
  );

  useEffect(() => cleanup, [cleanup]);

  return { registerSpacerNode, spacerLayoutVersion };
};

// ---------------------------------------------------------------------------
// Sub-hook: spacer height & mount lifecycle
// ---------------------------------------------------------------------------
//
// Owns the spacer's natural height, its mount/unmount timing, and the user-
// driven shrink reduction. Measures via virtua's item methods when available,
// falling back to DOM `getBoundingClientRect` otherwise.
//
// Also hosts the ResizeObserver for the tracked user/assistant messages so
// that spacer height stays in sync as those messages grow.
// ---------------------------------------------------------------------------
interface UseSpacerHeightArgs {
  assistantMessageIndex: number | null;
  dataSource: string[];
  getItemOffset: ((index: number) => number) | undefined;
  getItemSize: ((index: number) => number) | undefined;
  getViewportSize: (() => number) | undefined;
  isAIGeneratingRef: RefObject<boolean>;
  latestAssistantSignature: string;
  /**
   * Called when an idle measure finds nothing to hold while the spacer never
   * mounted — the turn finished before the pin window ever opened.
   */
  onRetiredWithoutMountRef: RefObject<(() => void) | null>;
  userMessageIndex: number | null;
}

const useSpacerHeight = ({
  dataSource,
  getItemOffset,
  getItemSize,
  getViewportSize,
  isAIGeneratingRef,
  latestAssistantSignature,
  onRetiredWithoutMountRef,
  userMessageIndex,
  assistantMessageIndex,
}: UseSpacerHeightArgs) => {
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [scrollReduction, setScrollReduction] = useState(0);
  const [mounted, setMounted] = useState(false);

  const mountedRef = useRef(false);
  mountedRef.current = mounted;

  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesObserverRef = useRef<ResizeObserver | null>(null);

  const renderedHeight = Math.max(naturalHeight - scrollReduction, 0);
  const isScrollShrinking = scrollReduction > 0;

  const getTrackedMessages = useCallback(() => {
    const userIndex = userMessageIndex;
    const assistantIndex = assistantMessageIndex;

    return {
      assistantId:
        assistantIndex !== null && assistantIndex >= 0 ? dataSource[assistantIndex] || null : null,
      assistantIndex,
      userId: userIndex !== null && userIndex >= 0 ? dataSource[userIndex] || null : null,
      userIndex,
    };
  }, [assistantMessageIndex, dataSource, userMessageIndex]);

  const clearRemoveTimer = useCallback(() => {
    if (removeTimerRef.current) {
      clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }
  }, []);

  const cleanupMessagesObserver = useCallback(() => {
    messagesObserverRef.current?.disconnect();
    messagesObserverRef.current = null;
  }, []);

  const scheduleSpacerUnmount = useCallback(() => {
    // Keep an unmount that is already pending. Layout keeps settling after the
    // reply ends (the ResizeObserver fires repeatedly under a slow renderer),
    // and restarting the timer on each of those idle zero-height measures
    // starved the unmount — the pin never closed and the viewport stayed at
    // the user row instead of settling at the bottom.
    if (removeTimerRef.current) return;

    removeTimerRef.current = setTimeout(() => {
      setMounted(false);
      removeTimerRef.current = null;
    }, CONVERSATION_SPACER_TRANSITION_MS);
  }, []);

  const updateSpacerHeight = useCallback(() => {
    const { assistantId, assistantIndex, userId, userIndex } = getTrackedMessages();
    const viewportHeight = getViewportSize?.() || window.innerHeight;

    let nextHeight: number;

    if (userIndex !== null && assistantIndex !== null && getItemOffset && getItemSize) {
      const userTop = getItemOffset(userIndex);
      const assistantBottom = getItemOffset(assistantIndex) + getItemSize(assistantIndex);

      nextHeight = Math.max(Math.round(viewportHeight - (assistantBottom - userTop)), 0);
    } else {
      const userHeight = getMessageHeight(userId);
      if (!userHeight) return;

      const assistantHeight = getMessageHeight(assistantId);

      nextHeight = calculateConversationSpacerHeight(viewportHeight, userHeight, assistantHeight);
    }

    if (nextHeight === 0) {
      setNaturalHeight(0);
      if (!isAIGeneratingRef.current) {
        // A reply that lands in full before the first measure never mounts
        // the spacer, so no mount→unmount transition will close the pin.
        if (!mountedRef.current) onRetiredWithoutMountRef.current?.();
        scheduleSpacerUnmount();
        return;
      }
      // While the reply is still streaming, a zero spacer means it already
      // outgrew the viewport — the pin position is self-sustaining and must
      // stay armed. Unmounting here flips `spacerActive` off, which remounts
      // the trailing AutoScroll; with the pinned spot still inside the
      // at-bottom threshold the next stream chunk would drag the viewport to
      // the tail and strand the user message far above. Keep the row mounted
      // at height 0; the unmount is deferred to the first recompute after
      // generation ends.
      clearRemoveTimer();
      setMounted(true);
      return;
    }

    // The spacer is needed again: cancel any pending unmount.
    clearRemoveTimer();
    setMounted(true);
    setNaturalHeight(nextHeight);
  }, [
    clearRemoveTimer,
    getTrackedMessages,
    getItemOffset,
    getItemSize,
    getViewportSize,
    isAIGeneratingRef,
    onRetiredWithoutMountRef,
    scheduleSpacerUnmount,
  ]);

  // Observe tracked message heights; keep spacer in sync while assistant grows.
  useEffect(() => {
    const { assistantId, userId } = getTrackedMessages();

    cleanupMessagesObserver();

    if (!assistantId || !userId || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        updateSpacerHeight();
      });
    });

    messagesObserverRef.current = observer;

    const userEl = getMessageElement(userId);
    const assistantEl = getMessageElement(assistantId);

    if (userEl) observer.observe(userEl);
    if (assistantEl) observer.observe(assistantEl);

    requestAnimationFrame(() => {
      updateSpacerHeight();
    });

    return cleanupMessagesObserver;
  }, [cleanupMessagesObserver, getTrackedMessages, latestAssistantSignature, updateSpacerHeight]);

  useEffect(() => {
    return () => {
      cleanupMessagesObserver();
      clearRemoveTimer();
    };
  }, [cleanupMessagesObserver, clearRemoveTimer]);

  return {
    isScrollShrinking,
    mounted,
    mountedRef,
    renderedHeight,
    setMounted,
    setScrollReduction,
    updateSpacerHeight,
  };
};

// ---------------------------------------------------------------------------
// Sub-hook: pin controller
// ---------------------------------------------------------------------------
//
// Owns the pin state machine. Pin is "we just sent a message and want the
// viewport anchored to the user turn until the spacer stops resizing or the
// user scrolls away."
//
// `scrollToPinned` reads `virtuaRef.current?.scrollToIndex` at call time, not
// during render — this avoids the race where a send effect ran before the
// ref was attached and silently dropped the scroll.
// ---------------------------------------------------------------------------
type PinState = { index: number; seenActive: boolean; sentAt: number } | null;

const usePinController = ({
  headerOffset,
  virtuaRef,
}: {
  headerOffset: number;
  virtuaRef: RefObject<VListHandle | null>;
}) => {
  const pinRef = useRef<PinState>(null);

  const scrollToPinned = useCallback(
    (reason: string) => {
      const pin = pinRef.current;
      if (!pin) return;

      const scrollToIndex = virtuaRef.current?.scrollToIndex;
      if (!scrollToIndex) {
        diag(`scrollToPinned skipped: virtua not ready (${reason}) index=${pin.index}`);
        return;
      }

      const smooth = Date.now() - pin.sentAt < SEND_SCROLL_ANIMATION_WINDOW_MS;

      diag(`scrollToPinned (${reason}) index=${pin.index} smooth=${smooth}`);
      // pin.index is a message index; the header slot row shifts virtua rows.
      scrollToIndex(pin.index + headerOffset, { align: 'start', smooth });
    },
    [headerOffset, virtuaRef],
  );

  const clearPin = useCallback((reason: string) => {
    if (!pinRef.current) return;
    diag(`clearPin (${reason}) index=${pinRef.current.index}`);
    pinRef.current = null;
  }, []);

  return { clearPin, pinRef, scrollToPinned };
};

// ---------------------------------------------------------------------------
// Sub-hook: scroll cancel + shrink
// ---------------------------------------------------------------------------
//
// Converts raw scrollOffset deltas into pin cancellation and spacer-shrink
// actions. Streaming vs. idle behavior is identical about canceling the pin;
// shrinking only happens after streaming has ended so the spacer doesn't
// fight the assistant's growth animation.
// ---------------------------------------------------------------------------
interface UseScrollShrinkArgs {
  clearPin: (reason: string) => void;
  getScrollOffset: (() => number) | undefined;
  isAIGenerating: boolean;
  isAIGeneratingRef: RefObject<boolean>;
  mountedRef: RefObject<boolean>;
  setScrollReduction: (updater: (prev: number) => number) => void;
}

const useScrollShrink = ({
  clearPin,
  getScrollOffset,
  isAIGenerating,
  isAIGeneratingRef,
  mountedRef,
  setScrollReduction,
}: UseScrollShrinkArgs) => {
  const prevScrollOffsetRef = useRef<number | null>(null);
  const scrollShrinkEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScrollOffset = useCallback(
    (currentScrollOffset: number, hasUserIntent = false) => {
      const prevOffset = prevScrollOffsetRef.current;
      prevScrollOffsetRef.current = currentScrollOffset;

      const delta = prevOffset === null ? 0 : currentScrollOffset - prevOffset;
      const { cancelPin, shrinkSpacer } = getConversationSpacerScrollEffect({
        delta,
        hasPrevOffset: prevOffset !== null,
        hasUserIntent,
        isAIGenerating: isAIGeneratingRef.current,
        isMounted: mountedRef.current,
      });

      if (!cancelPin) return;

      clearPin('user scrolled up');

      if (!shrinkSpacer) return;

      setScrollReduction((prev) => prev + Math.abs(delta));

      if (scrollShrinkEndTimerRef.current) clearTimeout(scrollShrinkEndTimerRef.current);
      scrollShrinkEndTimerRef.current = setTimeout(() => {
        scrollShrinkEndTimerRef.current = null;
      }, SCROLL_SHRINK_END_DELAY_MS);
    },
    [clearPin, isAIGeneratingRef, mountedRef, setScrollReduction],
  );

  // Seed prev offset on generation flip — avoids stale deltas across streaming boundaries.
  useEffect(() => {
    prevScrollOffsetRef.current = getScrollOffset?.() ?? null;
  }, [getScrollOffset, isAIGenerating]);

  useEffect(() => {
    return () => {
      if (scrollShrinkEndTimerRef.current) clearTimeout(scrollShrinkEndTimerRef.current);
    };
  }, []);

  return { onScrollOffset, prevScrollOffsetRef };
};

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------
//
// Design notes:
//
// - A single `prevLengthRef` and a single send-detection effect replace the
//   two legacy hooks (`useConversationSpacer` + `useScrollToUserMessage`)
//   that each tracked length independently and could disagree across
//   renders, causing the "send but no scroll" regressions.
// - `virtuaRef` is passed through, not `scrollToIndex`, so the pin reads the
//   ref at call time — closing the race where the ref hadn't been attached.
// - Retries are layout-driven: each `spacerLayoutVersion` bump re-fires
//   `scrollToIndex` once. The old 0/32/96ms timer fan-out is gone.
// ---------------------------------------------------------------------------
export interface UseConversationScrollOptions {
  /**
   * Conversation identity. The hook instance survives in-place topic switches
   * (the provider is not keyed by context), so a change here means the whole
   * dataSource was swapped for another conversation: send-detection and any
   * live spacer/pin state must reset instead of reading the new list through
   * the old topic's indices.
   */
  contextKey?: string;
  dataSource: string[];
  /**
   * Number of synthetic rows prepended to the VList before the messages
   * (e.g. the headerSlot spacer). The pin targets message indices, so virtua
   * calls translate by this offset.
   */
  headerOffset?: number;
  /** Retained for caller compatibility — send detection scans the appended tail itself. */
  isSecondLastMessageFromUser: boolean;
  virtuaRef: RefObject<VListHandle | null>;
}

export interface UseConversationScrollResult {
  /**
   * True while the user is actively dragging the spacer shorter via scroll-up.
   * Consumers can use this to disable the spacer's height transition so it
   * follows the pointer 1:1 instead of animating.
   */
  isScrollShrinking: boolean;
  isSpacerMessage: (id: string) => boolean;
  listData: string[];
  onScrollOffset: (scrollOffset: number, hasUserIntent?: boolean) => void;
  registerSpacerNode: (node: HTMLElement | null) => void;
  spacerActive: boolean;
  spacerHeight: number;
}

export const useConversationScroll = ({
  contextKey,
  dataSource,
  headerOffset = 0,
  virtuaRef,
}: UseConversationScrollOptions): UseConversationScrollResult => {
  const displayMessages = useConversationStore(dataSelectors.displayMessages);
  const isAIGenerating = useConversationStore(messageStateSelectors.isAIGenerating);
  const scrollToBottom = useConversationStore((s) => s.scrollToBottom);
  const autoScrollEnabled = useAutoScrollEnabled();
  const getItemOffset = useConversationStore((s) => s.virtuaScrollMethods?.getItemOffset);
  const getItemSize = useConversationStore((s) => s.virtuaScrollMethods?.getItemSize);
  const getScrollOffset = useConversationStore((s) => s.virtuaScrollMethods?.getScrollOffset);
  const getViewportSize = useConversationStore((s) => s.virtuaScrollMethods?.getViewportSize);

  const isAIGeneratingRef = useRef(isAIGenerating);
  isAIGeneratingRef.current = isAIGenerating;
  // State (not ref) so that downstream memos / effects re-run when a new turn
  // is pinned. The pin indices are only set from the send-detection effect;
  // using state keeps the observer & signature in sync on the very next
  // render rather than waiting for an unrelated dep to change.
  const [userMessageIndex, setUserMessageIndex] = useState<number | null>(null);
  const [assistantMessageIndex, setAssistantMessageIndex] = useState<number | null>(null);
  const prevLengthRef = useRef(dataSource.length);
  // Tail-appended ids whose role wasn't resolvable on arrival — under load the
  // displayMessages role map can lag dataSource by a commit, which would drop
  // the pin for a split user+assistant commit. Re-checked every pass.
  const unresolvedTailIds = useSingleton(() => new Set<string>());
  // User ids already pinned this context — dedupes re-keys (tmp_ → real id)
  // landing inside a later tail segment.
  const pinnedUserIds = useSingleton(() => new Set<string>());
  // Armed on mount AND on every context switch: ChatList swaps the welcome
  // screen for this list only once the optimistic tail exists, so mount
  // already sees the just-sent rows with prevLengthRef seeded past them; a
  // send can likewise mint its topic id before the context adopts it, landing
  // the tail under the new contextKey inside the seeding commit. Both paths
  // leave the growth scan silent — while armed, pin the freshest tail user
  // row once the turn is live.
  const switchPinArmedRef = useRef(true);

  const { registerSpacerNode, spacerLayoutVersion } = useSpacerLayoutSignal();
  const onRetiredWithoutMountRef = useRef<(() => void) | null>(null);

  const latestAssistantSignature = useMemo(() => {
    const assistantId =
      assistantMessageIndex !== null && assistantMessageIndex >= 0
        ? dataSource[assistantMessageIndex]
        : null;
    if (!assistantId) return '';
    const assistantMessage = displayMessages.find((message) => message.id === assistantId);
    return getRenderableTailSignature(assistantMessage);
  }, [assistantMessageIndex, dataSource, displayMessages]);

  const {
    isScrollShrinking,
    mounted,
    mountedRef,
    renderedHeight,
    setMounted,
    setScrollReduction,
    updateSpacerHeight,
  } = useSpacerHeight({
    assistantMessageIndex,
    dataSource,
    getItemOffset,
    getItemSize,
    getViewportSize,
    isAIGeneratingRef,
    latestAssistantSignature,
    onRetiredWithoutMountRef,
    userMessageIndex,
  });

  const { clearPin, pinRef, scrollToPinned } = usePinController({ headerOffset, virtuaRef });

  // Same settle as the mount→unmount path below, for a turn that finished
  // before the spacer ever mounted (e.g. the whole reply arrives at once).
  // Without it the pin never closes and keeps re-anchoring the user row.
  // With auto-scroll off the pin *is* the resting position, so leave it.
  onRetiredWithoutMountRef.current = () => {
    const pin = pinRef.current;
    if (!pin || pin.seenActive || !autoScrollEnabled) return;
    clearPin('reply finished before spacer mounted');
    scrollToBottom(false);
  };

  const { onScrollOffset, prevScrollOffsetRef } = useScrollShrink({
    clearPin,
    getScrollOffset,
    isAIGenerating,
    isAIGeneratingRef,
    mountedRef,
    setScrollReduction,
  });

  // useLayoutEffect: runs before the passive send-detection effect in the
  // switch commit, so seeding prevLengthRef with the new list's length keeps a
  // coincidental +2 length delta from being read as "message pair appended" —
  // and a live spacer row is dropped before the new topic paints.
  const prevContextKeyRef = useRef(contextKey);
  useLayoutEffect(() => {
    if (prevContextKeyRef.current === contextKey) return;
    prevContextKeyRef.current = contextKey;

    diag(`context switch ${prevContextKeyRef.current} len=${dataSource.length}`);
    prevLengthRef.current = dataSource.length;
    unresolvedTailIds.clear();
    pinnedUserIds.clear();
    switchPinArmedRef.current = true;
    clearPin('context switch');
    setUserMessageIndex(null);
    setAssistantMessageIndex(null);
    setMounted(false);
    setScrollReduction(() => 0);
    prevScrollOffsetRef.current = null;
  }, [contextKey, clearPin, dataSource.length, setMounted, setScrollReduction]);

  // --- send detection: single source of truth ---
  useEffect(() => {
    const newMessageCount = dataSource.length - prevLengthRef.current;
    prevLengthRef.current = dataSource.length;

    if (newMessageCount > 0) diag(`dataSource grew +${newMessageCount} → len=${dataSource.length}`);

    // Topic-adoption rescue: the optimistic (user, assistant) tail can be
    // already present in the first dataSource a fresh contextKey paints — the
    // growth scan below then sees zero new rows. Pin the freshest tail user
    // row once the new turn is live; freshness bounds this to just-sent rows
    // so opening an older topic never triggers it.
    if (switchPinArmedRef.current) {
      let lastUserIndex = -1;
      let lastUserCreatedAt = 0;
      for (let i = dataSource.length - 1; i >= 0; i -= 1) {
        const message = displayMessages.find((m) => m.id === dataSource[i]);
        if (message?.role === 'user') {
          lastUserIndex = i;
          lastUserCreatedAt = message.createdAt;
          break;
        }
      }
      const fresh = lastUserIndex >= 0 && Date.now() - lastUserCreatedAt < 120_000;
      if (!fresh) {
        diag(`switch pin disarmed (no fresh user row, lastUserIndex=${lastUserIndex})`);
        switchPinArmedRef.current = false;
      } else if (isAIGenerating) {
        switchPinArmedRef.current = false;
        const userId = dataSource[lastUserIndex];
        if (!pinnedUserIds.has(userId) && pinRef.current?.index !== lastUserIndex) {
          pinnedUserIds.add(userId);
          diag(`send detected via topic adoption userIndex=${lastUserIndex}`);
          setScrollReduction(() => 0);
          prevScrollOffsetRef.current = getScrollOffset?.() ?? null;
          setUserMessageIndex(lastUserIndex);
          const nextIndex = lastUserIndex + 1;
          setAssistantMessageIndex(nextIndex < dataSource.length ? nextIndex : null);
          pinRef.current = {
            index: lastUserIndex,
            seenActive: mountedRef.current,
            sentAt: Date.now(),
          };
          scrollToPinned('send');
          requestAnimationFrame(() => {
            updateSpacerHeight();
          });
        }
        return;
      }
      // fresh but the turn's op hasn't surfaced under this context yet — stay
      // armed; isAIGenerating is a dep so the effect re-runs when it flips.
    }

    if (newMessageCount <= 0 && unresolvedTailIds.size === 0) return;

    // A send appends a (user, assistant, …) tail — usually one +2 commit, but
    // under load the pair can split across commits or carry extra rows (tool,
    // receipt, steer), which an exact `+2 & second-last-is-user` gate silently
    // drops. Candidates are the ids appended in this pass (the tail segment —
    // prepends never qualify) plus earlier tail ids whose role was not
    // resolvable when they landed; the pin targets the latest new user row.
    const tailStart = Math.max(0, dataSource.length - Math.max(newMessageCount, 0));
    const candidates = new Set<string>([...unresolvedTailIds, ...dataSource.slice(tailStart)]);
    unresolvedTailIds.clear();

    let userIndex = -1;
    for (const id of candidates) {
      const message = displayMessages.find((m) => m.id === id);
      if (!message) {
        unresolvedTailIds.add(id);
        continue;
      }
      if (message.role !== 'user' || pinnedUserIds.has(id)) continue;
      const index = dataSource.indexOf(id);
      if (index > userIndex) userIndex = index;
    }

    if (userIndex < 0) {
      if (newMessageCount > 0)
        diag(`send detection: no new user row in appended tail (+${newMessageCount})`);
      return;
    }

    const userId = dataSource[userIndex];
    pinnedUserIds.add(userId);
    if (pinRef.current?.index === userIndex) return;

    // The assistant bubble usually lands in the same commit; on a split commit
    // it may not exist yet — the growth branch below adopts it when it does.
    const nextIndex = userIndex + 1;
    const assistantIndex = nextIndex < dataSource.length ? nextIndex : null;

    diag(`send detected userIndex=${userIndex}`);

    setScrollReduction(() => 0);
    prevScrollOffsetRef.current = getScrollOffset?.() ?? null;
    setUserMessageIndex(userIndex);
    setAssistantMessageIndex(assistantIndex);
    pinRef.current = { index: userIndex, seenActive: mountedRef.current, sentAt: Date.now() };

    // Scroll immediately. If virtuaRef isn't ready yet, the spacerLayoutVersion
    // bumps that follow mount+measurement will retry.
    scrollToPinned('send');

    requestAnimationFrame(() => {
      updateSpacerHeight();
    });
  }, [
    assistantMessageIndex,
    dataSource,
    displayMessages,
    getScrollOffset,
    isAIGenerating,
    mountedRef,
    pinRef,
    prevScrollOffsetRef,
    scrollToPinned,
    setScrollReduction,
    updateSpacerHeight,
  ]);

  // A pin fired on a split commit may not have an assistant row yet — adopt it
  // when it lands so the spacer signature tracks the live reply.
  useEffect(() => {
    const pin = pinRef.current;
    if (!pin || assistantMessageIndex !== null) return;

    const nextIndex = pin.index + 1;
    if (nextIndex < dataSource.length) {
      setAssistantMessageIndex(nextIndex);
    }
  }, [assistantMessageIndex, dataSource, pinRef]);

  // --- pin re-fire: every time spacer layout settles ---
  useEffect(() => {
    const pin = pinRef.current;
    if (!pin) return;

    if (mounted) {
      pin.seenActive = true;
    }

    // Once the spacer has been seen mounted and is now gone, the pin window
    // closes — either we've reached the target or the user scrolled away.
    if (pin.seenActive && !mounted) {
      clearPin('spacer unmounted after activation');
      // The pin anchored the viewport to the user row for the whole stream,
      // keeping `atBottom` false — so AutoScroll's streaming follower never
      // fires and, on generation end, the viewport would stay stranded at the
      // pin (distanceToBottom ≈ the retired spacer's height). A user scroll-up
      // clears the pin before the unmount, so reaching this branch means the
      // stream ended naturally: with auto-scroll enabled, settle at bottom.
      if (autoScrollEnabled) {
        scrollToBottom(false);
      }
      return;
    }

    scrollToPinned('spacer layout settle');
  }, [
    autoScrollEnabled,
    clearPin,
    mounted,
    pinRef,
    scrollToBottom,
    scrollToPinned,
    spacerLayoutVersion,
  ]);

  // Collapse spacer to unmount once the user has shrunk it to zero.
  useEffect(() => {
    if (renderedHeight === 0 && mounted && isScrollShrinking) {
      setMounted(false);
      setScrollReduction(() => 0);
      prevScrollOffsetRef.current = null;
    }
  }, [
    isScrollShrinking,
    mounted,
    prevScrollOffsetRef,
    renderedHeight,
    setMounted,
    setScrollReduction,
  ]);

  // Recompute spacer height when generation state or tail signature flips.
  useEffect(() => {
    if (!mounted) return;

    requestAnimationFrame(() => {
      updateSpacerHeight();
    });
  }, [isAIGenerating, latestAssistantSignature, mounted, updateSpacerHeight]);

  const listData = useMemo(
    () => (mounted ? [...dataSource, CONVERSATION_SPACER_ID] : dataSource),
    [dataSource, mounted],
  );

  return {
    isScrollShrinking,
    isSpacerMessage: (id: string) => id === CONVERSATION_SPACER_ID,
    listData,
    onScrollOffset,
    registerSpacerNode,
    spacerActive: mounted,
    spacerHeight: renderedHeight,
  };
};
