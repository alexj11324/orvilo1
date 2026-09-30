'use client';

import { Tabs, type TabsItem, Tag } from '@lobehub/ui/base-ui';
import { SOCIAL_URL } from '@orvilo/business-const';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { BookOpenIcon, CodeIcon, DownloadIcon, PackageCheckIcon, SettingsIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { useToolStore } from '@/store/tool';
import { pluginSelectors } from '@/store/tool/selectors';
import { McpNavKey } from '@/types/discover';

import { useDetailContext } from './DetailProvider';

const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    link: css`
      color: ${cssVar.colorTextDescription};

      &:hover {
        color: ${cssVar.colorInfo};
      }
    `,
    nav: css`
      border-block-end: 1px solid ${cssVar.colorBorder};
    `,
    tabs: css`
      scrollbar-width: none;
      overflow-x: auto;
      flex: 1;
      min-width: 0;

      &::-webkit-scrollbar {
        display: none;
      }
    `,
  };
});

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
        activeKey={activeTab}
        className={styles.tabs}
        variant="square"
        items={
          [
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
                  <div
                    className="flex items-center gap-1.5"
                    style={{
                      display: 'inline-flex',
                    }}
                  >
                    {t('mcp.details.deployment.title')}
                    <Tag>{deploymentCount}</Tag>
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
                  <div
                    className="flex items-center gap-1.5"
                    style={{
                      display: 'inline-flex',
                    }}
                  >
                    {t('mcp.details.schema.title')}
                    <Tag>{schemaCount}</Tag>
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
          ].filter(Boolean) as TabsItem[]
        }
        onChange={(key) => setActiveTab?.(key as McpNavKey)}
      />
    );

    return mobile ? (
      nav
    ) : (
      <div className={cn('flex items-center justify-between', styles.nav)}>
        {nav}
        {!inModal && (
          <div
            className="flex gap-3"
            style={{ flex: 'none', marginInlineStart: 12, whiteSpace: 'nowrap' }}
          >
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
