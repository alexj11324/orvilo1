'use client';

import { SOCIAL_URL } from '@orvilo/business-const';
import { cn } from 'cn';
import { BookOpenIcon, CodeIcon, DownloadIcon, PackageCheckIcon, SettingsIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { Badge } from '@/components/reui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToolStore } from '@/store/tool';
import { pluginSelectors } from '@/store/tool/selectors';
import { McpNavKey } from '@/types/discover';

import { useDetailContext } from './DetailProvider';

const styles = { link: 'text-foreground-description hover:text-primary-text' };

const twStyles = {
  nav: 'border-be border-divider',
  tabs: 'min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
};

interface NavProps {
  activeTab?: McpNavKey;
  inModal?: boolean;
  mobile?: boolean;
  noSettings?: boolean;
  setActiveTab?: (tab: McpNavKey) => void;
}
const Nav = memo<NavProps>(
  ({ mobile, noSettings, setActiveTab, activeTab = McpNavKey.Overview, inModal }) => {
    const { t } = useTranslation('discover');
    const { deploymentOptions, toolsCount, resourcesCount, promptsCount, github, identifier } =
      useDetailContext();

    // Check if the plugin is installed
    const installedPlugin = useToolStore(pluginSelectors.getInstalledPluginById(identifier));

    const deploymentCount = deploymentOptions?.length || 0;
    const schemaCount = Number(toolsCount) + Number(promptsCount) + Number(resourcesCount);

    const nav = (
      <Tabs
        className={twStyles.tabs}
        value={activeTab}
        onValueChange={(key) => setActiveTab?.(key as McpNavKey)}
      >
        <TabsList className="w-full">
          {[
            // Only show the settings tab for installed plugins
            !noSettings &&
              installedPlugin && {
                icon: <SettingsIcon size={16} />,
                key: McpNavKey.Settings,
                label: t('mcp.details.settings.title'),
              },
            {
              icon: <BookOpenIcon size={16} />,
              key: McpNavKey.Overview,
              label: t('mcp.details.overview.title'),
            },
            {
              icon: <DownloadIcon size={16} />,
              key: McpNavKey.Deployment,
              label:
                deploymentCount > 1 ? (
                  <div className="inline-flex items-center gap-1.5">
                    {t('mcp.details.deployment.title')}
                    <Badge variant="secondary">{deploymentCount}</Badge>
                  </div>
                ) : (
                  t('mcp.details.deployment.title')
                ),
            },
            {
              icon: <CodeIcon size={16} />,
              key: McpNavKey.Schema,
              label:
                schemaCount > 1 ? (
                  <div className="inline-flex items-center gap-1.5">
                    {t('mcp.details.schema.title')}
                    <Badge variant="secondary">{schemaCount}</Badge>
                  </div>
                ) : (
                  t('mcp.details.schema.title')
                ),
            },
            {
              icon: <PackageCheckIcon size={16} />,
              key: McpNavKey.Score,
              label: t('mcp.details.score.title'),
            },
          ].map((item) =>
            item ? (
              <TabsTrigger key={item.key} value={item.key}>
                {item.icon}
                {item.label}
              </TabsTrigger>
            ) : null,
          )}
        </TabsList>
      </Tabs>
    );

    return mobile ? (
      nav
    ) : (
      <div className={cn('flex items-center justify-between', twStyles.nav)}>
        {nav}
        {!inModal && (
          <div className="flex flex-none gap-3 ms-3 whitespace-nowrap">
            {/* A white-label deployment may have no community server to point
                at; drop the entry rather than render a link that goes nowhere. */}
            {SOCIAL_URL.discord && (
              <a className={styles.link} href={SOCIAL_URL.discord} rel="noreferrer" target="_blank">
                {t('mcp.details.nav.needHelp')}
              </a>
            )}
            {github?.url && (
              <>
                <a className={styles.link} href={github.url} rel="noreferrer" target="_blank">
                  {t('mcp.details.nav.viewSourceCode')}
                </a>
                <a
                  className={styles.link}
                  href={urlJoin(github.url, 'issues')}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t('mcp.details.nav.reportIssue')}
                </a>
              </>
            )}
          </div>
        )}
      </div>
    );
  },
);

export default Nav;
