/** Setup and account recovery stay reachable before onboarding finishes. */
export const isFirstAgentSetupPath = (pathname: string): boolean =>
  /^(?:\/[^/]+)?\/settings\/(?:provider|creds|credential|agents|devices|profile|account)(?:\/|$)/.test(
    pathname,
  );
