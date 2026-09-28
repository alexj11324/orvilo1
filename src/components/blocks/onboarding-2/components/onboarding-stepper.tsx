'use client';

import { useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { useTranslation } from 'react-i18next';

import type { OnboardingStep } from './data';

/**
 * ReUI Onboarding4 uses a full-width progress rail above the page content.
 * The rail is intentionally semantic rather than a set of 4px controls: the
 * header owns the accessible back action, so the progress indicator cannot
 * create a clipped keyboard or tap target.
 */
export function OnboardingStepper({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: OnboardingStep[];
}) {
  const { t } = useTranslation('onboarding');
  const shouldReduceMotion = useReducedMotion();
  const clampedStep = Math.min(Math.max(currentStep, 1), steps.length);
  const progress = `${(clampedStep / steps.length) * 100}%`;
  const activeStep = steps[clampedStep - 1];
  const progressLabel = t('reui.stepper.counter', {
    current: clampedStep,
    total: steps.length,
  });

  return (
    <div
      aria-label={t('reui.stepper.ariaLabel')}
      aria-valuemax={steps.length}
      aria-valuemin={1}
      aria-valuenow={clampedStep}
      aria-valuetext={activeStep ? `${progressLabel}: ${activeStep.label}` : progressLabel}
      className="bg-muted relative h-1 w-full overflow-hidden rounded-none"
      role="progressbar"
    >
      <m.span
        animate={{ width: progress }}
        aria-hidden="true"
        className="bg-primary pointer-events-none absolute inset-y-0 left-0 z-10 overflow-hidden"
        initial={false}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 220, damping: 28, mass: 0.7 }
        }
      >
        <m.span
          aria-hidden="true"
          className="via-primary-foreground/50 absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-transparent opacity-70"
          initial={false}
          key={clampedStep}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.8, ease: 'easeOut' }}
          animate={
            shouldReduceMotion ? { opacity: 0 } : { x: ['-120%', '120%'], opacity: [0, 0.7, 0] }
          }
        />
      </m.span>
      <span aria-live="polite" className="sr-only">
        {activeStep ? `${progressLabel}: ${activeStep.label}` : progressLabel}
      </span>
    </div>
  );
}
