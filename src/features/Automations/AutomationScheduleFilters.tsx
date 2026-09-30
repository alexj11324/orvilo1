import { ChevronDownIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { DropdownMenu } from '@/components/ItemsMenu';
import { Button } from '@/components/ui/button';

import type { AutomationScope, AutomationStatusFilter } from './shared';

/**
 * The two narrowings the scheduled-task surface offers, split into separate
 * controls because the two doors place them differently: the Automations page
 * puts the scope switch beside its title, while the Tasks page keeps them
 * together on the right so the collection tabs own the left.
 *
 * Both are controlled — the value drives the fetch, so it has to live in the
 * page that owns the SWR handle and the URL params, not here.
 */

interface AutomationScopeSwitchProps {
  onChange: (scope: AutomationScope) => void;
  scope: AutomationScope;
}

/** Workspace-wide automations vs. only the ones this caller created. */
export const AutomationScopeSwitch = memo<AutomationScopeSwitchProps>(({ onChange, scope }) => {
  const { t } = useTranslation('automation');

  return (
    <div className="flex gap-0.5">
      <Button
        size="sm"
        variant={scope === 'all' ? 'secondary' : 'ghost'}
        onClick={() => onChange('all')}
      >
        {t('overview.team')}
      </Button>
      <Button
        size="sm"
        variant={scope === 'created' ? 'secondary' : 'ghost'}
        onClick={() => onChange('created')}
      >
        {t('overview.mine')}
      </Button>
    </div>
  );
});

AutomationScopeSwitch.displayName = 'AutomationScopeSwitch';

interface AutomationStatusSelectProps {
  onChange: (filter: AutomationStatusFilter) => void;
  value: AutomationStatusFilter;
}

/** All / Active / Paused, translated to a server-side status narrowing. */
export const AutomationStatusSelect = memo<AutomationStatusSelectProps>(({ onChange, value }) => {
  const { t } = useTranslation('automation');

  return (
    <DropdownMenu
      items={(
        [
          ['all', t('overview.all_statuses')],
          ['active', t('status.active')],
          ['paused', t('status.paused')],
        ] as const
      ).map(([option, label]) => ({
        icon:
          value === option ? (
            <div className="flex flex-col items-center justify-center h-[14px] w-[14px]">
              <span
                style={{
                  background: 'currentColor',
                  borderRadius: '50%',
                  display: 'inline-block',
                  height: 6,
                  width: 6,
                }}
              />
            </div>
          ) : undefined,
        key: option,
        label,
        onClick: () => onChange(option),
      }))}
    >
      <Button iconPosition={'end'} size="sm" title={t('overview.filter_automations')}>
        <ChevronDownIcon data-icon="inline-start" />
        {value === 'all' ? t('overview.all_statuses') : t(`status.${value}`)}
      </Button>
    </DropdownMenu>
  );
});

AutomationStatusSelect.displayName = 'AutomationStatusSelect';
