import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { Onboarding } from './onboarding';

const translations = vi.hoisted(() => ({ ready: false }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    ready: translations.ready,
    t: (key: string) => (translations.ready ? `Loaded ${key}` : key),
  }),
}));
vi.mock('@/services/onboardingMetrics', () => ({
  trackOnboardingCompleted: vi.fn(),
  trackOnboardingStarted: vi.fn(),
  trackOnboardingStepCompleted: vi.fn(),
  trackOnboardingStepViewed: vi.fn(),
}));

it('waits for the onboarding namespace before showing the profile form', () => {
  const view = render(<Onboarding initialFullName="First user" />);
  expect(screen.queryByRole('textbox', { name: /reui.profile.fullName/ })).toBeNull();
  expect(view.container.textContent).not.toContain('reui.');

  translations.ready = true;
  view.rerender(<Onboarding initialFullName="First user" />);
  expect(screen.getByRole('textbox', { name: /Loaded reui.profile.fullName/ })).toHaveValue(
    'First user',
  );
});
