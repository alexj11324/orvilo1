import { type ToolManifest } from '@orvilo/types';
import { type FormInstance } from 'antd';
import { cssVar } from 'antd-style';
import { FileCode } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AForm from '@/components/GroupForm';
import ManifestPreviewer from '@/components/ManifestPreviewer';
import PluginAvatar from '@/components/Plugins/PluginAvatar';
import PluginTag from '@/components/Plugins/PluginTag';
import { Button } from '@/components/ui/button';
import { pluginHelpers } from '@/store/tool';

import ApiVisualizer from './ApiVisualizer';
import PluginEmptyState from './EmptyState';

const PluginPreview = memo<{ form: FormInstance }>(({ form }) => {
  const { t } = useTranslation('plugin');
  const manifest: ToolManifest = AForm.useWatch(['manifest'], form);
  const meta = manifest?.meta;

  if (!manifest)
    return (
      <div className="flex flex-col h-[100%]" style={{ background: cssVar.colorBgLayout, flex: 2 }}>
        <PluginEmptyState />
      </div>
    );

  return (
    <div
      className="flex flex-col gap-6 p-3"
      style={{ background: cssVar.colorBgLayout, overflowY: 'auto', flex: 2 }}
    >
      <div className="rounded-md border bg-card flex flex-col">
        <div className="px-4 py-2 font-medium">{t('dev.preview.card')}</div>
        <div className="flex flex-row gap-4 justify-between p-4">
          <div className="flex flex-row gap-4">
            <PluginAvatar avatar={pluginHelpers.getPluginAvatar(meta)} size={40} />
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-row items-center gap-2">
                {pluginHelpers.getPluginTitle(meta) || 'Plugin Title'}
                <PluginTag type={'customPlugin'} />
              </div>
              <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                {pluginHelpers.getPluginDesc(meta) || 'Plugin Description'}
              </div>
            </div>
          </div>

          {manifest && (
            <ManifestPreviewer manifest={manifest}>
              <div className="flex flex-col">
                <Button>
                  <FileCode data-icon="inline-start" size={'1em'} />
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
