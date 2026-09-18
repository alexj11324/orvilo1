'use client';

import '@/app/globals.css';

import { memo } from 'react';
import { useNavigate } from 'react-router';

import { Onboarding } from '@/components/blocks/onboarding-2/components/onboarding';
import { useUserStore } from '@/store/user';

import { finishOnboardingAndNavigate } from './finishOnboarding';

const OnboardingPage = memo(() => {
  const navigate = useNavigate();
  const finishOnboarding = useUserStore((s) => s.finishOnboarding);

  return (
    <Onboarding onFinish={() => void finishOnboardingAndNavigate(finishOnboarding, navigate)} />
  );
});

OnboardingPage.displayName = 'OnboardingPage';

export default OnboardingPage;
