'use client';

import { type ComposioAppType } from '@orvilo/const';
import { COMPOSIO_APP_TYPES } from '@orvilo/const';
import isEqual from 'fast-deep-equal';
import { createElement, memo, useMemo } from 'react';

import Avatar from '@/components/Avatar';
import PluginAvatar from '@/components/Plugins/PluginAvatar';
import { Badge } from '@/components/reui/badge';
import { useToolStore } from '@/store/tool';
import {
  builtinToolSelectors,
  composioStoreSelectors,
  pluginSelectors,
} from '@/store/tool/selectors';

/**
 * Composio server icon component
 */
const ComposioIcon = memo<Pick<ComposioAppType, 'icon' | 'label'>>(({ icon, label }) => {
  if (typeof icon === 'string') {
    return <img alt={label} className="shrink-0" height={16} src={icon} width={16} />;
  }

  return createElement(icon, { fill: 'var(--foreground)', size: 16 });
});

const styles = {
  compact: 'h-auto rounded-(--radius-chip) border-0 bg-transparent p-0 text-xs leading-5',
  tag: 'h-auto min-h-6 rounded-(--radius-chip) text-xs leading-5',
};

export interface ToolTagProps {
  /**
   * The tool identifier to display
   */
  identifier: string;
  /**
   * Variant style of the tag
   * - 'default': normal tag with background and border
   * - 'compact': no padding, no background, no border (text only with icon)
   * @default 'default'
   */
  variant?: 'compact' | 'default';
}

/**
 * A readonly tag component that displays tool information based on identifier.
 * Unlike PluginTag, this component is not closable and is designed for display-only purposes.
 */
const ToolTag = memo<ToolTagProps>(({ identifier, variant = 'default' }) => {
  const isCompact = variant === 'compact';

  // Get local plugin lists
  const builtinList = useToolStore(builtinToolSelectors.metaList, isEqual);
  const installedPluginList = useToolStore(pluginSelectors.installedPluginMetaList, isEqual);

  // Composio related state
  const allComposioServers = useToolStore(composioStoreSelectors.getServers, isEqual);

  // Try to find in local lists first (including Composio)
  const localMeta = useMemo(() => {
    // Check if it's a Composio server type
    if (allComposioServers.some((server) => server.identifier === identifier)) {
      const composioType = COMPOSIO_APP_TYPES.find((type) => type.identifier === identifier);
      if (composioType) {
        const connectedServer = allComposioServers.find((s) => s.identifier === identifier);
        return {
          icon: composioType.icon,
          isInstalled: !!connectedServer,
          label: composioType.label,
          title: composioType.label,
          type: 'composio' as const,
        };
      }
    }

    const builtinMeta = builtinList.find((p) => p.identifier === identifier);
    if (builtinMeta) {
      return {
        avatar: builtinMeta.meta.avatar,
        isInstalled: true,
        title: builtinMeta.meta.title,
        type: 'builtin' as const,
      };
    }

    const installedMeta = installedPluginList.find((p) => p.identifier === identifier);
    if (installedMeta) {
      return {
        avatar: installedMeta.avatar,
        isInstalled: true,
        title: installedMeta.title,
        type: 'plugin' as const,
      };
    }

    return null;
  }, [identifier, builtinList, installedPluginList, allComposioServers]);

  // Historical metadata comes from saved local records.
  const meta = localMeta || {
    avatar: undefined,
    isInstalled: false,
    title: identifier,
    type: 'plugin' as const,
  };

  const displayTitle = meta.title;

  // Render icon based on type
  const renderIcon = () => {
    // Composio type has icon property
    if (meta.type === 'composio' && 'icon' in meta && 'label' in meta) {
      return <ComposioIcon icon={meta.icon} label={meta.label} />;
    }

    // Builtin type has avatar
    if (meta.type === 'builtin' && 'avatar' in meta && meta.avatar) {
      return <Avatar avatar={meta.avatar} className="shrink-0" shape={'square'} size={16} />;
    }

    // Plugin type
    if ('avatar' in meta) {
      return <PluginAvatar avatar={meta.avatar} size={16} />;
    }

    return null;
  };

  return (
    <Badge
      className={isCompact ? styles.compact : styles.tag}
      variant={isCompact ? 'outline' : 'secondary'}
    >
      {renderIcon()}
      {displayTitle}
    </Badge>
  );
});

ToolTag.displayName = 'ToolTag';

export default ToolTag;
