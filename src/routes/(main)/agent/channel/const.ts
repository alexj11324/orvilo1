import * as Icons from '@lobehub/ui/icons';
import type { FC } from 'react';

/** Known icon names from @lobehub/ui/icons that correspond to chat platforms. */
const ICON_NAMES = [
  'Discord',
  'GoogleChat',
  'IMessage',
  'Lark',
  'Line',
  'MicrosoftTeams',
  'QQ',
  'Slack',
  'Telegram',
  'WeChat',
  'WhatsApp',
] as const;

/** Alias map for platforms whose display name differs from the icon name. */
const ICON_ALIASES: Record<string, string> = {
  feishu: 'Lark',
};

/**
 * Resolve icon component by matching against known icon names.
 * Accepts either a platform display name (e.g. "Feishu / Lark") or id (e.g. "discord").
 */
export function getPlatformIcon(nameOrId: string): FC<any> | undefined {
  const alias = ICON_ALIASES[nameOrId.toLowerCase()];
  if (alias) return (Icons as Record<string, any>)[alias];

  const name = ICON_NAMES.find(
    (n) => nameOrId.includes(n) || nameOrId.toLowerCase() === n.toLowerCase(),
  );
  return name ? (Icons as Record<string, any>)[name] : undefined;
}

/**
 * Platforms registered server-side but hidden behind a lab flag. An
 * experimental channel is not an actionable entry until its flag turns the
 * capability on, so it is filtered out of the platform list entirely rather
 * than shown as a placeholder. (The old virtual "coming soon" entries —
 * WhatsApp, and iMessage with its flag off — advertised platforms with no
 * real configuration capability and were removed.)
 */
export const visibleChannelPlatforms = <T extends { id: string }>(
  platforms: T[],
  options: { enableImessage: boolean },
): T[] => platforms.filter((p) => p.id !== 'imessage' || options.enableImessage);
