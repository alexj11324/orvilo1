'use client';
import { Github } from '@lobehub/icons';
import { type HeterogeneousProviderConfig, type OwnCredSummary } from '@orvilo/types';
import { clsx as cx } from 'cn';
import { CheckCircle2, KeyRound, X, XIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { Badge } from '@/components/reui/badge';
import { selectItems, SelectOptionItems } from '@/components/SelectOptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { credentialService } from '@/services/credential';
import { credentialQueries } from '@/services/reactQueryBindings';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

// Fixed cred key for Claude Code OAuth token — never changes
const CLAUDE_TOKEN_CRED_KEY = 'CLAUDE_CODE_OAUTH_TOKEN';

const styles = {
  manageLink: 'cursor-pointer text-xs leading-5 text-primary-text hover:underline',
};

const twStyles = {
  card: 'rounded-(--radius-card) border border-divider bg-card p-4',
  credOption: 'flex items-center gap-2',
  repoItem:
    'group/repo flex min-h-9 cursor-pointer items-center gap-2 rounded-(--radius-input) px-2 py-1.5 transition-[background-color] duration-(--orvilo-motion-fast) ease-[ease] motion-reduce:transition-none hover:bg-accent',
  repoItemActive: 'bg-selected',
  repoDeleteBtn:
    'ms-auto shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-foreground-tertiary opacity-0 transition-[opacity,color] duration-(--orvilo-motion-fast) ease-[ease] motion-reduce:transition-none hover:text-destructive-text focus-visible:opacity-100 group-hover/repo:opacity-100 group-focus-within/repo:opacity-100',
  repoList: 'flex flex-col gap-0.5',
  sectionDesc: 'text-xs leading-5 text-muted-foreground',
  sectionDivider: 'my-3 border-bs border-divider',
  sectionLabel: 'text-xs leading-5 tracking-[0.04em] text-foreground-tertiary uppercase',
};

interface CloudHeterogeneousConfigProps {
  onEnvChange: (env: Record<string, string>) => Promise<void> | void;
  provider: HeterogeneousProviderConfig;
}

// ── Claude Code Token section ──────────────────────────────────────────────
interface TokenSectionProps {
  existingCred: OwnCredSummary | undefined;
  onEnvChange: (patch: Record<string, string>) => void;
  onSaved: () => void;
}

const TokenSection = memo<TokenSectionProps>(({ existingCred, onSaved, onEnvChange }) => {
  const { t } = useTranslation('setting');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const [editing, setEditing] = useState(!existingCred);
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!canEdit) return;

    const token = tokenInput.trim();
    if (!token) return;
    setSaving(true);
    try {
      await credentialService.createKV({
        key: CLAUDE_TOKEN_CRED_KEY,
        name: 'Claude Code OAuth Token',
        type: 'kv-env',
        values: { [CLAUDE_TOKEN_CRED_KEY]: token },
      });
      onEnvChange({ CLAUDE_CODE_CRED_KEY: CLAUDE_TOKEN_CRED_KEY });
      setTokenInput('');
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <KeyRound size={16} />
          <span className={twStyles.sectionLabel}>{t('heterogeneousStatus.cloud.tokenLabel')}</span>
        </div>
        {existingCred && !editing && (
          <span
            {...clickableProps()}
            className={cx(styles.manageLink, CLICKABLE_FOCUS_RING)}
            onClick={() => {
              if (!canEdit) return;

              setEditing(true);
            }}
          >
            {t('heterogeneousStatus.cloud.tokenChange')}
          </span>
        )}
      </div>

      {existingCred && !editing ? (
        <div className="flex items-center gap-2">
          <Badge style={{ display: 'flex', alignItems: 'center', gap: 4 }} variant="success-light">
            <CheckCircle2 className="size-4" size={16} />
            {existingCred.maskedPreview ?? existingCred.name}
          </Badge>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            autoComplete="new-password"
            autoFocus={!!existingCred}
            disabled={!canEdit}
            placeholder={t('heterogeneousStatus.cloud.tokenPlaceholder')}
            style={{ flex: 1 }}
            type="password"
            value={tokenInput}
            visualSize="normal"
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <Button disabled={!canEdit} loading={saving} size="lg" onClick={handleSave}>
            {t('heterogeneousStatus.cloud.tokenSave')}
          </Button>
          {existingCred && (
            <Button
              size="lg"
              onClick={() => {
                setEditing(false);
                setTokenInput('');
              }}
            >
              {t('heterogeneousStatus.cloud.tokenCancel')}
            </Button>
          )}
        </div>
      )}

      <span className={twStyles.sectionDesc}>{t('heterogeneousStatus.cloud.tokenDesc')}</span>
    </div>
  );
});

// ── Repo list section ──────────────────────────────────────────────────────
// Profile page: manage the list of repos (add / delete only).
// Active repo selection happens in the bottom-left CloudRepoSwitcher.
interface RepoListSectionProps {
  onReposChange: (repos: string[]) => void;
  repos: string[];
}

const RepoListSection = memo<RepoListSectionProps>(({ repos, onReposChange }) => {
  const { t } = useTranslation(['setting', 'common']);
  const { allowed: canEdit } = usePermission('edit_own_content');
  const [input, setInput] = useState('');

  const addRepo = () => {
    if (!canEdit) return;

    const v = input.trim();
    if (!v || repos.includes(v)) return;
    onReposChange([...repos, v]);
    setInput('');
  };

  const removeRepo = (repo: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;

    onReposChange(repos.filter((r) => r !== repo));
  };

  return (
    <div className="flex flex-col gap-2">
      <span className={twStyles.sectionLabel}>{t('heterogeneousStatus.cloud.repoLabel')}</span>

      {repos.length > 0 && (
        <div className={twStyles.repoList}>
          {repos.map((repo) => (
            <div className={twStyles.repoItem} key={repo}>
              <Github size={16} style={{ flexShrink: 0 }} />
              <div className="truncate text-sm leading-5.5" style={{ flex: 1 }}>
                {repo}
              </div>
              <ActionIcon
                aria-label={t('delete', { ns: 'common' })}
                className={`${twStyles.repoDeleteBtn} repo-delete-btn`}
                disabled={!canEdit}
                icon={X}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                onClick={(e) => removeRepo(repo, e)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          disabled={!canEdit}
          placeholder={t('heterogeneousStatus.cloud.repoPlaceholder')}
          style={{ flex: 1 }}
          value={input}
          visualSize="normal"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addRepo();
          }}
        />
        <Button disabled={!canEdit} size="lg" onClick={addRepo}>
          {t('heterogeneousStatus.cloud.repoAdd')}
        </Button>
      </div>

      <span className={twStyles.sectionDesc}>{t('heterogeneousStatus.cloud.repoDesc')}</span>
    </div>
  );
});

// ── Main component ─────────────────────────────────────────────────────────
const CloudHeterogeneousConfig = memo<CloudHeterogeneousConfigProps>(
  ({ provider, onEnvChange }) => {
    const { t } = useTranslation('setting');
    const navigate = useWorkspaceAwareNavigate();
    const { allowed: canEdit } = usePermission('edit_own_content');

    const currentEnv = provider.env ?? {};
    const storedGithubCredKey = currentEnv.GITHUB_CRED_KEY ?? '';
    const repos: string[] = (() => {
      try {
        return JSON.parse(currentEnv.GITHUB_REPOS ?? '[]');
      } catch {
        return [];
      }
    })();

    const { data: credsData, isLoading, refetch } = credentialQueries.list.useQuery(undefined);
    const allCreds: OwnCredSummary[] = credsData?.data ?? [];

    const claudeTokenCred = allCreds.find((c) => c.key === CLAUDE_TOKEN_CRED_KEY);
    const githubCreds = allCreds.filter(
      (c) => c.type === 'oauth' && c.oauthProvider?.toLowerCase().includes('github'),
    );
    const githubCredOptions = githubCreds.map((cred) => ({
      label: (
        <span className={twStyles.credOption}>
          {cred.oauthAvatar ? <Avatar avatar={cred.oauthAvatar} size={16} /> : <Github size={16} />}
          <span>{cred.name}</span>
          {cred.oauthUsername && (
            <div className="text-xs leading-5 text-muted-foreground">@{cred.oauthUsername}</div>
          )}
        </span>
      ),
      title: [cred.name, cred.oauthUsername].filter(Boolean).join(' '),
      value: cred.key,
    }));

    const saveEnv = (patch: Record<string, string>) => {
      if (!canEdit) return;

      void onEnvChange({ ...currentEnv, ...patch });
    };

    const handleReposChange = (nextRepos: string[]) => {
      saveEnv({ GITHUB_REPOS: JSON.stringify(nextRepos) });
    };

    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center" style={{ paddingBlock: 32 }}>
          <Spinner className="size-4" />
        </div>
      );
    }

    return (
      <div className={twStyles.card}>
        <div className="flex flex-col gap-4">
          {/* ── Claude Code OAuth Token ── */}
          <TokenSection
            existingCred={claudeTokenCred}
            onEnvChange={saveEnv}
            onSaved={() => refetch()}
          />

          <div className={twStyles.sectionDivider} />

          {/* ── GitHub OAuth Credential ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Github size={16} />
                <span className={twStyles.sectionLabel}>
                  {t('heterogeneousStatus.cloud.githubLabel')}
                </span>
              </div>
              <span
                {...clickableProps()}
                className={cx(styles.manageLink, CLICKABLE_FOCUS_RING)}
                onClick={() => navigate('/settings/credential')}
              >
                {t('heterogeneousStatus.cloud.manageCredentials')}
              </span>
            </div>

            <Select
              disabled={!canEdit}
              items={selectItems(githubCredOptions)}
              value={storedGithubCredKey || null}
              onValueChange={(key) => saveEnv({ GITHUB_CRED_KEY: key ?? '' })}
            >
              <SelectTrigger className="w-full" size="normal">
                <SelectValue
                  placeholder={
                    githubCredOptions.length > 0
                      ? t('heterogeneousStatus.cloud.githubPlaceholder')
                      : t('heterogeneousStatus.cloud.githubNoCreds')
                  }
                />
                {canEdit && storedGithubCredKey ? (
                  <XIcon
                    className="size-4 opacity-60 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      saveEnv({ GITHUB_CRED_KEY: '' });
                    }}
                  />
                ) : null}
              </SelectTrigger>
              <SelectContent>
                <SelectOptionItems options={githubCredOptions} />
              </SelectContent>
            </Select>

            <span className={twStyles.sectionDesc}>
              {t('heterogeneousStatus.cloud.githubDesc')}
            </span>
          </div>

          <div className={twStyles.sectionDivider} />

          {/* ── Repository list ── */}
          <RepoListSection repos={repos} onReposChange={handleReposChange} />
        </div>
      </div>
    );
  },
);

export default CloudHeterogeneousConfig;
