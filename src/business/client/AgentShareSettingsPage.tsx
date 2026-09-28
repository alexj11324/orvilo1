/**
 * Business slot: the creator-facing Agent Share settings page.
 *
 * Every entry point to this route is hidden when
 * {@link useAgentShareSupported} reports "not supported". The route itself is
 * still registered, though, so the URL stays reachable — a pasted link or a
 * bookmark lands here on a deployment that has no such surface. The default
 * therefore renders an explanation and a way back, rather than nothing.
 */
export { default } from '@/features/Share/AgentShareUnavailable';
