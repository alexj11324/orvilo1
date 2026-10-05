import { fireEvent, render, screen } from '@testing-library/react';
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

it('blocks continuing and skipping an overlong workspace URL until it is corrected', async () => {
  translations.ready = true;
  const onComplete = vi.fn();
  render(
    <Onboarding
      initialFullName="First user"
      initialWorkspaceName="My Workspace"
      initialWorkspaceSlug="public-release-acceptance-20261004"
      onComplete={onComplete}
    />,
  );
  for (let step = 1; step < 4; step++) {
    fireEvent.click(screen.getByRole('button', { name: 'Loaded reui.action.continue' }));
  }
  const slug = await screen.findByRole('textbox', { name: /Loaded reui.workspace.url/ });
  const continueButton = screen.getByRole('button', { name: 'Loaded reui.action.continue' });
  expect(continueButton).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Loaded reui.action.skip' })).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('workspace.wizard.step1.slug.invalidLength');
  fireEvent.submit(continueButton.closest('form')!);
  expect(onComplete).not.toHaveBeenCalled();

  fireEvent.change(slug, { target: { value: 'public-release-acceptance' } });
  expect(continueButton).toBeEnabled();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.change(slug, { target: { value: '' } });
  expect(continueButton).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Loaded reui.action.skip' })).toBeEnabled();
});
