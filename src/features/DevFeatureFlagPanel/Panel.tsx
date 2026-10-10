'use client';

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

const styles = {
  body: 'overflow-auto flex-1 min-h-0',
  empty: 'py-8 text-sm leading-5.5 text-foreground-description text-center',
  footer: 'flex gap-2 items-center justify-between py-2 px-3 border-t border-divider',
  toolbar: 'flex shrink-0 items-center h-11 border-b border-divider',
  toolbarFilter: 'flex shrink-0 gap-1.5 items-center h-full px-3 border-s border-divider',
};

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
          <div className="text-muted-foreground text-xs leading-5 whitespace-nowrap">
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
        <div className="text-muted-foreground text-xs leading-5">
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
