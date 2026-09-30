'use client';
import { Check } from 'lucide-react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import type { ApiKeyScope } from '@/const/apiKeyScope';

/**
 * Scope groups shown to the user. Most domains carry read and write scopes;
 * usage is intentionally read-only, while the model group additionally
 * carries the money-burning `model:invoke` tier.
 */
type ScopeGroupKey =
  'agent' | 'chat' | 'file' | 'knowledge' | 'mcp' | 'model' | 'usage' | 'user' | 'workspace';

interface ScopeGroup {
  readonly key: ScopeGroupKey;
  readonly label: `apikey.scopes.groups.${ScopeGroupKey}`;
  readonly read: ApiKeyScope;
  readonly write?: ApiKeyScope;
}

const SCOPE_GROUPS: readonly ScopeGroup[] = [
  { key: 'agent', label: 'apikey.scopes.groups.agent', read: 'agent:read', write: 'agent:write' },
  { key: 'chat', label: 'apikey.scopes.groups.chat', read: 'chat:read', write: 'chat:write' },
  { key: 'model', label: 'apikey.scopes.groups.model', read: 'model:read', write: 'model:write' },
  { key: 'file', label: 'apikey.scopes.groups.file', read: 'file:read', write: 'file:write' },
  {
    key: 'knowledge',
    label: 'apikey.scopes.groups.knowledge',
    read: 'knowledge:read',
    write: 'knowledge:write',
  },
  { key: 'mcp', label: 'apikey.scopes.groups.mcp', read: 'mcp:read', write: 'mcp:write' },
  { key: 'usage', label: 'apikey.scopes.groups.usage', read: 'usage:read' },
  {
    key: 'workspace',
    label: 'apikey.scopes.groups.workspace',
    read: 'workspace:read',
    write: 'workspace:write',
  },
  { key: 'user', label: 'apikey.scopes.groups.user', read: 'user:read', write: 'user:write' },
];

export interface ScopeOverviewProps {
  scopes: string[];
}

/**
 * What the key can actually do, one row per granted domain.
 *
 * Deliberately NOT the creation grid frozen read-only: creation must offer
 * every option because you are choosing, but inspection answers "what does
 * this key reach", and a 15-cell grid with 4 ticks buries that answer in the
 * 11 it doesn't have. Granted scopes are rendered verbatim from storage (no
 * write→read derivation), so the list stays an honest mirror of the database.
 */
export const ScopeOverview: FC<ScopeOverviewProps> = ({ scopes }) => {
  const { t } = useTranslation('auth');
  const scopeSet = new Set(scopes);
  const separator = t('apikey.scopes.separator');

  const grants = SCOPE_GROUPS.flatMap((group) => {
    const actions = [
      scopeSet.has(group.read) && t('apikey.scopes.read'),
      group.write && scopeSet.has(group.write) && t('apikey.scopes.write'),
      group.key === 'model' && scopeSet.has('model:invoke') && t('apikey.scopes.invoke'),
    ].filter(Boolean) as string[];

    return actions.length > 0 ? [{ actions, key: group.key, label: t(group.label) }] : [];
  });

  // A restricted key always carries at least one scope, but never render an
  // empty bordered box if that invariant ever breaks.
  if (grants.length === 0) return <span>{t('apikey.scopes.none')}</span>;

  return (
    <div className="flex flex-col rounded-lg border border-border px-3 py-1">
      {grants.map((grant) => (
        <div
          className={`flex flex-row gap-[10px] items-center ${'border-b border-border py-3 last:border-b-0'}`}
          key={grant.key}
        >
          <Check className="shrink-0 text-emerald-600" size={16} />
          <span style={{ fontSize: 13 }}>
            <strong>{grant.label}</strong>
            {t('apikey.scopes.grantJoin')}
            {grant.actions.join(separator)}
          </span>
        </div>
      ))}
    </div>
  );
};

export interface ScopeSelectorProps {
  fullAccess: boolean;
  onFullAccessChange: (fullAccess: boolean) => void;
  onSelectedChange: (selected: ApiKeyScope[]) => void;
  selected: ApiKeyScope[];
}

const ScopeSelector: FC<ScopeSelectorProps> = ({
  fullAccess,
  onFullAccessChange,
  onSelectedChange,
  selected,
}) => {
  const { t } = useTranslation('auth');
  const selectedSet = new Set(selected);

  const toggle = (scope: ApiKeyScope, checked: boolean) => {
    const next = new Set(selectedSet);
    if (checked) {
      next.add(scope);
      // write implies read — keep the UI honest about what the key can do
      if (scope.endsWith(':write')) next.add(scope.replace(/:write$/, ':read') as ApiKeyScope);
    } else {
      next.delete(scope);
      // dropping read also drops the write that implied it
      if (scope.endsWith(':read')) next.delete(scope.replace(/:read$/, ':write') as ApiKeyScope);
    }

    onSelectedChange([...next]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{t('apikey.form.fields.scopes.fullAccess')}</span>
          <span className="text-xs text-muted-foreground">
            {t('apikey.form.fields.scopes.fullAccessDescription')}
          </span>
        </div>
        <Switch
          aria-label={t('apikey.form.fields.scopes.fullAccess')}
          checked={fullAccess}
          onCheckedChange={onFullAccessChange}
        />
      </div>
      <div className={fullAccess ? 'pointer-events-none opacity-45' : undefined}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border p-3">
          {SCOPE_GROUPS.map((group) => (
            <div className="flex flex-col gap-1" key={group.key}>
              <span className="text-xs text-muted-foreground">{t(group.label)}</span>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                  <Checkbox
                    checked={selectedSet.has(group.read)}
                    disabled={fullAccess}
                    onCheckedChange={(checked) => toggle(group.read, checked)}
                  />
                  {t('apikey.scopes.read')}
                </label>
                {group.write && (
                  <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                    <Checkbox
                      checked={selectedSet.has(group.write)}
                      disabled={fullAccess}
                      onCheckedChange={(checked) => group.write && toggle(group.write, checked)}
                    />
                    {t('apikey.scopes.write')}
                  </label>
                )}
                {group.key === 'model' && (
                  <label className="flex items-center gap-2 whitespace-nowrap text-sm">
                    <Checkbox
                      checked={selectedSet.has('model:invoke')}
                      disabled={fullAccess}
                      onCheckedChange={(checked) => toggle('model:invoke', checked)}
                    />
                    {t('apikey.scopes.modelInvoke')}
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ScopeSelector;
