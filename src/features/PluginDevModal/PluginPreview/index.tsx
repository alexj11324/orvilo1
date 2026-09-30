import { Button, Text } from '@lobehub/ui/base-ui';
import { type ToolManifest } from '@orvilo/types';
import { type FormInstance } from 'antd';
import { Form as AForm } from 'antd';
import { cssVar } from 'antd-style';
import { FileCode } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ManifestPreviewer from '@/components/ManifestPreviewer';
import PluginAvatar from '@/components/Plugins/PluginAvatar';
import PluginTag from '@/components/Plugins/PluginTag';
import { pluginHelpers } from '@/store/tool';

import ApiVisualizer from './ApiVisualizer';
import PluginEmptyState from './EmptyState';

const PluginPreview = memo<{ form: FormInstance }>(({ form }) => {
  const { t } = useTranslation('plugin');
  const manifest: ToolManifest = AForm.useWatch(['manifest'], form);
  const meta = manifest?.meta;

  if (!manifest)
    return (
      <div
        className="flex flex-col"
        style={{ flex: 2, height: '100%', background: cssVar.colorBgLayout }}
      >
        <PluginEmptyState />
      </div>
    );

  return (
    <div
      className="flex flex-col gap-6 p-3"
      style={{ flex: 2, background: cssVar.colorBgLayout, overflowY: 'auto' }}
    >
      <div
        className="flex gap-4 justify-between p-4"
        style={{ border: `1px solid ${cssVar.colorBorder}`, borderRadius: cssVar.borderRadiusLG }}
        title={t('dev.preview.card')}
      >
        <div className="flex gap-4">
          <PluginAvatar avatar={pluginHelpers.getPluginAvatar(meta)} size={40} />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {pluginHelpers.getPluginTitle(meta) || 'Plugin Title'}
              <PluginTag type={'customPlugin'} />
            </div>
            <Text style={{ fontSize: 12 }} type={'secondary'}>
              {pluginHelpers.getPluginDesc(meta) || 'Plugin Description'}
            </Text>
          </div>
        </div>

        {manifest && (
          <ManifestPreviewer manifest={manifest}>
            <div className="flex flex-col">
              <Button icon={<FileCode />}>{t('dev.mcp.previewManifest')}</Button>
            </div>
          </ManifestPreviewer>
        )}
      </div>
      {manifest && <ApiVisualizer apis={manifest.api as any} />}
    </div>
  );
});

export default PluginPreview;
