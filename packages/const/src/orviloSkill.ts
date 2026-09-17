import type { IconType } from '@icons-pack/react-simple-icons';
import { SiGithub, SiLinear, SiPosthog, SiVercel, SiX } from '@icons-pack/react-simple-icons';

import { OFFICIAL_SITE } from './url';

export interface OrviloSkillProviderType {
  /**
   * Author/Developer of the integration
   */
  author: string;
  /**
   * Author's website URL
   */
  authorUrl?: string;
  /**
   * Whether this provider is visible by default in the UI
   */
  defaultVisible?: boolean;
  /**
   * Short description of the skill
   */
  description: string;
  /**
   * Icon - can be a URL string or a React icon component
   */
  icon: string | IconType;
  /**
   * Provider ID (matches Market API, e.g., 'linear', 'microsoft')
   */
  id: string;
  /**
   * Display label for the provider
   */
  label: string;
  /**
   * Detailed readme of the skill
   */
  readme: string;
}

export type OrviloConnectorProviderType = OrviloSkillProviderType;

/**
 * Predefined Orvilo Skill Provider list
 *
 * Note:
 * - This list is used for UI display (icons, labels)
 * - Actual availability depends on Market API response
 * - Add new providers here when Market adds support
 */
export const ORVILO_SKILL_PROVIDERS: OrviloSkillProviderType[] = [
  {
    author: 'Orvilo',
    authorUrl: OFFICIAL_SITE,
    defaultVisible: true,
    description:
      'GitHub is a platform for version control and collaboration, enabling developers to host, review, and manage code repositories.',
    icon: SiGithub,
    id: 'github',
    label: 'GitHub',
    readme:
      'Connect to GitHub to access your repositories, create and manage issues, review pull requests, and collaborate on code—all through natural conversation with your AI assistant.',
  },
  {
    author: 'Orvilo',
    authorUrl: OFFICIAL_SITE,
    defaultVisible: true,
    description:
      'Linear is a modern issue tracking and project management tool designed for high-performance teams to build better software faster',
    icon: SiLinear,
    id: 'linear',
    readme:
      'Bring the power of Linear directly into your AI assistant. Create and update issues, manage sprints, track project progress, and streamline your development workflow—all through natural conversation.',
    label: 'Linear',
  },
  {
    author: 'Orvilo',
    authorUrl: OFFICIAL_SITE,
    defaultVisible: true,
    description:
      'Outlook Calendar is an integrated scheduling tool within Microsoft Outlook that enables users to create appointments, organize meetings with others, and manage their time and events effectively.',
    icon: 'https://hub-apac-1.objects.aspectlylabs.com/assets/logos/outlook.svg',
    id: 'microsoft',
    readme:
      'Integrate with Outlook Calendar to view, create, and manage your events seamlessly. Schedule meetings, check availability, set reminders, and coordinate your time—all through natural language commands.',
    label: 'Outlook Calendar',
  },
  {
    author: 'Orvilo',
    authorUrl: OFFICIAL_SITE,
    defaultVisible: true,
    description: 'Notion is a collaborative productivity and note-taking application.',
    icon: 'https://hub-apac-1.objects.aspectlylabs.com/assets/logos/notion.svg',
    id: 'notion',
    readme:
      'Connect to Notion to access and manage your workspace. Create pages, search content, update databases, and organize your knowledge base—all through natural conversation with your AI assistant.',
    label: 'Notion',
  },
  {
    author: 'Orvilo',
    authorUrl: OFFICIAL_SITE,
    defaultVisible: true,
    description:
      'PostHog is an open-source product analytics platform for analyzing events, funnels, cohorts, feature flags, experiments, and user behavior.',
    icon: SiPosthog,
    id: 'posthog',
    label: 'PostHog',
    readme:
      'Connect to PostHog to query product analytics, inspect dashboards, review feature flags and experiments, and understand user behavior through natural conversation with your AI assistant.',
  },
  {
    author: 'Orvilo',
    authorUrl: OFFICIAL_SITE,
    defaultVisible: true,
    description:
      'X is a social media platform for sharing real-time updates, news, and engaging with your audience through posts, replies, and direct messages.',
    icon: SiX,
    id: 'twitter',
    readme:
      'Connect to X to publish posts, manage your timeline, and engage with your audience. Create content, schedule posts, monitor mentions, and build your social media presence through conversational AI.',
    label: 'X',
  },
  {
    author: 'Orvilo',
    authorUrl: OFFICIAL_SITE,
    defaultVisible: true,
    description:
      'Vercel is a cloud platform for frontend developers, providing hosting and serverless functions to deploy web applications with ease.',
    icon: SiVercel,
    id: 'vercel',
    readme:
      'Connect to Vercel to manage your deployments, monitor project status, and control your infrastructure. Deploy applications, check build logs, manage environment variables, and scale your projects through conversational AI.',
    label: 'Vercel',
  },
];

export const ORVILO_CONNECTOR_PROVIDERS = ORVILO_SKILL_PROVIDERS;

/**
 * Get provider config by ID
 */
export const getOrviloSkillProviderById = (id: string) =>
  ORVILO_SKILL_PROVIDERS.find((p) => p.id === id);

export const getOrviloConnectorProviderById = getOrviloSkillProviderById;

/**
 * Get all visible providers (for default UI display)
 */
export const getVisibleOrviloSkillProviders = () =>
  ORVILO_SKILL_PROVIDERS.filter((p) => p.defaultVisible !== false);
