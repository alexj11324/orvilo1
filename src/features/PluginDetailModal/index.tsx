import { t as i18nT } from 'i18next';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import useMergeState from 'use-merge-value';

import { createModal } from '@/components/Modal';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PluginSettingsConfig from '@/features/PluginSettings';
import { pluginHelpers } from '@/store/tool';

import APIs from './APIs';
import Meta from './Meta';

export interface PluginDetailModalProps {
  id: string;
  onTabChange?: (key: string) => void;
  schema: any;
  tab?: string;
}

enum Tab {
  Info = 'info',
  Settings = 'settings',
}

const PluginDetailModal = memo<PluginDetailModalProps>(({ schema, id, onTabChange, tab }) => {
  const [tabKey, setTabKey] = useMergeState(Tab.Info, {
    onChange: onTabChange,
    value: tab,
  });
  const { t } = useTranslation('plugin');

  const hasSettings = pluginHelpers.isSettingSchemaNonEmpty(schema);

  return (
    <>
      <Meta id={id} />
      <Tabs
        style={{ marginBlock: 16 }}
        value={tabKey}
        onValueChange={(key) => setTabKey(key as Tab)}
      >
        <TabsList className="flex w-full">
          <TabsTrigger className="flex-1" value={Tab.Info}>
            {t('detailModal.tabs.info')}
          </TabsTrigger>
          {hasSettings && (
            <TabsTrigger className="flex-1" value={Tab.Settings}>
              {t('detailModal.tabs.settings')}
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>
      {tabKey === 'settings' ? (
        hasSettings && <PluginSettingsConfig id={id} schema={schema} />
      ) : (
        <APIs id={id} />
      )}
    </>
  );
});

PluginDetailModal.displayName = 'PluginDetailModal';

export const createPluginDetailModal = (props: PluginDetailModalProps) =>
  createModal({
    content: <PluginDetailModal {...props} />,
    footer: null,
    title: i18nT('dev.title.skillDetails', { ns: 'plugin' }),
    width: 800,
  });
