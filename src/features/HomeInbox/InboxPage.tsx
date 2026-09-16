'use client';

import { Center, Empty, Flexbox } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import HomeInbox from '@/features/HomeInbox';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';

/**
 * The inbox as a route of its own.
 *
 * `HomeInbox` was reachable only through the old Home page, and Web stopped
 * mounting that page when the task list became its landing surface. Briefs and
 * the "needs you" section therefore lost every entry point on Web, while unread
 * state survived only as badges on the sidebar's agent rows and dots in a
 * conversation's topic list — per-agent, never aggregated.
 *
 * The capability itself needed nothing from Home: no `HomeLayout`, no context
 * provider, no particular path. So the plan's answer applies directly — extract
 * the mountable capability and give it a thin route, rather than revive the page
 * the capability happened to ship inside.
 *
 * `variant='main'` is the full column (the `rail` variant is the folded sidebar
 * form), and `inlineRail` is what makes the main column *carry* the sections the
 * rail owns. Without it `ownsRailSections` is false for a `main` variant and
 * goals, the daily brief and usage are neither fetched nor rendered — this page
 * has no rail for them to fall back to, so it is the main column or nothing.
 *
 * No `hide*` flags are passed, which is not the same as the page ignoring the
 * home-widget preference. That preference still reaches exactly two blocks here —
 * `suggestions` (through `useRecommendationsVisible`) and the `usage` business
 * slot (`HomeInbox/index.tsx:206`) — and nothing else: the briefs, the daily
 * brief, goals and the unread/running topics are gated by `inlineRail` and by the
 * host's props. Worth knowing for two reasons. It is why this page cannot go
 * blank no matter what was hidden, and on Web the preference has **no writer at
 * all** — its only UI is `CustomizeButton`, which lives on the Electron-only
 * `/home` route — so a stored value can suppress those two blocks here with no
 * way to undo it. Severity and the options are in the rollout doc §2.2.
 */
const InboxPage = memo(() => {
  const { t } = useTranslation('electron');
  const { t: tHome } = useTranslation('home');

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('navigation.inbox')}
          </Text>
        }
      />
      <WideScreenContainer gap={16} paddingBlock={16} wrapperStyle={{ flex: 1, overflowY: 'auto' }}>
        <HomeInbox
          inlineRail
          variant={'main'}
          emptyState={
            <Center paddingBlock={48}>
              <Empty description={tHome('inbox.empty.desc')} title={tHome('inbox.empty.title')} />
            </Center>
          }
        />
      </WideScreenContainer>
    </Flexbox>
  );
});

InboxPage.displayName = 'InboxPage';

export default InboxPage;
