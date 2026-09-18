'use client';

import { CheckIcon, CircleCheckIcon, PlusIcon, RocketIcon } from 'lucide-react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { type CSSProperties, type FormEvent, useState } from 'react';

import { Frame, FramePanel } from '@/components/reui/frame';
import { IconStack } from '@/components/reui/icon-stack';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from '@/components/ui/combobox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemGroup, ItemMedia } from '@/components/ui/item';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import {
  DEFAULT_INVITES,
  DISCOVERY_SOURCE_OPTIONS,
  type DiscoverySourceValue,
  GOAL_OPTIONS,
  type GoalValue,
  INVITE_ROLE_OPTIONS,
  type InviteRoleValue,
  type InviteRow,
  ONBOARDING_STEPS,
  ROLE_OPTIONS,
  type RoleValue,
  TEAM_SIZE_OPTIONS,
  type TeamSizeValue,
} from './data';
import { ImageUploadField } from './image-upload-field';
import { OnboardingPageBackground } from './onboarding-background';
import { OnboardingHeader } from './onboarding-header';
import { OnboardingStepper, OnboardingStepperCompact } from './onboarding-stepper';

const TOTAL_STEPS = ONBOARDING_STEPS.length;
const TIMEZONE_GROUPS = [
  {
    value: 'Americas',
    items: [
      '(GMT-5) New York',
      '(GMT-8) Los Angeles',
      '(GMT-6) Chicago',
      '(GMT-5) Toronto',
      '(GMT-8) Vancouver',
      '(GMT-3) Sao Paulo',
    ],
  },
  {
    value: 'Europe',
    items: [
      '(GMT+0) London',
      '(GMT+1) Paris',
      '(GMT+1) Berlin',
      '(GMT+1) Rome',
      '(GMT+1) Madrid',
      '(GMT+1) Amsterdam',
    ],
  },
  {
    value: 'Asia/Pacific',
    items: [
      '(GMT+9) Tokyo',
      '(GMT+8) Shanghai',
      '(GMT+8) Singapore',
      '(GMT+4) Dubai',
      '(GMT+11) Sydney',
      '(GMT+9) Seoul',
    ],
  },
];

function getInviteRoleLabel(role: InviteRoleValue) {
  return INVITE_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div aria-live="polite" className="flex max-w-md flex-col gap-1.5">
      <h1 className="text-foreground text-xl leading-7 font-semibold text-balance sm:text-[1.375rem]">
        {title}
      </h1>
      <p className="text-muted-foreground text-sm leading-5 text-pretty">{description}</p>
    </div>
  );
}

function ProfileStep({
  fullName,
  jobTitle,
  marketingOptIn,
  onFullNameChange,
  onJobTitleChange,
  onMarketingOptInChange,
}: {
  fullName: string;
  jobTitle: string;
  marketingOptIn: boolean;
  onFullNameChange: (name: string) => void;
  onJobTitleChange: (title: string) => void;
  onMarketingOptInChange: (checked: boolean) => void;
}) {
  return (
    <FieldSet>
      <FieldLegend className="sr-only">Profile details</FieldLegend>
      <FieldGroup className="gap-4">
        <Field>
          <ImageUploadField
            alt="Sam Rivera"
            description="PNG or JPG, at least 400 x 400 px, up to 10 MB."
            inputId="onboarding-2-profile-photo"
            replaceLabel="Replace photo"
            uploadLabel="Upload photo"
          />
        </Field>

        <FieldGroup className="gap-4">
          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-name">
              Full name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              autoComplete="name"
              id="onboarding-2-name"
              value={fullName}
              onChange={(event) => onFullNameChange(event.target.value)}
            />
          </Field>

          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-title">Job title</FieldLabel>
            <Input
              autoComplete="organization-title"
              id="onboarding-2-title"
              value={jobTitle}
              onChange={(event) => onJobTitleChange(event.target.value)}
            />
          </Field>

          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-timezone">Timezone</FieldLabel>
            <Combobox items={TIMEZONE_GROUPS}>
              <ComboboxInput
                className="w-full"
                id="onboarding-2-timezone"
                placeholder="Select a timezone"
              />
              <ComboboxContent className="w-(--anchor-width) min-w-(--anchor-width)">
                <ComboboxEmpty>No timezones found.</ComboboxEmpty>
                <ComboboxList>
                  {(group) => (
                    <ComboboxGroup items={group.items} key={group.value}>
                      <ComboboxLabel>{group.value}</ComboboxLabel>
                      <ComboboxCollection>
                        {(item) => (
                          <ComboboxItem key={item} value={item}>
                            {item}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                      <ComboboxSeparator className="group-last/combobox-group:hidden" />
                    </ComboboxGroup>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Field>
        </FieldGroup>

        <Field className="gap-2.5" orientation="horizontal">
          <Checkbox
            checked={marketingOptIn}
            id="onboarding-2-marketing"
            onCheckedChange={(checked) => onMarketingOptInChange(checked === true)}
          />
          <FieldLabel
            className="text-muted-foreground font-normal"
            htmlFor="onboarding-2-marketing"
          >
            Send me product updates and workspace tips.
          </FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

function RoleStep({
  role,
  onRoleChange,
}: {
  role: RoleValue;
  onRoleChange: (role: RoleValue) => void;
}) {
  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label">Select one</FieldLegend>
      <RadioGroup
        aria-label="Select your role"
        value={role}
        onValueChange={(value) => onRoleChange(value as RoleValue)}
      >
        <ItemGroup className="gap-2">
          {ROLE_OPTIONS.map((option) => {
            const fieldId = `onboarding-2-role-${option.value}`;

            return (
              <Item key={option.value} size="sm" variant="outline">
                <Field className="w-full gap-3" orientation="horizontal">
                  <RadioGroupItem id={fieldId} value={option.value} />
                  <FieldLabel className="items-center leading-none" htmlFor={fieldId}>
                    <span className="truncate font-medium">{option.label}</span>
                  </FieldLabel>
                </Field>
              </Item>
            );
          })}
        </ItemGroup>
      </RadioGroup>
    </FieldSet>
  );
}

function SourceStep({
  source,
  otherSource,
  onSourceChange,
  onOtherSourceChange,
}: {
  source: DiscoverySourceValue | '';
  otherSource: string;
  onSourceChange: (source: DiscoverySourceValue) => void;
  onOtherSourceChange: (source: string) => void;
}) {
  return (
    <FieldSet className="gap-4">
      <FieldLegend className="sr-only">Discovery source</FieldLegend>
      <FieldGroup aria-label="How did you hear about us?" className="flex-row flex-wrap gap-2">
        {DISCOVERY_SOURCE_OPTIONS.map((option) => {
          const selected = option.value === source;

          return (
            <Button
              aria-pressed={selected}
              className={cn(selected && 'border-primary/30 bg-primary/5')}
              key={option.value}
              size="lg"
              type="button"
              variant="outline"
              onClick={() => onSourceChange(option.value)}
            >
              <span
                className={cn(
                  'text-muted-foreground flex shrink-0 items-center [&_svg]:size-4',
                  selected && 'text-primary',
                )}
              >
                {option.icon}
              </span>
              <span>{option.label}</span>
              {selected ? <CheckIcon aria-hidden="true" className="size-4 shrink-0" /> : null}
            </Button>
          );
        })}
      </FieldGroup>

      {source === 'other' ? (
        <Field className="max-w-sm gap-2">
          <FieldLabel htmlFor="onboarding-2-source-other-text">
            Where did you hear about Orvilo?
          </FieldLabel>
          <Input
            autoComplete="off"
            id="onboarding-2-source-other-text"
            placeholder="Type the source"
            value={otherSource}
            onChange={(event) => onOtherSourceChange(event.target.value)}
          />
        </Field>
      ) : null}
    </FieldSet>
  );
}

function WorkspaceStep({
  workspaceName,
  workspaceSlug,
  teamSize,
  onWorkspaceNameChange,
  onWorkspaceSlugChange,
  onTeamSizeChange,
}: {
  workspaceName: string;
  workspaceSlug: string;
  teamSize: TeamSizeValue;
  onWorkspaceNameChange: (value: string) => void;
  onWorkspaceSlugChange: (value: string) => void;
  onTeamSizeChange: (value: TeamSizeValue) => void;
}) {
  return (
    <FieldSet>
      <FieldLegend className="sr-only">Workspace setup</FieldLegend>
      <FieldGroup className="gap-5">
        <FieldGroup className="gap-4">
          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-workspace">
              Workspace name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              autoComplete="organization"
              id="onboarding-2-workspace"
              value={workspaceName}
              onChange={(event) => onWorkspaceNameChange(event.target.value)}
            />
          </Field>

          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-url">
              Workspace URL <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              autoComplete="off"
              id="onboarding-2-url"
              value={workspaceSlug}
              onChange={(event) => onWorkspaceSlugChange(event.target.value)}
            />
            <FieldDescription>
              Your workspace will open at orvilo.aspectlylabs.com/
              {workspaceSlug.trim() || 'workspace'}.
            </FieldDescription>
          </Field>
        </FieldGroup>

        <FieldSet className="gap-5">
          <FieldLegend className="mb-4" variant="label">
            How many people will use this workspace?
          </FieldLegend>
          <FieldGroup aria-label="Workspace team size" className="flex-row flex-wrap gap-2">
            {TEAM_SIZE_OPTIONS.map((option) => {
              const selected = option.value === teamSize;

              return (
                <Button
                  aria-pressed={selected}
                  key={option.value}
                  type="button"
                  variant="outline"
                  className={cn(
                    'relative overflow-visible px-5',
                    selected && 'border-primary/30 bg-primary/5',
                  )}
                  onClick={() => onTeamSizeChange(option.value)}
                >
                  <span>{option.label}</span>
                  {selected ? (
                    <Item
                      className="bg-primary text-primary-foreground ring-background absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full p-0 ring-2"
                      render={<span />}
                    >
                      <ItemMedia className="size-auto" variant="icon">
                        <CheckIcon aria-hidden="true" className="size-3" />
                      </ItemMedia>
                    </Item>
                  ) : null}
                </Button>
              );
            })}
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
    </FieldSet>
  );
}

function GoalsStep({
  goals,
  onGoalToggle,
}: {
  goals: GoalValue[];
  onGoalToggle: (goal: GoalValue, checked: boolean) => void;
}) {
  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label">Select one or more</FieldLegend>
      <ItemGroup className="gap-2">
        {GOAL_OPTIONS.map((option) => {
          const selected = goals.includes(option.value);
          const fieldId = `onboarding-2-goal-${option.value}`;

          return (
            <Item key={option.value} size="sm" variant="outline">
              <Field className="w-full gap-3" orientation="horizontal">
                <Checkbox
                  checked={selected}
                  id={fieldId}
                  onCheckedChange={(checked) => onGoalToggle(option.value, checked === true)}
                />
                <FieldLabel className="items-center leading-none" htmlFor={fieldId}>
                  <span className="truncate font-medium">{option.label}</span>
                </FieldLabel>
              </Field>
            </Item>
          );
        })}
      </ItemGroup>
    </FieldSet>
  );
}

function InviteRoleSelect({
  id,
  value,
  onValueChange,
}: {
  id: string;
  value: InviteRoleValue;
  onValueChange: (value: InviteRoleValue) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => nextValue && onValueChange(nextValue as InviteRoleValue)}
    >
      <SelectTrigger className="w-full" id={id}>
        <SelectValue>{(item: InviteRoleValue) => getInviteRoleLabel(item)}</SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="w-64 min-w-(--anchor-width)"
      >
        <SelectGroup>
          {INVITE_ROLE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex min-w-0 flex-col items-start gap-px">
                <span className="font-medium">{option.label}</span>
                <small className="text-muted-foreground line-clamp-1 text-xs">
                  {option.description}
                </small>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function InviteStep({
  invites,
  sendInviteDigest,
  onAddInvite,
  onInviteEmailChange,
  onInviteRoleChange,
  onSendInviteDigestChange,
}: {
  invites: InviteRow[];
  sendInviteDigest: boolean;
  onAddInvite: () => void;
  onInviteEmailChange: (inviteId: string, email: string) => void;
  onInviteRoleChange: (inviteId: string, role: InviteRoleValue) => void;
  onSendInviteDigestChange: (checked: boolean) => void;
}) {
  return (
    <FieldSet>
      <FieldLegend className="sr-only">Invite teammates</FieldLegend>
      <FieldGroup className="gap-5">
        <div className="grid gap-3">
          <div className="text-muted-foreground hidden grid-cols-[minmax(0,1fr)_9rem] gap-3 px-1 text-xs font-medium sm:grid">
            <span>Email</span>
            <span>Role</span>
          </div>
          {invites.map((invite, index) => {
            const emailId = `onboarding-2-invite-email-${invite.id}`;
            const roleId = `onboarding-2-invite-role-${invite.id}`;

            return (
              <div
                className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]"
                key={invite.id}
              >
                <Field>
                  <FieldLabel className="sr-only" htmlFor={emailId}>
                    Invitee {index + 1} email
                  </FieldLabel>
                  <Input
                    autoComplete="email"
                    id={emailId}
                    placeholder="teammate@company.com"
                    type="email"
                    value={invite.email}
                    onChange={(event) => onInviteEmailChange(invite.id, event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel className="sr-only" htmlFor={roleId}>
                    Invitee {index + 1} role
                  </FieldLabel>
                  <InviteRoleSelect
                    id={roleId}
                    value={invite.role}
                    onValueChange={(role) => onInviteRoleChange(invite.id, role)}
                  />
                </Field>
              </div>
            );
          })}
          <div className="flex justify-end">
            <Button
              className="h-auto w-fit px-1"
              type="button"
              variant="link"
              onClick={onAddInvite}
            >
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              Add another
            </Button>
          </div>
        </div>

        <Field className="gap-3" orientation="horizontal">
          <FieldContent className="gap-0.5">
            <FieldLabel htmlFor="onboarding-2-send-digest">Send invitation summary</FieldLabel>
            <FieldDescription>Include workspace details.</FieldDescription>
          </FieldContent>
          <Switch
            checked={sendInviteDigest}
            id="onboarding-2-send-digest"
            onCheckedChange={onSendInviteDigestChange}
          />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

function SuccessStep({
  workspaceName,
  onOpen,
  onReviewSetup,
}: {
  workspaceName: string;
  onOpen?: () => void;
  onReviewSetup: () => void;
}) {
  const displayName = workspaceName.trim() || 'Workspace';

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <div aria-hidden="true" className="mx-auto flex h-28 w-full items-center justify-center">
          <IconStack
            className="text-primary h-24 w-22"
            style={
              {
                '--icon-stack-content-x': '70%',
                '--icon-stack-content-y': '57%',
              } as CSSProperties
            }
          >
            <CircleCheckIcon aria-hidden="true" className="text-primary size-5" strokeWidth="1.8" />
          </IconStack>
        </div>

        <div className="mx-auto mt-3 max-w-sm text-center">
          <h1 className="text-foreground text-2xl leading-8 font-semibold tracking-tight">
            {displayName} is ready
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Your workspace is set up and ready for the first project.
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Button className="w-full" type="button" onClick={onOpen}>
          Open {displayName}
        </Button>
        <Button className="w-full" type="button" variant="ghost" onClick={onReviewSetup}>
          Review setup
        </Button>
      </div>
    </div>
  );
}

function OnboardingSidebar({
  currentStep,
  isComplete,
  canGoBack,
  onBack,
  onStepChange,
}: {
  currentStep: number;
  isComplete: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onStepChange: (step: number) => void;
}) {
  return (
    <aside className="relative z-10 flex w-full shrink-0 border-b px-5 pt-5 pb-4 sm:px-8 sm:pt-6 sm:pb-5 lg:min-h-svh lg:w-[18rem] lg:border-b-0 lg:py-7 lg:pr-5 lg:pl-7">
      <div className="flex min-h-full w-full flex-col">
        <OnboardingHeader canGoBack={canGoBack} onBack={onBack} />

        <div className="mt-4 lg:hidden">
          <OnboardingStepperCompact
            currentStep={currentStep}
            isComplete={isComplete}
            steps={ONBOARDING_STEPS}
            onStepChange={onStepChange}
          />
        </div>

        <div className="hidden flex-1 items-center justify-center py-16 lg:flex">
          <OnboardingStepper
            currentStep={currentStep}
            isComplete={isComplete}
            steps={ONBOARDING_STEPS}
            onStepChange={onStepChange}
          />
        </div>

        <div aria-hidden="true" className="hidden h-8 shrink-0 lg:block" />
      </div>
    </aside>
  );
}

export function Onboarding({ onFinish }: { onFinish?: () => void } = {}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [fullName, setFullName] = useState('Sam Rivera');
  const [jobTitle, setJobTitle] = useState('Product Lead');
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [role, setRole] = useState<RoleValue>('developer');
  const [discoverySource, setDiscoverySource] = useState<DiscoverySourceValue>('linkedin');
  const [discoveryOther, setDiscoveryOther] = useState('');
  const [workspaceName, setWorkspaceName] = useState('Orvilo HQ');
  const [workspaceSlug, setWorkspaceSlug] = useState('northstar');
  const [teamSize, setTeamSize] = useState<TeamSizeValue>('team');
  const [goals, setGoals] = useState<GoalValue[]>(['roadmaps', 'sprints']);
  const [invites, setInvites] = useState<InviteRow[]>(DEFAULT_INVITES);
  const [sendInviteDigest, setSendInviteDigest] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const shouldReduceMotion = useReducedMotion();

  const currentStepMeta = ONBOARDING_STEPS[currentStep - 1];
  const isFinalStep = currentStep === TOTAL_STEPS;
  const canSkip = currentStep > 1 && currentStep < TOTAL_STEPS;
  const canContinue =
    (currentStepMeta.id !== 'profile' || fullName.trim().length > 0) &&
    (currentStepMeta.id !== 'workspace' ||
      (workspaceName.trim().length > 0 && workspaceSlug.trim().length > 0)) &&
    (currentStepMeta.id !== 'goals' || goals.length > 0);

  function goToStep(step: number) {
    const nextStep = Math.min(Math.max(step, 1), TOTAL_STEPS);

    setTransitionDirection(nextStep >= currentStep ? 1 : -1);
    setIsComplete(false);
    setCurrentStep(nextStep);
  }

  function handleGoalToggle(goal: GoalValue, checked: boolean) {
    setGoals((currentGoals) => {
      if (checked) {
        return currentGoals.includes(goal) ? currentGoals : [...currentGoals, goal];
      }

      return currentGoals.filter((currentGoal) => currentGoal !== goal);
    });
  }

  function handleAddInvite() {
    setInvites((currentInvites) => [
      ...currentInvites,
      {
        id: `invite-${currentInvites.length + 1}`,
        email: '',
        role: 'member',
      },
    ]);
  }

  function handleInviteEmailChange(inviteId: string, email: string) {
    setInvites((currentInvites) =>
      currentInvites.map((invite) => (invite.id === inviteId ? { ...invite, email } : invite)),
    );
  }

  function handleInviteRoleChange(inviteId: string, nextRole: InviteRoleValue) {
    setInvites((currentInvites) =>
      currentInvites.map((invite) =>
        invite.id === inviteId ? { ...invite, role: nextRole } : invite,
      ),
    );
  }

  function completeOnboarding() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setTransitionDirection(1);

    window.setTimeout(() => {
      setIsSubmitting(false);
      setIsComplete(true);
    }, 700);
  }

  function handleSkip() {
    if (!canSkip) {
      return;
    }

    goToStep(currentStep + 1);
  }

  function handleStepNavigation(step: number) {
    if (isComplete || step <= currentStep) {
      goToStep(step);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canContinue) {
      return;
    }

    if (!isFinalStep) {
      goToStep(currentStep + 1);
      return;
    }

    completeOnboarding();
  }

  return (
    <main className="bg-muted/20 text-foreground relative isolate flex min-h-svh w-full flex-col lg:flex-row">
      <OnboardingPageBackground />

      <OnboardingSidebar
        canGoBack={!isComplete && currentStep > 1}
        currentStep={currentStep}
        isComplete={isComplete}
        onBack={() => goToStep(currentStep - 1)}
        onStepChange={handleStepNavigation}
      />

      <section className="relative z-10 flex min-w-0 flex-1 p-3 sm:p-6 lg:py-6 lg:pr-5 lg:pl-0">
        <Frame
          className="bg-muted/60 dark:bg-muted/10 flex w-full flex-1 gap-0 overflow-hidden [--frame-px:--spacing(1.25)] [--frame-py:--spacing(1.25)] lg:min-h-[calc(100svh-3rem)]"
          spacing="xs"
          variant="ghost"
        >
          <FramePanel className="border-border/40 flex flex-1 flex-col px-5 py-8 sm:px-10 sm:py-14 md:py-16 lg:px-14 lg:py-20 xl:py-24">
            <div className="flex flex-1">
              <AnimatePresence initial={false} mode="wait">
                {isComplete ? (
                  <m.div
                    className="mx-auto flex w-full max-w-sm flex-col lg:min-h-[36rem]"
                    key="success"
                    animate={{
                      opacity: 1,
                      x: 0,
                      scale: 1,
                      filter: 'blur(0px)',
                    }}
                    exit={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            x: transitionDirection > 0 ? -10 : 10,
                            scale: 0.998,
                            filter: 'blur(3px)',
                          }
                    }
                    initial={
                      shouldReduceMotion
                        ? { opacity: 1 }
                        : {
                            opacity: 0,
                            x: transitionDirection > 0 ? 14 : -14,
                            scale: 0.998,
                            filter: 'blur(4px)',
                          }
                    }
                    transition={
                      shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }
                    }
                  >
                    <SuccessStep
                      workspaceName={workspaceName}
                      onOpen={onFinish}
                      onReviewSetup={() => {
                        setTransitionDirection(-1);
                        setIsComplete(false);
                        setCurrentStep(TOTAL_STEPS);
                      }}
                    />
                  </m.div>
                ) : (
                  <m.form
                    className="mx-auto flex w-full max-w-md flex-col lg:min-h-[36rem]"
                    key={currentStepMeta.id}
                    animate={{
                      opacity: 1,
                      x: 0,
                      scale: 1,
                      filter: 'blur(0px)',
                    }}
                    exit={
                      shouldReduceMotion
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            x: transitionDirection > 0 ? -10 : 10,
                            scale: 0.998,
                            filter: 'blur(3px)',
                          }
                    }
                    initial={
                      shouldReduceMotion
                        ? { opacity: 1 }
                        : {
                            opacity: 0,
                            x: transitionDirection > 0 ? 14 : -14,
                            scale: 0.998,
                            filter: 'blur(4px)',
                          }
                    }
                    transition={
                      shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }
                    }
                    onSubmit={handleSubmit}
                  >
                    <div className="flex flex-col gap-8">
                      <StepHeading
                        description={currentStepMeta.description}
                        title={currentStepMeta.title}
                      />

                      {currentStepMeta.id === 'profile' ? (
                        <ProfileStep
                          fullName={fullName}
                          jobTitle={jobTitle}
                          marketingOptIn={marketingOptIn}
                          onFullNameChange={setFullName}
                          onJobTitleChange={setJobTitle}
                          onMarketingOptInChange={setMarketingOptIn}
                        />
                      ) : null}

                      {currentStepMeta.id === 'role' ? (
                        <RoleStep role={role} onRoleChange={setRole} />
                      ) : null}

                      {currentStepMeta.id === 'source' ? (
                        <SourceStep
                          otherSource={discoveryOther}
                          source={discoverySource}
                          onOtherSourceChange={setDiscoveryOther}
                          onSourceChange={setDiscoverySource}
                        />
                      ) : null}

                      {currentStepMeta.id === 'workspace' ? (
                        <WorkspaceStep
                          teamSize={teamSize}
                          workspaceName={workspaceName}
                          workspaceSlug={workspaceSlug}
                          onTeamSizeChange={setTeamSize}
                          onWorkspaceNameChange={setWorkspaceName}
                          onWorkspaceSlugChange={setWorkspaceSlug}
                        />
                      ) : null}

                      {currentStepMeta.id === 'goals' ? (
                        <GoalsStep goals={goals} onGoalToggle={handleGoalToggle} />
                      ) : null}

                      {currentStepMeta.id === 'invite' ? (
                        <InviteStep
                          invites={invites}
                          sendInviteDigest={sendInviteDigest}
                          onAddInvite={handleAddInvite}
                          onInviteEmailChange={handleInviteEmailChange}
                          onInviteRoleChange={handleInviteRoleChange}
                          onSendInviteDigestChange={setSendInviteDigest}
                        />
                      ) : null}
                    </div>

                    <div className="mt-auto flex flex-col gap-2 pt-8">
                      <Button
                        className="w-full"
                        disabled={!canContinue || isSubmitting}
                        type="submit"
                      >
                        {isSubmitting ? (
                          <Spinner aria-hidden="true" data-icon="inline-start" />
                        ) : isFinalStep ? (
                          <RocketIcon aria-hidden="true" data-icon="inline-start" />
                        ) : null}
                        {isFinalStep ? 'Create workspace' : 'Continue'}
                      </Button>

                      {canSkip ? (
                        <Button
                          className="w-full"
                          disabled={isSubmitting}
                          type="button"
                          variant="ghost"
                          onClick={handleSkip}
                        >
                          Skip
                        </Button>
                      ) : null}
                    </div>
                  </m.form>
                )}
              </AnimatePresence>
            </div>
          </FramePanel>
        </Frame>
      </section>
    </main>
  );
}
