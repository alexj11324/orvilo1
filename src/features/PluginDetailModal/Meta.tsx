import isEqual from 'fast-deep-equal';
import { memo } from 'react';

import PluginAvatar from '@/features/PluginAvatar';
import { pluginHelpers, useToolStore } from '@/store/tool';
import { pluginSelectors } from '@/store/tool/selectors';

const Meta = memo<{
  id: string;
}>(({ id }) => {
  const pluginMeta = useToolStore(pluginSelectors.getPluginMetaById(id), isEqual);

  return (
    <div
      className="flex gap-4 p-4"
      style={{ border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG }}
    >
      <PluginAvatar identifier={id} size={40} />
      <div className="flex flex-col gap-0.5">
        <div>{pluginHelpers.getPluginTitle(pluginMeta)}</div>
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          {pluginHelpers.getPluginDesc(pluginMeta)}
        </div>
      </div>
    </div>
  );
});

export default Meta;
