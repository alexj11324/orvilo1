'use client';

import { BUILTIN_AGENT_SLUGS } from '@orvilo/builtin-agents';
import { type FC, memo, type PropsWithChildren, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';

import NotFound from '@/components/404';
import { useDefaultAgentState } from '@/features/DefaultAgent/useDefaultAgent';
import { useBuiltinHarnessOffered } from '@/features/HeterogeneousAgent/builtinHarness';
import { isSelfEvolvingPath } from '@/features/SelfLearning/availability';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';

import { resolveRuntimeAccess } from './resolveRuntimeAccess';

const BUILTIN_SLUG_SET = new Set<string>(Object.values(BUILTIN_AGENT_SLUGS));

/**
 * Terminal 404 card for an agent whose config fetch settled on `null` — it
 * doesn't exist or the viewer lost access (e.g. a workspace agent switched
 * back to private by its owner).
 */
export const AgentNotFound = memo(() => {
  const { t } = useTranslation('chat');

  return <NotFound hideWatermark desc={t('agentNotFound.desc')} title={t('agentNotFound.title')} />;
});

AgentNotFound.displayName = 'AgentNotFound';

/**
 * Replaces children with the 404 card when the routed agent (`:aid`) resolved
 * to not-found / no-access. Builtin slugs are skipped: they are not real agent
 * ids (AgentIdSync redirects them to the resolved id), so a `null` fetch on
 * the slug key must not flash a 404.
 *
 * The not-found flag is cleared by any later successful fetch (e.g. the agent
 * is made public again), so the guard recovers without a manual refresh.
 */
export const AgentNotFoundGuard: FC<PropsWithChildren> = memo(({ children }) => {
  const params = useParams<{ aid?: string }>();
  const aid = params.aid && !BUILTIN_SLUG_SET.has(params.aid) ? params.aid : '';
  const isNotFound = useAgentStore(agentByIdSelectors.isAgentNotFoundById(aid));

  if (isNotFound) return <AgentNotFound />;

  return children;
});

AgentNotFoundGuard.displayName = 'AgentNotFoundGuard';

/**
 * Replaces children with an unavailable card when the routed agent runs on a
 * runtime the deployment does not offer — reached by a saved link or a typed
 * URL, since every list already leaves such agents out. The agent and its
 * history are untouched and come back with the runtime.
 */
export const AgentRuntimeWithheldGuard: FC<PropsWithChildren> = memo(({ children }) => {
  const { t } = useTranslation('chat');
  const { aid = '' } = useParams<{ aid?: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const builtinOffered = useBuiltinHarnessOffered();
  const isBuiltinAgent = useAgentStore(
    (s) => BUILTIN_SLUG_SET.has(aid) || Object.values(s.builtinAgentIdMap).includes(aid),
  );
  const listed = useHomeStore(homeAgentListSelectors.getAgentById(aid));
  // The verdict below waits on the Agent list, so this guard makes sure it loads.
  // A failed list fetch must not blank the page: the verdict then falls back to
  // what is already known, and the list's own retry settles it later.
  const { error: listError } = useFetchAgentList();
  const { agent: defaultAgent, ready: listReady } = useDefaultAgentState();
  const ready = listReady || !!listError;
  const access = resolveRuntimeAccess({
    builtinOffered,
    defaultAgentId: defaultAgent?.agentId,
    isBuiltinAgent,
    listed,
    ready,
  });
  const forwardTo = access.kind === 'forward' ? access.agentId : undefined;
  const { pathname } = useLocation();
  const leaveSelfEvolving =
    !builtinOffered && access.kind === 'open' && isSelfEvolvingPath(pathname);

  // Keyed on the route too: the inbox slug is swapped for the agent's id by
  // AgentIdSync, which lands on another built-in route with the same target.
  useEffect(() => {
    if (forwardTo) navigate(`/agent/${forwardTo}`, { replace: true });
  }, [aid, forwardTo, navigate]);

  useEffect(() => {
    if (leaveSelfEvolving) navigate(`/agent/${aid}`, { replace: true });
  }, [aid, leaveSelfEvolving, navigate]);

  if (access.kind === 'pending' || access.kind === 'forward' || leaveSelfEvolving) return null;
  if (access.kind === 'withheld')
    return (
      <NotFound
        hideWatermark
        desc={t('agentRuntimeWithheld.desc')}
        title={t('agentNotFound.title')}
      />
    );

  return children;
});

AgentRuntimeWithheldGuard.displayName = 'AgentRuntimeWithheldGuard';
