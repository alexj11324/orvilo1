import {
  AdvertisimentIcon,
  AiMagicIcon,
  Facebook02Icon,
  GoogleIcon,
  InstagramIcon,
  Linkedin01Icon,
  Mail01Icon,
  MoreHorizontalCircle01Icon,
  NewTwitterIcon,
  PodcastIcon,
  RedditIcon,
  UserMultiple02Icon,
  YoutubeIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { TFunction } from 'i18next';
import {
  ArrowLeftRightIcon,
  CodeIcon,
  GitBranchIcon,
  LayersIcon,
  type LucideIcon,
  PaletteIcon,
  RocketIcon,
  Settings2Icon,
  SparklesIcon,
  TargetIcon,
  UsersIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export type OnboardingStep = {
  id: string;
  value: number;
  label: string;
  title: string;
  description: string;
  optional?: boolean;
};

export type OnboardingChoice<TValue extends string = string> = {
  value: TValue;
  label: string;
  description: string;
  icon?: ReactNode;
  recommended?: boolean;
};

export type RoleValue =
  'product' | 'engineering' | 'design' | 'developer' | 'founder' | 'operations';

export type TeamSizeValue =
  'solo' | 'small' | 'team' | 'department' | 'midmarket' | 'company' | 'enterprise' | 'global';

export type DiscoverySourceValue =
  | 'google'
  | 'linkedin'
  | 'facebook'
  | 'instagram'
  | 'reddit'
  | 'x'
  | 'youtube'
  | 'podcast'
  | 'newsletter'
  | 'friend'
  | 'ai'
  | 'outside'
  | 'other';

export type GoalValue = 'roadmaps' | 'sprints' | 'projects' | 'migration' | 'explore';

export type InviteRoleValue = 'guest' | 'member' | 'admin';

export type InviteRow = {
  id: string;
  email: string;
  role: InviteRoleValue;
};

export type OnboardingTranslate = TFunction<'onboarding'>;
type HugeIcon = ComponentProps<typeof HugeiconsIcon>['icon'];

export const createOnboardingData = (t: OnboardingTranslate) => ({
  discoverySourceOptions: (
    [
      ['google', GoogleIcon],
      ['linkedin', Linkedin01Icon],
      ['facebook', Facebook02Icon],
      ['instagram', InstagramIcon],
      ['reddit', RedditIcon],
      ['x', NewTwitterIcon],
      ['youtube', YoutubeIcon],
      ['podcast', PodcastIcon],
      ['newsletter', Mail01Icon],
      ['friend', UserMultiple02Icon],
      ['ai', AiMagicIcon],
      ['outside', AdvertisimentIcon],
      ['other', MoreHorizontalCircle01Icon],
    ] as Array<[DiscoverySourceValue, HugeIcon]>
  ).map(([value, Icon]) => ({
    value: value as DiscoverySourceValue,
    label: t(`reui.source.${value}.label`),
    description: t(`reui.source.${value}.description`),
    icon: <HugeiconsIcon aria-hidden="true" className="size-4" icon={Icon} />,
  })),
  goalOptions: (
    [
      ['roadmaps', LayersIcon],
      ['sprints', CodeIcon],
      ['projects', UsersIcon],
      ['migration', ArrowLeftRightIcon],
      ['explore', SparklesIcon],
    ] as Array<[GoalValue, LucideIcon]>
  ).map(([value, Icon]) => ({
    value: value as GoalValue,
    label: t(`reui.goal.${value}.label`),
    description: t(`reui.goal.${value}.description`),
    icon: <Icon aria-hidden="true" />,
  })),
  inviteRoleOptions: (['guest', 'member', 'admin'] as InviteRoleValue[]).map((value) => ({
    value,
    label: t(`reui.inviteRole.${value}.label`),
    description: t(`reui.inviteRole.${value}.description`),
  })),
  roleOptions: (
    [
      ['product', TargetIcon],
      ['engineering', GitBranchIcon],
      ['design', PaletteIcon],
      ['developer', CodeIcon],
      ['founder', RocketIcon],
      ['operations', Settings2Icon],
    ] as Array<[RoleValue, LucideIcon]>
  ).map(([value, Icon]) => ({
    value: value as RoleValue,
    label: t(`reui.role.${value}.label`),
    description: t(`reui.role.${value}.description`),
    icon: <Icon aria-hidden="true" />,
    ...(value === 'developer' ? { recommended: true } : {}),
  })),
  steps: [
    ['profile', 1],
    ['role', 2],
    ['source', 3],
    ['workspace', 4],
    ['goals', 5],
    ['invite', 6],
  ].map(([id, value]) => ({
    id: id as string,
    value: value as number,
    label: t(`reui.step.${id}.label`),
    title: t(`reui.step.${id}.title`),
    description: t(`reui.step.${id}.description`),
    ...(['source', 'invite'].includes(id as string) ? { optional: true } : {}),
  })),
  teamSizeOptions: (
    [
      ['solo', 'solo'],
      ['small', 'small'],
      ['team', 'team'],
      ['department', 'department'],
      ['midmarket', 'midmarket'],
      ['company', 'company'],
      ['enterprise', 'enterprise'],
      ['global', 'global'],
    ] as Array<[TeamSizeValue, string]>
  ).map(([value, key]) => ({
    value: value as TeamSizeValue,
    label: t(`reui.teamSize.${key}.label`),
    description: t(`reui.teamSize.${key}.description`),
    ...(value === 'team' ? { recommended: true } : {}),
  })),
});

export type OnboardingData = ReturnType<typeof createOnboardingData>;

export const DEFAULT_INVITES: InviteRow[] = [];
