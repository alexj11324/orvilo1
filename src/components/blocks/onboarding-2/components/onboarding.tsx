'use client';

import type { TFunction } from 'i18next';
import { CheckIcon, CircleCheckIcon, PlusIcon, RocketIcon } from 'lucide-react';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import * as m from 'motion/react-m';
import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  trackOnboardingCompleted,
  trackOnboardingStarted,
  trackOnboardingStepCompleted,
  trackOnboardingStepViewed,
} from '@/services/onboardingMetrics';

import {
  createOnboardingData,
  DEFAULT_INVITES,
  type DiscoverySourceValue,
  type GoalValue,
  type InviteRoleValue,
  type InviteRow,
  type RoleValue,
  type TeamSizeValue,
} from './data';
import { ImageUploadField } from './image-upload-field';
import { OnboardingPageBackground } from './onboarding-background';
import { OnboardingHeader } from './onboarding-header';
import { OnboardingStepper, OnboardingStepperCompact } from './onboarding-stepper';

type TimezoneGroup = { items: string[]; value: string };

function createTimezoneGroups(t: TFunction<'onboarding'>): TimezoneGroup[] {
  return [
    {
      value: t('reui.timezone.americas'),
      items: [
        t('reui.timezone.newYork'),
        t('reui.timezone.losAngeles'),
        t('reui.timezone.chicago'),
        t('reui.timezone.toronto'),
        t('reui.timezone.vancouver'),
        t('reui.timezone.saoPaulo'),
      ],
    },
    {
      value: t('reui.timezone.europe'),
      items: [
        t('reui.timezone.london'),
        t('reui.timezone.paris'),
        t('reui.timezone.berlin'),
        t('reui.timezone.rome'),
        t('reui.timezone.madrid'),
        t('reui.timezone.amsterdam'),
      ],
    },
    {
      value: t('reui.timezone.asiaPacific'),
      items: [
        t('reui.timezone.tokyo'),
        t('reui.timezone.shanghai'),
        t('reui.timezone.singapore'),
        t('reui.timezone.dubai'),
        t('reui.timezone.sydney'),
        t('reui.timezone.seoul'),
      ],
    },
  ];
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
  telemetryEnabled,
  onAvatarChange,
  onFullNameChange,
  onJobTitleChange,
  onTelemetryChange,
}: {
  fullName: string;
  jobTitle: string;
  telemetryEnabled: boolean;
  onAvatarChange: (file: File | null) => void;
  onFullNameChange: (name: string) => void;
  onJobTitleChange: (title: string) => void;
  onTelemetryChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation('onboarding');
  const timezoneGroups = useMemo(() => createTimezoneGroups(t), [t]);

  return (
    <FieldSet>
      <FieldLegend className="sr-only">{t('reui.profile.legend')}</FieldLegend>
      <FieldGroup className="gap-4">
        <Field>
          <ImageUploadField
            alt={t('reui.photo.alt')}
            description={t('reui.photo.description')}
            inputId="onboarding-2-profile-photo"
            replaceLabel={t('reui.photo.replace')}
            uploadLabel={t('reui.photo.upload')}
            onImageChange={onAvatarChange}
          />
        </Field>

        <FieldGroup className="gap-4">
          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-name">
              {t('reui.profile.fullName')} <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              autoComplete="name"
              id="onboarding-2-name"
              value={fullName}
              onChange={(event) => onFullNameChange(event.target.value)}
            />
          </Field>

          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-title">{t('reui.profile.jobTitle')}</FieldLabel>
            <Input
              autoComplete="organization-title"
              id="onboarding-2-title"
              value={jobTitle}
              onChange={(event) => onJobTitleChange(event.target.value)}
            />
          </Field>

          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-timezone">{t('reui.profile.timezone')}</FieldLabel>
            <Combobox items={timezoneGroups}>
              <ComboboxInput
                className="w-full"
                id="onboarding-2-timezone"
                placeholder={t('reui.profile.timezonePlaceholder')}
              />
              <ComboboxContent className="w-(--anchor-width) min-w-(--anchor-width)">
                <ComboboxEmpty>{t('reui.profile.timezoneEmpty')}</ComboboxEmpty>
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
          <Switch
            checked={telemetryEnabled}
            id="onboarding-2-telemetry"
            onCheckedChange={onTelemetryChange}
          />
          <FieldContent className="gap-0.5">
            <FieldLabel
              className="text-muted-foreground font-normal"
              htmlFor="onboarding-2-telemetry"
            >
              {t('reui.profile.telemetryLabel')}
            </FieldLabel>
            <FieldDescription>{t('reui.profile.telemetryDescription')}</FieldDescription>
          </FieldContent>
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
  const { t } = useTranslation('onboarding');
  const { roleOptions } = createOnboardingData(t);

  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label">{t('reui.role.selectOne')}</FieldLegend>
      <RadioGroup
        aria-label={t('reui.role.selectAria')}
        value={role}
        onValueChange={(value) => onRoleChange(value as RoleValue)}
      >
        <ItemGroup className="gap-2">
          {roleOptions.map((option) => {
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
  const { t } = useTranslation('onboarding');
  const { discoverySourceOptions } = createOnboardingData(t);

  return (
    <FieldSet className="gap-4">
      <FieldLegend className="sr-only">{t('reui.source.groupLabel')}</FieldLegend>
      <FieldGroup aria-label={t('reui.source.groupLabel')} className="flex-row flex-wrap gap-2">
        {discoverySourceOptions.map((option) => {
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
            {t('reui.source.fieldLabel')}
          </FieldLabel>
          <Input
            autoComplete="off"
            id="onboarding-2-source-other-text"
            placeholder={t('reui.source.fieldPlaceholder')}
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
  const { t } = useTranslation('onboarding');
  const { teamSizeOptions } = createOnboardingData(t);

  return (
    <FieldSet>
      <FieldLegend className="sr-only">{t('reui.workspace.legend')}</FieldLegend>
      <FieldGroup className="gap-5">
        <FieldGroup className="gap-4">
          <Field className="gap-2">
            <FieldLabel htmlFor="onboarding-2-workspace">
              {t('reui.workspace.name')} <span className="text-destructive">*</span>
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
              {t('reui.workspace.url')} <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              autoComplete="off"
              id="onboarding-2-url"
              value={workspaceSlug}
              onChange={(event) => onWorkspaceSlugChange(event.target.value)}
            />
            <FieldDescription>
              {t('reui.workspace.urlDescription', {
                slug: workspaceSlug.trim() || 'workspace',
              })}
            </FieldDescription>
          </Field>
        </FieldGroup>

        <FieldSet className="gap-5">
          <FieldLegend className="mb-4" variant="label">
            {t('reui.workspace.teamSize')}
          </FieldLegend>
          <FieldGroup
            aria-label={t('reui.workspace.teamSize')}
            className="flex-row flex-wrap gap-2"
          >
            {teamSizeOptions.map((option) => {
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
  const { t } = useTranslation('onboarding');
  const { goalOptions } = createOnboardingData(t);

  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label">{t('reui.goal.selectOneOrMore')}</FieldLegend>
      <ItemGroup className="gap-2">
        {goalOptions.map((option) => {
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
  const { t } = useTranslation('onboarding');
  const { inviteRoleOptions } = createOnboardingData(t);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => nextValue && onValueChange(nextValue as InviteRoleValue)}
    >
      <SelectTrigger className="w-full" id={id}>
        <SelectValue>
          {(item: InviteRoleValue) =>
            inviteRoleOptions.find((option) => option.value === item)?.label ?? item
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="w-64 min-w-(--anchor-width)"
      >
        <SelectGroup>
          {inviteRoleOptions.map((option) => (
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
  const { t } = useTranslation('onboarding');

  return (
    <FieldSet>
      <FieldLegend className="sr-only">{t('reui.invite.legend')}</FieldLegend>
      <FieldGroup className="gap-5">
        <div className="grid gap-3">
          <div className="text-muted-foreground hidden grid-cols-[minmax(0,1fr)_9rem] gap-3 px-1 text-xs font-medium sm:grid">
            <span>{t('reui.invite.email')}</span>
            <span>{t('reui.invite.role')}</span>
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
                    {t('reui.invite.emailLabel', { number: index + 1 })}
                  </FieldLabel>
                  <Input
                    autoComplete="email"
                    id={emailId}
                    placeholder={t('reui.invite.emailPlaceholder')}
                    type="email"
                    value={invite.email}
                    onChange={(event) => onInviteEmailChange(invite.id, event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel className="sr-only" htmlFor={roleId}>
                    {t('reui.invite.roleLabel', { number: index + 1 })}
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
              {t('reui.invite.addAnother')}
            </Button>
          </div>
        </div>

        <Field className="gap-3" orientation="horizontal">
          <FieldContent className="gap-0.5">
            <FieldLabel htmlFor="onboarding-2-send-digest">
              {t('reui.invite.digestLabel')}
            </FieldLabel>
            <FieldDescription>{t('reui.invite.digestDescription')}</FieldDescription>
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
  const { t } = useTranslation('onboarding');
  const displayName = workspaceName.trim() || t('reui.workspace.name');

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
            {t('reui.workspace.successTitle', { name: displayName })}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {t('reui.workspace.successDescription')}
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Button className="w-full" type="button" onClick={onOpen}>
          {t('reui.action.openWorkspace', { name: displayName })}
        </Button>
        <Button className="w-full" type="button" variant="ghost" onClick={onReviewSetup}>
          {t('reui.action.reviewSetup')}
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
  steps,
}: {
  currentStep: number;
  isComplete: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onStepChange: (step: number) => void;
  steps: ReturnType<typeof createOnboardingData>['steps'];
}) {
  return (
    <aside className="relative z-10 flex w-full shrink-0 border-b px-5 pt-5 pb-4 sm:px-8 sm:pt-6 sm:pb-5 lg:min-h-svh lg:w-[18rem] lg:border-b-0 lg:py-7 lg:pr-5 lg:pl-7">
      <div className="flex min-h-full w-full flex-col">
        <OnboardingHeader canGoBack={canGoBack} onBack={onBack} />

        <div className="mt-4 lg:hidden">
          <OnboardingStepperCompact
            currentStep={currentStep}
            isComplete={isComplete}
            steps={steps}
            onStepChange={onStepChange}
          />
        </div>

        <div className="hidden flex-1 items-center justify-center py-16 lg:flex">
          <OnboardingStepper
            currentStep={currentStep}
            isComplete={isComplete}
            steps={steps}
            onStepChange={onStepChange}
          />
        </div>

        <div aria-hidden="true" className="hidden h-8 shrink-0 lg:block" />
      </div>
    </aside>
  );
}

export interface OnboardingFormValues {
  avatarFile: File | null;
  discoveryOther: string;
  discoverySource: DiscoverySourceValue;
  fullName: string;
  goals: GoalValue[];
  invites: InviteRow[];
  jobTitle: string;
  role: RoleValue;
  sendInviteDigest: boolean;
  teamSize: TeamSizeValue;
  telemetryEnabled: boolean;
  workspaceName: string;
  workspaceSlug: string;
}

export interface OnboardingCompletion {
  workspaceId: string;
  workspaceSlug: string;
}

export const ONBOARDING_INVITES_FAILED = 'onboardingInvitesFailed';

export function Onboarding({
  initialFullName = '',
  initialTelemetry = true,
  onComplete,
  onOpen,
}: {
  initialFullName?: string;
  initialTelemetry?: boolean;
  onComplete?: (values: OnboardingFormValues) => Promise<OnboardingCompletion | void>;
  onOpen?: () => void;
} = {}) {
  const { t } = useTranslation('onboarding');
  const onboardingData = useMemo(() => createOnboardingData(t), [t]);
  const onboardingSteps = onboardingData.steps;
  const totalSteps = onboardingSteps.length;
  const [currentStep, setCurrentStep] = useState(1);
  const [fullName, setFullName] = useState(initialFullName);
  const [jobTitle, setJobTitle] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [role, setRole] = useState<RoleValue>('developer');
  const [discoverySource, setDiscoverySource] = useState<DiscoverySourceValue>('linkedin');
  const [discoveryOther, setDiscoveryOther] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [teamSize, setTeamSize] = useState<TeamSizeValue>('team');
  const [goals, setGoals] = useState<GoalValue[]>(['roadmaps', 'sprints']);
  const [invites, setInvites] = useState<InviteRow[]>(DEFAULT_INVITES);
  const [sendInviteDigest, setSendInviteDigest] = useState(true);
  const [telemetryEnabled, setTelemetryEnabled] = useState(initialTelemetry);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const shouldReduceMotion = useReducedMotion();
  const sessionIdRef = useRef<string | undefined>(undefined);

  if (!sessionIdRef.current) {
    sessionIdRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `onboarding-${Date.now()}`;
  }

  useEffect(() => {
    trackOnboardingStarted({
      flow: 'web',
      onboarding_session_id: sessionIdRef.current!,
      onboarding_version: 2,
    });
  }, []);

  const currentStepMeta = onboardingSteps[currentStep - 1];
  const isFinalStep = currentStep === totalSteps;
  const canSkip = currentStep > 1 && currentStep < totalSteps;
  const canContinue =
    (currentStepMeta.id !== 'profile' || fullName.trim().length > 0) &&
    (currentStepMeta.id !== 'workspace' ||
      (workspaceName.trim().length > 0 && workspaceSlug.trim().length > 0)) &&
    (currentStepMeta.id !== 'goals' || goals.length > 0);

  function goToStep(step: number) {
    const nextStep = Math.min(Math.max(step, 1), totalSteps);

    setTransitionDirection(nextStep >= currentStep ? 1 : -1);
    setIsComplete(false);
    setCurrentStep(nextStep);
  }

  useEffect(() => {
    trackOnboardingStepViewed({
      flow: 'web',
      onboarding_session_id: sessionIdRef.current!,
      onboarding_version: 2,
      step: currentStepMeta.id as 'profile' | 'role' | 'source' | 'workspace' | 'goals' | 'invite',
      stepIndex: currentStep,
    });
  }, [currentStep, currentStepMeta.id]);

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

  async function completeOnboarding() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setTransitionDirection(1);
    setCompletionError(null);

    try {
      await onComplete?.({
        avatarFile,
        discoveryOther,
        discoverySource,
        fullName,
        goals,
        invites,
        jobTitle,
        role,
        sendInviteDigest,
        teamSize,
        telemetryEnabled,
        workspaceName,
        workspaceSlug,
      });
      trackOnboardingCompleted({
        flow: 'web',
        onboarding_session_id: sessionIdRef.current,
        onboarding_version: 2,
      });
      setIsComplete(true);
    } catch (error) {
      setCompletionError(
        error instanceof Error && error.message === ONBOARDING_INVITES_FAILED
          ? t('reui.error.invites')
          : t('reui.error.complete'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSkip() {
    if (!canSkip) {
      return;
    }

    trackOnboardingStepCompleted({
      flow: 'web',
      onboarding_session_id: sessionIdRef.current,
      onboarding_version: 2,
      skipped: true,
      step: currentStepMeta.id as 'profile' | 'role' | 'source' | 'workspace' | 'goals' | 'invite',
      stepIndex: currentStep,
    });
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
      trackOnboardingStepCompleted({
        flow: 'web',
        onboarding_session_id: sessionIdRef.current,
        onboarding_version: 2,
        step: currentStepMeta.id as
          'profile' | 'role' | 'source' | 'workspace' | 'goals' | 'invite',
        stepIndex: currentStep,
      });
      goToStep(currentStep + 1);
      return;
    }

    void completeOnboarding();
  }

  return (
    <main className="bg-muted/20 text-foreground relative isolate flex max-h-svh min-h-svh w-full flex-col overflow-y-auto lg:flex-row">
      <OnboardingPageBackground />

      <OnboardingSidebar
        canGoBack={!isComplete && currentStep > 1}
        currentStep={currentStep}
        isComplete={isComplete}
        steps={onboardingSteps}
        onBack={() => goToStep(currentStep - 1)}
        onStepChange={handleStepNavigation}
      />

      <section className="relative z-10 flex min-w-0 flex-1 p-3 sm:p-6 lg:py-6 lg:pr-5 lg:pl-0">
        <Frame
          className="bg-muted/60 dark:bg-muted/10 flex w-full flex-1 gap-0 overflow-hidden [--frame-px:--spacing(1.25)] [--frame-py:--spacing(1.25)] lg:min-h-[calc(100svh-3rem)]"
          spacing="xs"
          variant="ghost"
        >
          <FramePanel className="border-border/40 flex min-h-0 flex-1 flex-col px-5 py-8 sm:px-10 sm:py-14 md:py-16 lg:px-14 lg:py-20 xl:py-24">
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
                      onOpen={onOpen}
                      onReviewSetup={() => {
                        setTransitionDirection(-1);
                        setIsComplete(false);
                        setCurrentStep(totalSteps);
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
                          telemetryEnabled={telemetryEnabled}
                          onAvatarChange={setAvatarFile}
                          onFullNameChange={setFullName}
                          onJobTitleChange={setJobTitle}
                          onTelemetryChange={setTelemetryEnabled}
                        />
                      ) : null}

                      {completionError ? (
                        <p className="text-destructive text-sm" role="alert">
                          {completionError}
                        </p>
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
                        {isFinalStep ? t('reui.action.createWorkspace') : t('reui.action.continue')}
                      </Button>

                      {canSkip ? (
                        <Button
                          className="w-full"
                          disabled={isSubmitting}
                          type="button"
                          variant="ghost"
                          onClick={handleSkip}
                        >
                          {t('reui.action.skip')}
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
