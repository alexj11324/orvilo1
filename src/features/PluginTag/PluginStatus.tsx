import { memo } from 'react';

import ManifestPreviewer from '@/components/ManifestPreviewer';
import { useToolStore } from '@/store/tool';
import { toolSelectors } from '@/store/tool/selectors';

interface PluginStatusProps {
  deprecated?: boolean;
  id: string;
  title?: string;
}

const PluginStatus = memo<PluginStatusProps>(({ title, id }) => {
  const manifest = useToolStore(toolSelectors.getManifestById(id));
  return (
    <div className="flex flex-col gap-1">
      {manifest ? (
        <ManifestPreviewer manifest={manifest}>
          <span>{title || id}</span>
        </ManifestPreviewer>
      ) : (
        <span>{title || id}</span>
      )}
    </div>
  );
});

export default PluginStatus;
