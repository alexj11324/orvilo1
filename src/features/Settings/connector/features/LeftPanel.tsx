'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { Grid2x2Plus } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CustomConnectorModal } from '@/features/Connectors';

import { type ConnectorDetailType } from './ConnectorDetail';
import ConnectorList from './ConnectorList';

const styles = createStaticStyles(({ css, cssVar }) => ({
  body: css`
    overflow-y: auto;
    flex: 1;
    padding-block: 4px;
    padding-inline: 8px;
  `,
  header: css`
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    height: 42px;
    padding-inline: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  root: css`
    overflow-y: auto;
    display: flex;
    flex-direction: column;

    width: 300px;
    min-width: 260px;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

interface LeftPanelProps {
  onSelect: (identifier: string, type: ConnectorDetailType) => void;
  selectedIdentifier?: string;
}

const LeftPanel = memo<LeftPanelProps>(({ onSelect, selectedIdentifier }) => {
  const { t } = useTranslation('setting');
  const [showAddConnector, setShowAddConnector] = useState(false);

  return (
    <>
      <div className={styles.root}>
        <div className={styles.header}>
          <Text strong style={{ fontSize: 14 }}>
            {t('skillView.connectors', 'Connectors')}
          </Text>

          <Flexbox horizontal gap={6} onClick={(e) => e.stopPropagation()}>
            {/* Single action: add a custom OAuth connector. */}
            <Button
              icon={Grid2x2Plus}
              size="small"
              title={t('connector.add.title', {
                defaultValue: 'Add Custom Connector',
                ns: 'tool',
              })}
              onClick={() => setShowAddConnector(true)}
            />
          </Flexbox>
        </div>

        <div className={styles.body}>
          <ConnectorList selectedIdentifier={selectedIdentifier} onSelect={onSelect} />
        </div>
      </div>
      <CustomConnectorModal open={showAddConnector} onClose={() => setShowAddConnector(false)} />
    </>
  );
});

LeftPanel.displayName = 'ConnectorSettingsLeftPanel';

export default LeftPanel;
