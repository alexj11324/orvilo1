import isEqual from 'fast-deep-equal';
import { LucideRotateCw, LucideTrash2, RotateCwIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import ManifestPreviewer from '@/components/ManifestPreviewer';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/store/agent';
import { useToolStore } from '@/store/tool';
import { customPluginSelectors, toolSelectors } from '@/store/tool/selectors';

interface PluginStatusProps {
  deprecated?: boolean;
  id: string;
  title?: string;
}
const PluginStatus = memo<PluginStatusProps>(({ title, id, deprecated }) => {
  const { t } = useTranslation();
  const [status, installError, isCustom, reinstallCustomPlugin] = useToolStore((s) => [
    toolSelectors.getManifestLoadingStatus(id)(s),
    toolSelectors.getPluginInstallError(id)(s),
    customPluginSelectors.isCustomPlugin(id)(s),
    s.reinstallCustomPlugin,
  ]);

  const manifest = useToolStore(toolSelectors.getManifestById(id), isEqual);

  const removePlugin = useAgentStore((s) => s.removePlugin);

  const renderStatus = useMemo(() => {
    switch (status) {
      case 'loading': {
        return <span className="inline-block size-2 animate-pulse rounded-full bg-info" />;
      }
      case 'error': {
        return (
          <ActionIcon
            icon={LucideRotateCw}
            size={'small'}
            title={t('retry')}
            onClick={() => {
              reinstallCustomPlugin(id);
            }}
          />
        );
      }

      default:
      case 'success': {
        return <span className="inline-block size-2 rounded-full bg-success" />;
      }
    }
  }, [id, reinstallCustomPlugin, status, t]);

  const tag =
    // Deprecated tag
    deprecated ? (
      <Badge className="mr-0" variant="destructive-light">
        {t('list.item.deprecated.title', { ns: 'plugin' })}
      </Badge>
    ) : // Custom tag
    isCustom ? (
      <Badge variant="warning-light">{t('list.item.local.title', { ns: 'plugin' })}</Badge>
    ) : null;

  return (
    <div className="flex items-start gap-3 justify-between">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {title || id}
          {tag}
        </div>
        {installError ? (
          <div className="text-[12px] text-destructive">
            {t(`error.${installError.message}`, {
              defaultValue: installError.cause,
              error: installError.cause,
              ns: 'plugin',
            })}
          </div>
        ) : null}
      </div>

      {deprecated ? (
        <ActionIcon
          icon={LucideTrash2}
          size={'small'}
          title={t('plugin.clearDeprecated', { ns: 'setting' })}
          onClick={(e) => {
            e.stopPropagation();
            removePlugin(id);
          }}
        />
      ) : (
        <div className="flex items-center">
          {isCustom ? (
            <ActionIcon
              icon={RotateCwIcon}
              size={'small'}
              title={t('dev.meta.manifest.refresh', { ns: 'plugin' })}
              onClick={(e) => {
                e.stopPropagation();
                reinstallCustomPlugin(id);
              }}
            />
          ) : null}
          <ManifestPreviewer manifest={manifest || {}} trigger={'hover'}>
            <Button size="icon-sm" variant="ghost">
              {renderStatus}
            </Button>
          </ManifestPreviewer>
        </div>
      )}
    </div>
  );
});

export default PluginStatus;
