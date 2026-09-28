import { Center, Flexbox } from '@lobehub/ui';
import { Button, DropdownMenu } from '@lobehub/ui/base-ui';
import { ChevronDownIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
    <Flexbox horizontal gap={2}>
      <Button
        size={'small'}
        type={scope === 'all' ? 'fill' : 'text'}
        onClick={() => onChange('all')}
      >
        {t('overview.team')}
      </Button>
      <Button
        size={'small'}
        type={scope === 'created' ? 'fill' : 'text'}
        onClick={() => onChange('created')}
      >
        {t('overview.mine')}
      </Button>
    </Flexbox>
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
            <Center height={14} width={14}>
              <span
                style={{
                  background: 'currentColor',
                  borderRadius: '50%',
                  display: 'inline-block',
                  height: 6,
                  width: 6,
                }}
              />
            </Center>
          ) : undefined,
        key: option,
        label,
        onClick: () => onChange(option),
      }))}
    >
      <Button
        icon={ChevronDownIcon}
        iconPosition={'end'}
        size={'small'}
        title={t('overview.filter_automations')}
      >
        {value === 'all' ? t('overview.all_statuses') : t(`status.${value}`)}
      </Button>
    </DropdownMenu>
  );
});

AutomationStatusSelect.displayName = 'AutomationStatusSelect';
