import { type Context, type MenuContext } from '../types';

/**
 * Configuration for context detection
 */
interface ContextConfig {
  captureSubPath?: boolean;
  matcher: RegExp;
  name: string;
  type: MenuContext;
}

/**
 * Context configurations - easily extensible for adding new contexts
 */
const CONTEXT_CONFIGS: ContextConfig[] = [
  {
    matcher: /^\/agent\/[^/]+(?:\/[^/]+(?:\/page(?:\/[^/]+)?)?)?$/,
    name: 'Agent',
    type: 'agent',
  },
  {
    matcher: /^\/group\/[^/]+$/,
    name: 'Group',
    type: 'group',
  },
  {
    captureSubPath: true,
    matcher: /^\/settings(?:\/([^/]+))?/,
    name: 'Settings',
    type: 'settings',
  },
  {
    captureSubPath: true,
    // Anchored: without `/?$` the retired `/memory-center` path would match
    // the `/memory` prefix and inherit a context it no longer belongs to.
    matcher: /^\/memory(?:\/([^/]+))?\/?$/,
    name: 'Memory',
    type: 'memory',
  },
  {
    matcher: /^\/project\/[^/]+/,
    name: 'Project',
    type: 'project',
  },
  {
    matcher: /^\/task\/[^/]+/,
    name: 'Task',
    type: 'task',
  },
  {
    matcher: /^\/teams\/[^/]+/,
    name: 'Team',
    type: 'team',
  },
  {
    matcher: /^\/inbox/,
    name: 'Inbox',
    type: 'inbox',
  },
  {
    captureSubPath: true,
    matcher: /^\/resource(?:\/([^/]+))?/,
    name: 'Resource',
    type: 'resource',
  },
];

/**
 * Detects the current context based on pathname
 * @param pathname - The current pathname from react-router
 * @returns Context object if detected, undefined otherwise
 */
// Top-level route names that may appear directly at path root. A first segment
// that is none of these is a workspace slug and gets stripped before matching.
const TOP_LEVEL_SEGMENTS = new Set([
  'agent',
  'agents',
  'automations',
  'goal',
  'group',
  'inbox',
  'invite',
  'members',
  'memory',
  'my-issues',
  'my-work',
  'project',
  'projects',
  'resource',
  'reviews',
  'settings',
  'task',
  'tasks',
  'teams',
  'views',
]);

export const detectContext = (pathname: string): MenuContext => {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  const rest =
    first && !TOP_LEVEL_SEGMENTS.has(first) ? `/${segments.slice(1).join('/')}` : pathname;
  for (const config of CONTEXT_CONFIGS) {
    const match = rest.match(config.matcher);

    if (match) {
      const context: Context = {
        name: config.name,
        type: config.type,
      };

      // Capture sub-path if configured
      if (config.captureSubPath && match[1]) {
        context.subPath = match[1];
      }

      return context.type;
    }
  }

  return 'general';
};
