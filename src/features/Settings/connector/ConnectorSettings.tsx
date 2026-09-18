'use client';

import { createStaticStyles } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo, useEffect, useState } from 'react';

import NavHeader from '@/features/NavHeader';
import { useToolStore } from '@/store/tool';
import { builtinToolSelectors } from '@/store/tool/selectors';

import ConnectorDetailPanel, { type ConnectorDetailType } from './features/ConnectorDetail';
import LeftPanel from './features/LeftPanel';

export interface SelectedConnector {
  identifier: string;
  type: ConnectorDetailType;
}

const styles = createStaticStyles(({ css }) => ({
  detail: css`
    overflow-y: auto;
    flex: 1;
  `,
  root: css`
    overflow: hidden;
    display: flex;
    flex: 1;
    height: 100%;
  `,
}));

/**
 * The Connector settings master-detail surface.
 *
 * This used to be `ToolSettings` with a `viewMode: 'skill' | 'connector'` switch
 * shared with the platform skill-management page. That page is retired, so this
 * component no longer reads the skill stores (builtin / market / user skills),
 * no longer honours the `?skill=` deep link, and its detail panel only knows
 * connector kinds.
 */
export const ConnectorSettings = memo(() => {
  const [selected, setSelected] = useState<SelectedConnector | null>(null);

  const builtinTools = useToolStore((s) => s.builtinTools, isEqual);
  const installedBuiltinIds = useToolStore(
    (s) => builtinToolSelectors.installedAllMetaList(s).map((tool) => tool.identifier),
    isEqual,
  );

  useEffect(() => {
    if (selected) return;

    const firstTool = builtinTools.find(
      (tool) => !tool.hidden && installedBuiltinIds.includes(tool.identifier),
    );
    if (firstTool) {
      setSelected({ identifier: firstTool.identifier, type: 'builtin' });
    }
  }, [builtinTools, installedBuiltinIds, selected]);

  return (
    <>
      <NavHeader />
      <div className={styles.root}>
        <LeftPanel
          selectedIdentifier={selected?.identifier}
          onSelect={(identifier, type) => setSelected({ identifier, type })}
        />

        {selected && (
          <div className={styles.detail}>
            <ConnectorDetailPanel
              identifier={selected.identifier}
              type={selected.type}
              onDelete={() => setSelected(null)}
            />
          </div>
        )}
      </div>
    </>
  );
});

ConnectorSettings.displayName = 'ConnectorSettings';

export default ConnectorSettings;
