'use client';

import { Flexbox } from '@lobehub/ui';
import { createStaticStyles, cx } from 'antd-style';
import { lazy, memo, Suspense, useCallback, useEffect, useState } from 'react';

import { useHomeUsageWidgetActive } from '@/business/client/features/HomeUsageWidget';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/slices/auth/selectors';

import { isHomeMinimalLayout } from './CustomizeModal/config';
import HomeHeader from './HomeHeader';
import HomeModeContent from './HomeModeContent';
import InputArea from './InputArea';
import { RAIL_INBOX_PROPS, resolveRailVisibility } from './railVisibility';
import type { HomeMode } from './types';

export const DEFAULT_HOME_MODE: HomeMode = 'chat';
export const ONBOARDING_HOME_MODE_PARAM = 'onboarding';
export const ONBOARDING_HOME_MODE_TASK_VALUE = 'task';

export const resolveInitialHomeMode = (search: string): HomeMode => {
  const params = new URLSearchParams(search);
  return params.get(ONBOARDING_HOME_MODE_PARAM) === ONBOARDING_HOME_MODE_TASK_VALUE
    ? 'task'
    : DEFAULT_HOME_MODE;
};

const clearOnboardingHomeModeParam = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (url.searchParams.get(ONBOARDING_HOME_MODE_PARAM) !== ONBOARDING_HOME_MODE_TASK_VALUE) return;

  url.searchParams.delete(ONBOARDING_HOME_MODE_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

// The inbox renders markdown, briefs and an editor; keeping it lazy leaves the
// greeting and the input box as the only static content of the home route.
const HomeInbox = lazy(() => import('@/features/HomeInbox'));

/** Trailing gutter that keeps the rail's cards off the page's scroll lane. */
const RAIL_GUTTER = 14;
const RAIL_CARD_WIDTH = 380;
const RAIL_COLUMN_GAP = 28;
const RAIL_EXIT_OFFSET = 24;
const RAIL_TRANSITION_DURATION = 220;
/** The card column, its gutter and the gap that separates it from the main one. */
const RAIL_RECLAIMED_WIDTH = RAIL_CARD_WIDTH + RAIL_GUTTER + RAIL_COLUMN_GAP;
/** Space between the greeting row and the rows that follow it. */
const ROW_GAP = 24;
const MINIMAL_STACK_GAP = 24;
/**
 * The minimal header stacks the agent switcher (24px avatar + 2px paddings,
 * from AgentSelect) over the greeting line (22px × 1.4, from HomeHeader) with
 * an 8px gap. That stack's height plus the gap below it is what the block must
 * shed under itself to land the composer, not the stack's midpoint, on the
 * center of the lane.
 */
const MINIMAL_GREETING_LINE = Math.round(22 * 1.4);
const MINIMAL_SWITCHER_ROW = 28;
const MINIMAL_HEADER_GAP = 8;
const MINIMAL_HEADER_HEIGHT = MINIMAL_SWITCHER_ROW + MINIMAL_HEADER_GAP + MINIMAL_GREETING_LINE;
const MINIMAL_LIFT = MINIMAL_HEADER_HEIGHT + MINIMAL_STACK_GAP;

const styles = createStaticStyles(({ css }) => ({
  // Both rows size to their content and the page scrolls around the whole grid
  // (see the route). Giving each column its own scroll viewport made the page
  // scroll in pieces: the topic list moved under a pinned greeting while the
  // rail sat still, and no gesture moved the dashboard as a whole.
  grid: css`
    /* The nav panel takes 240–400px out of the viewport, so viewport breakpoints
       say nothing about the room this dashboard actually has. */
    container: home / inline-size;
    display: grid;
    grid-template-columns: minmax(0, 1fr) ${RAIL_CARD_WIDTH + RAIL_GUTTER}px;
    grid-template-rows: auto auto;
    gap: ${ROW_GAP}px ${RAIL_COLUMN_GAP}px;

    width: 100%;

    @media (width <= 1100px) {
      grid-template-columns: 1fr;
      grid-template-rows: auto auto auto;
    }
  `,
  content: css`
    /* An explicit width is what makes the collapse animate: the stretched
       default computes to "auto", which cannot interpolate against a length,
       so the width would snap instead of sliding open. */
    width: 100%;
    transition: width ${RAIL_TRANSITION_DURATION}ms ease-out;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
  // Collapsed, the rail's whole track is handed to the content, which keeps its
  // inline start and simply reads wider.
  contentCollapsed: css`
    @media (width > 1100px) {
      width: calc(100% + ${RAIL_RECLAIMED_WIDTH}px);
    }
  `,
  hero: css`
    display: grid;
    grid-area: 1 / 1 / 2 / -1;
    grid-template-columns: minmax(0, 1fr);

    width: 100%;
    min-width: 0;
  `,
  header: css`
    min-width: 0;
  `,
  inputArea: css`
    position: relative;
    min-width: 0;
  `,
  main: css`
    position: relative;
    grid-area: 2 / 1;
    min-width: 0;
  `,
  // Nothing stacks under the composer any more, so the page stops being a
  // dashboard: greeting and composer read as one block, on a measure of their
  // own rather than the dashboard's full span.
  //
  // The route centers this block with auto margins, which would put the pair's
  // midpoint on the center and leave the composer — the thing you actually look
  // at — sitting low. The trailing pad is counted into the centered box, so it
  // lifts everything by half its height and hands the composer the center.
  minimal: css`
    width: 100%;
    max-inline-size: 760px;
    margin-inline: auto;
    padding-block-end: ${MINIMAL_LIFT}px;
  `,
  railSurface: css`
    transform: translateX(0);
    visibility: visible;
    opacity: 1;
    transition:
      opacity ${RAIL_TRANSITION_DURATION}ms ease-out,
      transform ${RAIL_TRANSITION_DURATION}ms ease-out,
      visibility 0s linear;

    &[data-collapsed='true'] {
      pointer-events: none;

      transform: translateX(${RAIL_EXIT_OFFSET}px);

      visibility: hidden;
      opacity: 0;

      transition-delay: 0s, 0s, ${RAIL_TRANSITION_DURATION}ms;

      &:dir(rtl) {
        transform: translateX(-${RAIL_EXIT_OFFSET}px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }

    @media (width <= 1100px) {
      &[data-collapsed='true'] {
        display: none;
      }
    }
  `,
  // Above the main column, and with a trailing gutter that keeps the cards
  // short of the column edge, so they stop where the main column's rows stop
  // instead of running to the page margin.
  rail: css`
    position: relative;
    z-index: 1;

    display: flex;
    grid-area: 2 / 2;
    flex-direction: column;

    min-width: 0;
    padding-inline-end: ${RAIL_GUTTER}px;

    @media (width <= 1100px) {
      grid-area: 3 / 1;
      justify-self: end;
      width: min(100%, ${RAIL_CARD_WIDTH + RAIL_GUTTER}px);
    }
  `,
}));

const Home = memo(() => {
  const isLogin = useUserStore(authSelectors.isLogin);
  const showHomeRail = useGlobalStore(systemStatusSelectors.showHomeRail);
  const hiddenWidgets = useGlobalStore(systemStatusSelectors.hiddenHomeWidgets);
  const usageActive = useHomeUsageWidgetActive();
  const minimal = isHomeMinimalLayout(hiddenWidgets, usageActive);
  const [mode, setMode] = useState<HomeMode>(() =>
    resolveInitialHomeMode(typeof window === 'undefined' ? '' : window.location.search),
  );
  const [inputValue, setInputValue] = useState('');

  const railVisible = resolveRailVisibility({ hiddenWidgets, isLogin, showHomeRail, usageActive });
  const railCollapsed = !railVisible;

  useEffect(() => {
    clearOnboardingHomeModeParam();
  }, []);

  const handleInputValueChange = useCallback((value: string) => {
    setInputValue(value);
    useChatStore.setState({ inputMessage: value });
  }, []);

  const handleSuggestionSelect = useCallback(
    (prompt: string) => {
      handleInputValueChange(prompt);

      const editor = useChatStore.getState().mainInputEditor;
      editor?.instance?.setDocument('markdown', prompt);
      editor?.focus();
    },
    [handleInputValueChange],
  );

  if (minimal)
    return (
      <Flexbox className={styles.minimal} gap={MINIMAL_STACK_GAP}>
        <HomeHeader centered />
        <div className={styles.inputArea}>
          <InputArea
            inputValue={inputValue}
            mode={mode}
            onInputValueChange={handleInputValueChange}
            onModeChange={setMode}
          />
        </div>
      </Flexbox>
    );

  return (
    <Flexbox className={styles.grid}>
      <div className={styles.hero}>
        <div className={styles.header}>
          <HomeHeader />
        </div>
      </div>

      <Flexbox
        className={cx(styles.main, styles.content, railCollapsed && styles.contentCollapsed)}
        data-testid={'home-main'}
        gap={24}
      >
        <Flexbox className={styles.inputArea} gap={12}>
          <InputArea
            showNewModelShortcuts
            inputValue={inputValue}
            mode={mode}
            onInputValueChange={handleInputValueChange}
            onModeChange={setMode}
          />
        </Flexbox>
        <HomeModeContent
          inlineRail={railCollapsed && isLogin}
          mode={mode}
          onSuggestionSelect={handleSuggestionSelect}
        />
      </Flexbox>

      {isLogin && (
        <aside
          aria-hidden={railCollapsed}
          className={cx(styles.rail, styles.railSurface)}
          data-collapsed={railCollapsed}
          data-testid={'home-rail'}
          id={'home-rail'}
          inert={railCollapsed}
        >
          <Suspense fallback={null}>
            <HomeInbox {...RAIL_INBOX_PROPS} variant={'rail'} />
          </Suspense>
        </aside>
      )}
    </Flexbox>
  );
});

export default Home;
