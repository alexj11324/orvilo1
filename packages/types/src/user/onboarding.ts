import { z } from 'zod';

export interface UserOnboarding {
  /** Current step number (1-based), for resuming onboarding */
  currentStep?: number;
  /** Timestamp when onboarding was completed (ISO 8601) */
  finishedAt?: string;
  /** Values collected by the web setup wizard and kept with the onboarding record. */
  setup?: UserOnboardingSetup;
  /** Onboarding flow version for future upgrades */
  version: number;
}

export interface UserOnboardingSetup {
  discoveryOther?: string;
  discoverySource?: string;
  goals?: string[];
  jobTitle?: string;
  role?: string;
  teamSize?: string;
  workspaceId?: string;
  workspaceName?: string;
  workspaceSlug?: string;
}

export const OnboardingStep = {
  Welcome: 1,
  ConnectApps: 2,
  LearnYourWorld: 3,
  Profile: 4,
  ChiefAgent: 5,
  Messenger: 6,
  StarterTasks: 7,
} as const;

export type OnboardingStep = (typeof OnboardingStep)[keyof typeof OnboardingStep];

export interface OnboardingCapabilities {
  analysis: boolean;
  composio: boolean;
  messenger: boolean;
  starterTasks: boolean;
}

export const MAX_ONBOARDING_STEPS = 7;

export const CLASSIC_ONBOARDING_MAX_STEP = 4;

export const UserOnboardingSchema = z.object({
  currentStep: z.number().min(1).max(MAX_ONBOARDING_STEPS).optional(),
  finishedAt: z.string().optional(),
  setup: z
    .object({
      discoveryOther: z.string().max(255).optional(),
      discoverySource: z.string().max(64).optional(),
      goals: z.array(z.string().max(64)).max(20).optional(),
      jobTitle: z.string().max(255).optional(),
      role: z.string().max(64).optional(),
      teamSize: z.string().max(64).optional(),
      workspaceId: z.string().max(128).optional(),
      workspaceName: z.string().max(255).optional(),
      workspaceSlug: z.string().max(100).optional(),
    })
    .optional(),
  version: z.number(),
});
