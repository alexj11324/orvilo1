import { FileCode } from 'lucide-react';
import { memo } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import ManifestPreviewer from '@/components/ManifestPreviewer';
import PluginAvatar from '@/components/Plugins/PluginAvatar';
import PluginTag from '@/components/Plugins/PluginTag';
import { Button } from '@/components/ui/button';
import { pluginHelpers } from '@/store/tool';

import { type McpDevForm } from '../MCPManifestForm/utils';
import ApiVisualizer from './ApiVisualizer';
import PluginEmptyState from './EmptyState';

const PluginPreview = memo<{ form: McpDevForm }>(({ form }) => {
  const { t } = useTranslation('plugin');
  const manifest = useWatch({ control: form.control, name: 'manifest' });
  const meta = manifest?.meta;

  if (!manifest)
    return (
      <div className="flex flex-2 flex-col h-full bg-background">
        <PluginEmptyState />
      </div>
    );

  return (
    <div className="flex flex-2 flex-col gap-6 overflow-y-auto bg-background p-3 text-sm leading-5.5">
      <div className="rounded-(--radius-card) border bg-card flex flex-col">
        <div className="px-4 py-2 font-medium">{t('dev.preview.card')}</div>
        <div className="flex flex-row gap-4 justify-between p-4">
          <div className="flex flex-row gap-4">
            <PluginAvatar avatar={pluginHelpers.getPluginAvatar(meta)} size={40} />
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-row items-center gap-2">
                {pluginHelpers.getPluginTitle(meta) || 'Plugin Title'}
                <PluginTag type={'customPlugin'} />
              </div>
              <div className="text-xs leading-5 text-muted-foreground">
                {pluginHelpers.getPluginDesc(meta) || 'Plugin Description'}
              </div>
            </div>
          </div>

          {manifest && (
            <ManifestPreviewer manifest={manifest}>
              <div className="flex flex-col">
                <Button type="button">
                  <FileCode data-icon="inline-start" size={16} />
                  {t('dev.mcp.previewManifest')}
                </Button>
              </div>
            </ManifestPreviewer>
          )}
        </div>
      </div>
      {manifest && <ApiVisualizer apis={manifest.api as any} />}
    </div>
  );
});

export default PluginPreview;
