'use client';

import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTrigger,
} from '@/components/reui/stepper';

const steps = [1, 2, 3, 4];

export function Pattern() {
  return (
    <Stepper className="w-full max-w-md space-y-8" defaultValue={2}>
      <StepperNav>
        {steps.map((step) => (
          <StepperItem key={step} step={step}>
            <StepperTrigger>
              <StepperIndicator>{step}</StepperIndicator>
            </StepperTrigger>
            {steps.length > step && (
              <StepperSeparator className="group-data-[state=completed]/step:bg-primary" />
            )}
          </StepperItem>
        ))}
      </StepperNav>

      <StepperPanel className="text-sm">
        {steps.map((step) => (
          <StepperContent className="flex items-center justify-center" key={step} value={step}>
            Step {step} content
          </StepperContent>
        ))}
      </StepperPanel>
    </Stepper>
  );
}
