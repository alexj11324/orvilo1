import isEqual from 'fast-deep-equal';
import { LucideToyBrick } from 'lucide-react';
import { memo } from 'react';

import Avatar from '@/components/Plugins/PluginAvatar';
import { pluginHelpers, useToolStore } from '@/store/tool';
import { toolSelectors } from '@/store/tool/selectors';

interface PluginAvatarProps {
  identifier: string;
  size?: number;
}

const PluginAvatar = memo<PluginAvatarProps>(({ identifier, size = 32 }) => {
  const pluginMeta = useToolStore(toolSelectors.getMetaById(identifier), isEqual);
  const pluginAvatar = pluginHelpers.getPluginAvatar(pluginMeta);
  const pluginTitle = pluginHelpers.getPluginTitle(pluginMeta) ?? identifier;

  return pluginAvatar ? (
    <Avatar alt={pluginTitle} avatar={pluginAvatar} size={size} />
  ) : (
    <LucideToyBrick />
  );
});
export default PluginAvatar;
