import type { IconType } from '@icons-pack/react-simple-icons';
import {
  SiAtlassian,
  SiFigma,
  SiGithub,
  SiHuggingface,
  SiLinear,
  SiNotion,
  SiPosthog,
  SiSentry,
  SiSupabase,
  SiVercel,
} from '@icons-pack/react-simple-icons';

/**
 * A curated, official hosted MCP server that can be added as a custom
 * connector in one click (URL + auth pre-filled in the connector form).
 *
 * Unlike Orvilo/Composio OAuth providers these need no market backend: the
 * connector talks to the vendor's own remote MCP endpoint directly, so the
 * preset catalog stays visible on every deployment.
 */
export interface McpPresetConnector {
  /** Auth method preselected in the connector form (oauth2 → DCR/pre-registration). */
  authType: 'none' | 'oauth2';
  /** Short description pre-filled into the connector form. */
  description: string;
  /** Icon — a simple-icons component or an image URL. */
  icon: string | IconType;
  /** Preset id; the created connector's identifier defaults to `<id>-mcp`. */
  id: string;
  /** Display label (brand name, intentionally not localized). */
  label: string;
  /** Official remote MCP endpoint (streamable HTTP). */
  url: string;
}

/** The default connector identifier a preset creates. */
export const getMcpPresetConnectorIdentifier = (preset: McpPresetConnector) => `${preset.id}-mcp`;

/**
 * Normalize an MCP server URL for preset↔connector matching (case-insensitive,
 * trailing slashes ignored).
 */
export const normalizeMcpServerUrl = (url?: string | null) =>
  url?.trim().toLowerCase().replace(/\/+$/, '') ?? '';

/**
 * Find the preset a connector was created from — by connector identifier
 * (`<id>-mcp`) or by pointing at the preset's endpoint.
 */
export const matchMcpPresetByConnector = (
  connector: { identifier: string; mcpServerUrl?: string | null },
  presets: McpPresetConnector[] = MCP_PRESET_CONNECTORS,
) =>
  presets.find(
    (p) =>
      connector.identifier === getMcpPresetConnectorIdentifier(p) ||
      (connector.mcpServerUrl &&
        normalizeMcpServerUrl(connector.mcpServerUrl) === normalizeMcpServerUrl(p.url)),
  );

export const MCP_PRESET_CONNECTORS: McpPresetConnector[] = [
  {
    authType: 'oauth2',
    description:
      'GitHub is a platform for version control and collaboration, enabling developers to host, review, and manage code repositories.',
    icon: SiGithub,
    id: 'github',
    label: 'GitHub',
    url: 'https://api.githubcopilot.com/mcp/',
  },
  {
    authType: 'oauth2',
    description:
      'Linear is a modern issue tracking and project management tool designed for high-performance teams.',
    icon: SiLinear,
    id: 'linear',
    label: 'Linear',
    url: 'https://mcp.linear.app/mcp',
  },
  {
    authType: 'oauth2',
    description: 'Notion is a collaborative productivity and note-taking application.',
    icon: SiNotion,
    id: 'notion',
    label: 'Notion',
    url: 'https://mcp.notion.com/mcp',
  },
  {
    authType: 'oauth2',
    description:
      'Vercel is a cloud platform for frontend developers, providing hosting and serverless functions to deploy web applications.',
    icon: SiVercel,
    id: 'vercel',
    label: 'Vercel',
    url: 'https://mcp.vercel.com',
  },
  {
    authType: 'oauth2',
    description:
      'Figma is a collaborative design tool; its MCP server exposes designs, components, and design-system context.',
    icon: SiFigma,
    id: 'figma',
    label: 'Figma',
    url: 'https://mcp.figma.com/mcp',
  },
  {
    authType: 'oauth2',
    description:
      'Sentry is an error monitoring and performance platform; its MCP server exposes issues, events, and project context.',
    icon: SiSentry,
    id: 'sentry',
    label: 'Sentry',
    url: 'https://mcp.sentry.dev/mcp',
  },
  {
    authType: 'oauth2',
    description:
      'PostHog is an open-source product analytics platform for events, funnels, feature flags, and experiments.',
    icon: SiPosthog,
    id: 'posthog',
    label: 'PostHog',
    url: 'https://mcp.posthog.com/mcp',
  },
  {
    authType: 'oauth2',
    description:
      'Supabase is an open-source backend; its MCP server manages projects, databases, edge functions, and branches.',
    icon: SiSupabase,
    id: 'supabase',
    label: 'Supabase',
    url: 'https://mcp.supabase.com/mcp',
  },
  {
    authType: 'oauth2',
    description:
      'Atlassian Rovo MCP connects Jira and Confluence — issues, pages, and team context.',
    icon: SiAtlassian,
    id: 'atlassian',
    label: 'Atlassian',
    url: 'https://mcp.atlassian.com/v1/mcp',
  },
  {
    authType: 'oauth2',
    description:
      'Hugging Face is the hub for open models, datasets, and Spaces; its MCP server exposes hub search and paper context.',
    icon: SiHuggingface,
    id: 'huggingface',
    label: 'Hugging Face',
    url: 'https://huggingface.co/mcp',
  },
];
