'use client';

import { memo } from 'react';
import { Navigate, useSearchParams } from 'react-router';

import { resolveDesktopOnboardingRedirectTarget } from './redirectTarget';

/**
 * Compatibility redirect for the retired `/desktop-onboarding` business flow.
 * `/onboarding` owns the account-onboarding state machine on every client;
 * this route only forwards legacy links to a legal target — see
 * `resolveDesktopOnboardingRedirectTarget` for the mapping rules.
 */
const DesktopOnboardingRedirect = memo(() => {
  const [searchParams] = useSearchParams();

  return <Navigate replace to={resolveDesktopOnboardingRedirectTarget(searchParams)} />;
});

DesktopOnboardingRedirect.displayName = 'DesktopOnboardingRedirect';

export default DesktopOnboardingRedirect;
