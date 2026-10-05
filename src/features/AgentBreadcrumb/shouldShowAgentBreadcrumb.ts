/**
 * AgentBreadcrumb is chat-context navigation: the agent name links back to
 * that agent's chat home. Settings surfaces embed the profile page but are a
 * different IA — the sidebar gives back-nav and the page H1 shows the name —
 * so no breadcrumb element renders under a `/settings/` path.
 */
export const shouldShowAgentBreadcrumb = (pathname: string): boolean =>
  !/(?:^|\/)settings(?:\/|$)/.test(pathname);
