'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { snakeCase } from 'es-toolkit/compat';
import { ListRestartIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { devDockPanelStyles } from '@/features/DevDock/panelStyles';
import { useServerConfigStore } from '@/store/serverConfig';
import {
  type FeatureFlagKey,
  isFeatureFlagOverridable,
} from '@/store/serverConfig/slices/featureFlagOverride/action';

import FlagRow from './FlagRow';

const styles = createStaticStyles(({ css }) => ({
  body: css`
    overflow: auto;
    flex: 1;
    min-height: 0;
  `,
  empty: css`
    padding-block: 32px;
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
    text-align: center;
  `,
  footer: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    padding-block: 8px;
    padding-inline: 12px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  toolbar: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;

    height: 44px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  toolbarFilter: css`
    display: flex;
    flex-shrink: 0;
    gap: 6px;
    align-items: center;

    height: 100%;
    padding-inline: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

const Panel = memo(() => {
  const originalFlags = useServerConfigStore((s) => s._originalFeatureFlags);
  const overrideCount = useServerConfigStore((s) => Object.keys(s._featureFlagOverrides).length);
  const overrides = useServerConfigStore((s) => s._featureFlagOverrides);
  const resetFlagOverrides = useServerConfigStore((s) => s.resetFlagOverrides);

  const [search, setSearch] = useState('');
  const [overriddenOnly, setOverriddenOnly] = useState(false);

  const flagKeys = useMemo<FeatureFlagKey[]>(() => {
    if (!originalFlags) return [];
    return (Object.keys(originalFlags) as (keyof typeof originalFlags)[])
      .filter(isFeatureFlagOverridable)
      .sort();
  }, [originalFlags]);

  const visibleKeys = useMemo(() => {
    const term = search.trim().toLowerCase();
    return flagKeys.filter((key) => {
      if (overriddenOnly && overrides[key] === undefined) return false;
      if (!term) return true;
      return snakeCase(key as string).includes(term);
    });
  }, [flagKeys, overrides, overriddenOnly, search]);

  if (!originalFlags)
    return (
      <div className={devDockPanelStyles.root}>
        <div className={styles.empty}>Server feature flags are not loaded yet.</div>
      </div>
    );

  return (
    <div className={devDockPanelStyles.root}>
      <div className={styles.toolbar}>
        <Input
          className={devDockPanelStyles.searchInput}
          placeholder={'Search flag name…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={`${styles.toolbarFilter} flex`}>
          <Switch checked={overriddenOnly} size="sm" onCheckedChange={setOverriddenOnly} />
          <div className="text-muted-foreground" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            overridden only
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {visibleKeys.length === 0 ? (
          <div className={styles.empty}>No flags match</div>
        ) : (
          visibleKeys.map((key) => <FlagRow flagKey={key} key={key} />)
        )}
      </div>

      <div className={styles.footer}>
        <div className="text-muted-foreground" style={{ fontSize: 11 }}>
          {overrideCount} active override{overrideCount === 1 ? '' : 's'} · client-side ·
          localStorage persisted
        </div>
        <Button disabled={overrideCount === 0} size="sm" onClick={resetFlagOverrides}>
          <ListRestartIcon data-icon="inline-start" />
          Reset all
        </Button>
      </div>
    </div>
  );
});

Panel.displayName = 'DevFeatureFlagPanel/Panel';

export default Panel;
