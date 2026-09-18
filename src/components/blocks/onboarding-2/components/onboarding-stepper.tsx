import { CheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Stepper,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/reui/stepper';

import type { OnboardingStep } from './data';

// Shared so the compact mobile rail and the vertical sidebar rail read as the
// same component at every breakpoint.
const INDICATOR_CLASSNAME =
  'bg-foreground text-background ring-border/60 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:bg-muted-foreground/8 data-[state=inactive]:text-muted-foreground data-[state=inactive]:ring-muted-foreground/12 data-[state=completed]:bg-success dark:bg-foreground dark:text-background dark:ring-border/70 dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background dark:data-[state=inactive]:bg-muted-foreground/14 dark:data-[state=inactive]:text-muted-foreground dark:data-[state=inactive]:ring-muted-foreground/12 dark:data-[state=completed]:bg-success size-5 text-[0.6875rem] ring-1 data-[state=completed]:text-white';

const SEPARATOR_COLOR_CLASSNAME =
  'bg-muted-foreground/12 group-data-[state=active]/step:bg-muted-foreground/12 group-data-[state=inactive]/step:bg-muted-foreground/12 group-data-[state=completed]/step:bg-success dark:bg-muted-foreground/18 dark:group-data-[state=active]/step:bg-muted-foreground/18 dark:group-data-[state=inactive]/step:bg-muted-foreground/18 dark:group-data-[state=completed]/step:bg-success';

const COMPLETED_INDICATOR = <CheckIcon aria-hidden="true" className="size-3" />;

/**
 * Compact horizontal rail for small screens. Stacking the full vertical rail
 * above the form pushes the first field below the fold on a phone, so mobile
 * gets the active step label, a step counter, and a tappable dot rail instead.
 */
export function OnboardingStepperCompact({
  currentStep,
  isComplete,
  onStepChange,
  steps,
}: {
  currentStep: number;
  isComplete: boolean;
  onStepChange: (step: number) => void;
  steps: OnboardingStep[];
}) {
  const { t } = useTranslation('onboarding');
  const activeStep = steps.find((step) => step.value === currentStep);

  return (
    <Stepper
      className="flex w-full flex-col gap-2.5"
      idPrefix="onboarding-compact"
      indicators={{ completed: COMPLETED_INDICATOR }}
      orientation="horizontal"
      value={currentStep}
      onValueChange={onStepChange}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-foreground min-w-0 truncate text-[0.8125rem] leading-4 font-medium">
          {isComplete ? t('reui.action.setupComplete') : activeStep?.label}
        </p>
        <p className="text-muted-foreground shrink-0 text-xs leading-4 tabular-nums">
          {isComplete
            ? t('reui.stepper.counterComplete', { total: steps.length })
            : t('reui.stepper.counter', { current: currentStep, total: steps.length })}
        </p>
      </div>

      <StepperNav aria-label={t('reui.stepper.ariaLabel')} className="w-full">
        {steps.map((step) => (
          <StepperItem
            className="items-center"
            completed={isComplete || currentStep > step.value}
            key={step.id}
            step={step.value}
          >
            {/* -my-2 py-2 keeps the row 20px tall while giving the dot a 36px
                tap target. */}
            <StepperTrigger
              className="-my-2 shrink-0 py-2"
              aria-label={t('reui.stepper.ariaStep', {
                label: step.label,
                step: step.value,
              })}
            >
              <StepperIndicator className={INDICATOR_CLASSNAME}>{step.value}</StepperIndicator>
            </StepperTrigger>
            {step.value < steps.length ? (
              <StepperSeparator className={`${SEPARATOR_COLOR_CLASSNAME} mx-1.5`} />
            ) : null}
          </StepperItem>
        ))}
      </StepperNav>
    </Stepper>
  );
}

export function OnboardingStepper({
  currentStep,
  isComplete,
  onStepChange,
  steps,
}: {
  currentStep: number;
  isComplete: boolean;
  onStepChange: (step: number) => void;
  steps: OnboardingStep[];
}) {
  const { t } = useTranslation('onboarding');

  return (
    <Stepper
      className="flex w-full flex-col items-start justify-center gap-0"
      idPrefix="onboarding-sidebar"
      indicators={{ completed: COMPLETED_INDICATOR }}
      orientation="vertical"
      value={currentStep}
      onValueChange={onStepChange}
    >
      <StepperNav aria-label={t('reui.stepper.ariaLabel')} className="w-full">
        {steps.map((step) => {
          const description = t(`reui.stepper.${step.id}` as const);

          return (
            <StepperItem
              className="relative items-start not-last:flex-1"
              completed={isComplete || currentStep > step.value}
              key={step.id}
              step={step.value}
            >
              <StepperTrigger className="w-full items-start gap-2.5 pb-4 text-left last:pb-0">
                <StepperIndicator className={INDICATOR_CLASSNAME}>{step.value}</StepperIndicator>
                <div className="mt-0.5 min-w-0 flex-1 text-left">
                  <StepperTitle className="!text-[0.8125rem] !leading-4">{step.label}</StepperTitle>
                  <StepperDescription className="mt-0.5 max-w-none !text-xs !leading-4">
                    {description}
                  </StepperDescription>
                </div>
              </StepperTrigger>
              {step.value < steps.length ? (
                <StepperSeparator
                  className={`${SEPARATOR_COLOR_CLASSNAME} absolute inset-y-0 top-6 left-2.5 -order-1 m-0 !h-[calc(100%-1.75rem)] -translate-x-1/2`}
                />
              ) : null}
            </StepperItem>
          );
        })}
      </StepperNav>
    </Stepper>
  );
}
