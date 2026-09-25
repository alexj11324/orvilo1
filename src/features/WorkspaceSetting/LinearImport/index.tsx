'use client';

import { Button } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { ArrowLeft, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';

import { Frame } from '@/components/reui/frame';
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from '@/components/reui/stepper';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import LinearIcon from '@/features/Work/icons/LinearIcon';
import { waitForLinearOAuthPopup } from '@/features/WorkspaceSetting/Linear/oauthPopup';
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';

type Installation = { id: string; name?: string; status: string };
type LocalProject = { id: string; identifier: string; name: string };
type Team = { id: string; key: string; name: string };
type Category = 'backlog' | 'todo' | 'in_progress' | 'done' | 'canceled';
type LinearState = { id: string; name: string; type: string | null; suggestedCategory: Category };
type Preview = {
  counts: { exact: boolean; issues: number };
  states: LinearState[];
  team: Team;
};
type ImportJob = {
  id: string;
  status: 'queued' | 'running' | 'failed' | 'completed';
  issuesImported: number;
  issuesSkipped: number;
  issuesFailed: number;
  lastError?: string | null;
};

const categories: Category[] = ['backlog', 'todo', 'in_progress', 'done', 'canceled'];

const styles = createStaticStyles(({ css, cssVar }) => ({
  page: css`
    overflow: auto;

    width: 100%;
    height: 100%;
    padding-block: 32px 80px;
    padding-inline: 24px;

    background: ${cssVar.colorBgContainer};
  `,
  wrap: css`
    width: min(100%, 1313px);
    margin-block: 0;
    margin-inline: auto;
  `,
  heading: css`
    display: flex;
    gap: 12px;
    align-items: center;
    margin-block-end: 24px;
  `,
  backLink: css`
    display: inline-flex;
    gap: 6px;
    align-items: center;

    color: ${cssVar.colorTextSecondary};
    text-decoration: none;
  `,
  card: css`
    overflow: hidden;
    display: grid;
    grid-template-columns: 25% 75%;
    gap: 0;

    min-height: 529px;
    padding: 0;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    background: ${cssVar.colorBgContainer};

    @media (width <= 700px) {
      grid-template-columns: 48px minmax(0, 1fr);
      min-height: 460px;
    }
  `,
  rail: css`
    display: flex;
    flex-direction: column;
    gap: 24px;

    padding: 24px;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};

    @media (width <= 700px) {
      gap: 16px;
      padding-block: 16px;
      padding-inline: 10px;
    }
  `,
  railStep: css`
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;

    font-size: 13px;
    font-weight: 500;
    line-height: 19.5px;
  `,
  railTrigger: css`
    display: flex;
    gap: 12px;
    align-items: center;

    border-radius: 0;

    text-align: start;
  `,
  dot: css`
    display: grid;
    flex: none;
    place-items: center;

    width: 12px;
    height: 12px;
    border-radius: 50%;

    color: white;

    background: ${cssVar.colorFillSecondary};

    &[data-state='active'],
    &[data-state='completed'] {
      background: ${cssVar.colorPrimary};
    }
  `,
  line: css`
    width: 1px;
    height: 24px;
    margin-block: 4px;
    margin-inline-start: 5px;

    background: ${cssVar.colorBorderSecondary};

    &[data-state='completed'] {
      background: ${cssVar.colorPrimary};
    }
  `,
  railLabel: css`
    font-size: 13px;
    font-weight: 500;
    line-height: 19.5px;

    @media (width <= 700px) {
      display: none;
    }
  `,
  content: css`
    display: flex;
    flex-direction: column;
    min-width: 0;
  `,
  contentHeader: css`
    padding: 24px;
  `,
  title: css`
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    line-height: 24px;
  `,
  description: css`
    margin-block: 8px 0;
    margin-inline: 0;

    font-size: 14px;
    line-height: 21px;
    color: ${cssVar.colorTextSecondary};
  `,
  body: css`
    overflow: auto;
    flex: 1;
    padding-block: 0 24px;
    padding-inline: 24px;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(100%, 420px);
  `,
  label: css`
    font-size: 13px;
    font-weight: 500;
    line-height: 19.5px;
  `,
  mapping: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
    align-items: center;

    padding-block: 9px;
    padding-inline: 0;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 13px;

    @media (width <= 580px) {
      grid-template-columns: 1fr;
    }
  `,
  table: css`
    border-collapse: collapse;
    width: 100%;
    font-size: 13px;

    & th,
    & td {
      padding-block: 10px;
      padding-inline: 0;
      border-block-end: 1px solid ${cssVar.colorBorderSecondary};
      text-align: start;
    }

    & th {
      font-weight: 500;
      color: ${cssVar.colorTextSecondary};
    }
  `,
  error: css`
    margin-block: 12px;
    margin-inline: 0;
    font-size: 13px;
    color: ${cssVar.colorError};
  `,
  footer: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;

    min-height: 57px;
    padding-block: 16px;
    padding-inline: 24px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};

    & button {
      min-height: 24px;
      border-radius: 6px;
      font-size: 13px;
    }
  `,
}));

/** Searchable ReUI picker backed by stable IDs. */
function SearchPicker({
  ariaLabel,
  disabled,
  hasMore,
  id,
  loadingMore,
  options,
  placeholder,
  value,
  onChange,
  onLoadMore,
  onSearch,
}: {
  ariaLabel?: string;
  disabled?: boolean;
  hasMore?: boolean;
  id: string;
  loadingMore?: boolean;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onLoadMore?: () => void;
  onSearch?: (query: string) => void;
}) {
  const { t } = useTranslation('setting');
  return (
    <Combobox
      isItemEqualToValue={(a, b) => a.value === b.value}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      items={options}
      value={options.find((option) => option.value === value) ?? null}
      onInputValueChange={onSearch}
      onValueChange={(option) => onChange(option?.value ?? '')}
    >
      <ComboboxInput
        aria-label={ariaLabel ?? placeholder}
        className="w-full"
        disabled={disabled}
        id={id}
        placeholder={placeholder}
      />
      <ComboboxContent className="w-(--anchor-width) min-w-(--anchor-width)">
        <ComboboxEmpty>{placeholder}</ComboboxEmpty>
        <ComboboxList>
          {(option) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
        {hasMore && (
          <Button block disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore
              ? t('workspaceSetting.import.loading')
              : t('workspaceSetting.import.loadMore')}
          </Button>
        )}
      </ComboboxContent>
    </Combobox>
  );
}

export function LinearImportCatalog() {
  const { t } = useTranslation('setting');
  const { workspaceSlug = '' } = useParams();
  const { allowed, reason } = usePermission('manage_settings');
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <h1 className={styles.title}>{t('workspaceSetting.import.title')}</h1>
        <p className={styles.description}>{t('workspaceSetting.import.catalogDescription')}</p>
        {allowed ? (
          <div style={{ marginTop: 24 }}>
            <Link className={styles.backLink} to={`/${workspaceSlug}/settings/imports/linear`}>
              <LinearIcon size={18} /> {t('workspaceSetting.import.linear.title')}{' '}
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <p className={styles.error}>{reason || t('workspaceSetting.import.permissionDenied')}</p>
        )}
      </div>
    </main>
  );
}

function LinearImportWizardForWorkspace({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation('setting');
  const { allowed, reason } = usePermission('manage_settings');
  const [step, setStep] = useState(0);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<LocalProject | null>(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectNextOffset, setProjectNextOffset] = useState<number | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [moreProjectsLoading, setMoreProjectsLoading] = useState(false);
  const projectRequestRef = useRef(0);
  const refreshRequestRef = useRef(0);
  const jobRequestRef = useRef(0);
  const activeWorkspaceRef = useRef(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [installationId, setInstallationId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mappings, setMappings] = useState<Record<string, Category>>({});
  const [job, setJob] = useState<ImportJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const jobStorageKey = `orvilo-linear-import:${workspaceSlug}`;

  useEffect(() => {
    activeWorkspaceRef.current = true;
    return () => {
      activeWorkspaceRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async (preferredInstallationId?: string) => {
      if (!allowed) return;
      const request = ++refreshRequestRef.current;
      setLoading(true);
      setError('');
      try {
        const installationResponse = await lambdaClient.linearSync.installations.query();
        if (!activeWorkspaceRef.current || request !== refreshRequestRef.current) return;
        const nextInstallations = (installationResponse?.data ?? []) as Installation[];
        setInstallations(nextInstallations);
        const active =
          nextInstallations.find(
            (item) => item.id === preferredInstallationId && item.status === 'active',
          ) ?? nextInstallations.find((item) => item.status === 'active');
        setInstallationId(active?.id ?? '');
        if (active) {
          const catalogResponse = await lambdaClient.linearSync.catalog.query({
            installationId: active.id,
          });
          if (!activeWorkspaceRef.current || request !== refreshRequestRef.current) return;
          setTeams((catalogResponse?.data?.teams ?? []) as Team[]);
        } else {
          setTeams([]);
        }
      } catch (cause) {
        if (activeWorkspaceRef.current && request === refreshRequestRef.current)
          setError(
            cause instanceof Error ? cause.message : t('workspaceSetting.import.loadFailed'),
          );
      } finally {
        if (activeWorkspaceRef.current && request === refreshRequestRef.current) setLoading(false);
      }
    },
    [allowed, t],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!allowed) return;
    const request = ++projectRequestRef.current;
    let live = true;
    setProjectLoading(true);
    setMoreProjectsLoading(false);
    const timer = window.setTimeout(() => {
      void lambdaClient.linearImport.destinations
        .query({ search: projectSearch, offset: 0, limit: 50 })
        .then((response) => {
          if (!live || request !== projectRequestRef.current) return;
          setProjects((response?.data?.items ?? []) as LocalProject[]);
          setProjectNextOffset(response?.data?.nextOffset ?? null);
        })
        .catch((cause) => {
          if (live && request === projectRequestRef.current)
            setError(
              cause instanceof Error ? cause.message : t('workspaceSetting.import.loadFailed'),
            );
        })
        .finally(() => {
          if (live && request === projectRequestRef.current) setProjectLoading(false);
        });
    }, 200);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [allowed, projectSearch, t]);

  const loadMoreProjects = async () => {
    if (projectNextOffset === null || moreProjectsLoading) return;
    const request = projectRequestRef.current;
    setMoreProjectsLoading(true);
    try {
      const response = await lambdaClient.linearImport.destinations.query({
        search: projectSearch,
        offset: projectNextOffset,
        limit: 50,
      });
      if (!activeWorkspaceRef.current || request !== projectRequestRef.current) return;
      setProjects((current) => {
        const seen = new Set(current.map((project) => project.id));
        return [
          ...current,
          ...((response?.data?.items ?? []) as LocalProject[]).filter(
            (project) => !seen.has(project.id),
          ),
        ];
      });
      setProjectNextOffset(response?.data?.nextOffset ?? null);
    } catch (cause) {
      if (activeWorkspaceRef.current && request === projectRequestRef.current)
        setError(cause instanceof Error ? cause.message : t('workspaceSetting.import.loadFailed'));
    } finally {
      if (activeWorkspaceRef.current && request === projectRequestRef.current)
        setMoreProjectsLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed || !installationId || !teamId) {
      setPreview(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError('');
    void lambdaClient.linearImport.preview
      .query({ installationId, teamId })
      .then((response) => {
        if (!live) return;
        const next = response?.data as Preview | undefined;
        if (!next) throw new Error(t('workspaceSetting.import.loadFailed'));
        setPreview(next);
        setMappings(
          Object.fromEntries(next.states.map((state) => [state.id, state.suggestedCategory])),
        );
      })
      .catch((cause) => {
        if (live) {
          setPreview(null);
          setError(
            cause instanceof Error ? cause.message : t('workspaceSetting.import.loadFailed'),
          );
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [allowed, installationId, teamId, t]);

  const pollJob = useCallback(
    async (id: string) => {
      const request = ++jobRequestRef.current;
      try {
        const response = await lambdaClient.linearImport.status.query({ jobId: id });
        const next = response?.data as ImportJob | undefined;
        if (next && activeWorkspaceRef.current && request === jobRequestRef.current) setJob(next);
      } catch (cause) {
        if (activeWorkspaceRef.current && request === jobRequestRef.current)
          setError(
            cause instanceof Error ? cause.message : t('workspaceSetting.import.loadFailed'),
          );
      }
    },
    [t],
  );

  useEffect(() => {
    if (!allowed) return;
    const savedId = window.localStorage.getItem(jobStorageKey);
    if (savedId) void pollJob(savedId);
  }, [allowed, jobStorageKey, pollJob]);

  useEffect(() => {
    if (!job?.id || ['completed', 'failed'].includes(job.status)) return;
    const timer = window.setInterval(() => {
      void pollJob(job.id);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, pollJob]);

  const connect = async () => {
    const popup = window.open('about:blank', 'orvilo-linear-oauth', 'width=600,height=720');
    if (!popup) {
      setError(t('workspaceSetting.linear.popupBlocked'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await lambdaClient.linearSync.startOAuth.mutate({
        returnTo: window.location.pathname,
      });
      if (!response?.authorizationUrl) throw new Error(t('workspaceSetting.linear.connectFailed'));
      popup.location.href = response.authorizationUrl;
      const result = await waitForLinearOAuthPopup(
        popup,
        response.callbackOrigin ?? window.location.origin,
      );
      if (result.kind !== 'success')
        throw new Error(
          result.kind === 'error'
            ? result.error || t('workspaceSetting.linear.connectFailed')
            : t('workspaceSetting.linear.connectFailed'),
        );
      setTeamId('');
      setMappings({});
      await refresh(result.installationId);
    } catch (cause) {
      popup.close();
      setError(cause instanceof Error ? cause.message : t('workspaceSetting.linear.connectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!preview || !installationId || !teamId || !projectId) return;
    setBusy(true);
    setError('');
    try {
      const response = await lambdaClient.linearImport.start.mutate({
        installationId,
        projectId,
        stateMappings: preview.states.map((state) => ({
          linearStateId: state.id,
          workflowCategory: mappings[state.id],
        })),
        teamId,
      });
      const next = response?.data as ImportJob | undefined;
      if (!next?.id) throw new Error(t('workspaceSetting.import.startFailed'));
      window.localStorage.setItem(jobStorageKey, next.id);
      setJob(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('workspaceSetting.import.startFailed'));
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!job?.id) return;
    setBusy(true);
    setError('');
    try {
      await lambdaClient.linearImport.resume.mutate({ jobId: job.id });
      await pollJob(job.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('workspaceSetting.import.resumeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const newImport = () => {
    jobRequestRef.current++;
    window.localStorage.removeItem(jobStorageKey);
    setJob(null);
    setStep(0);
    setProjectId('');
    setSelectedProject(null);
    setProjectSearch('');
    setTeamId('');
    setPreview(null);
    setMappings({});
    setError('');
  };

  const titles = [
    t('workspaceSetting.import.step.target'),
    t('workspaceSetting.import.step.source'),
    t('workspaceSetting.import.step.mapping'),
    t('workspaceSetting.import.step.summary'),
  ];
  const descriptions = [
    t('workspaceSetting.import.targetDescription'),
    t('workspaceSetting.import.sourceDescription'),
    t('workspaceSetting.import.mappingDescription'),
    t('workspaceSetting.import.summaryDescription'),
  ];
  const mapped = Boolean(preview && preview.states.every((state) => mappings[state.id]));
  const canNext =
    step === 0
      ? Boolean(projectId)
      : step === 1
        ? Boolean(installationId && teamId && preview)
        : step === 2
          ? mapped
          : Boolean(preview && mapped && projectId && installationId && teamId);

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.heading}>
          <Link className={styles.backLink} to={`/${workspaceSlug}/settings/imports`}>
            <ArrowLeft size={16} /> {t('workspaceSetting.import.backToImports')}
          </Link>
          <span aria-hidden="true">/</span>
          <LinearIcon size={18} />
          <h1 className={styles.title}>{t('workspaceSetting.import.linear.title')}</h1>
        </div>
        {!allowed ? (
          <p className={styles.error}>{reason || t('workspaceSetting.import.permissionDenied')}</p>
        ) : (
          <Frame
            className={styles.card}
            style={{ display: 'grid', gap: 0, padding: 0, borderRadius: 8 }}
          >
            <aside aria-label={t('workspaceSetting.import.progress')} className={styles.rail}>
              <Stepper
                orientation="vertical"
                value={step + 1}
                onValueChange={(value) => {
                  if (value <= step + 1) setStep(value - 1);
                }}
              >
                <StepperNav>
                  {titles.map((title, index) => (
                    <StepperItem
                      className={styles.railStep}
                      disabled={index > step || Boolean(job)}
                      key={title}
                      step={index + 1}
                    >
                      <StepperTrigger className={styles.railTrigger}>
                        <StepperIndicator className={styles.dot}>
                          {index < step && <Check size={9} />}
                        </StepperIndicator>
                        <StepperTitle className={styles.railLabel}>{title}</StepperTitle>
                      </StepperTrigger>
                      {index < 3 && <StepperSeparator className={styles.line} />}
                    </StepperItem>
                  ))}
                </StepperNav>
              </Stepper>
            </aside>
            <section className={styles.content}>
              <header className={styles.contentHeader}>
                <h2 className={styles.title}>
                  {job ? t('workspaceSetting.import.resultTitle') : titles[step]}
                </h2>
                <p className={styles.description}>
                  {job ? t('workspaceSetting.import.resultDescription') : descriptions[step]}
                </p>
              </header>
              <div className={styles.body}>
                {loading && (
                  <p className={styles.description} role="status">
                    {t('workspaceSetting.import.loading')}
                  </p>
                )}
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
                {job ? (
                  <div role="status">
                    <p>
                      {t('workspaceSetting.import.status')}:{' '}
                      {t(`workspaceSetting.import.jobStatus.${job.status}`)}
                    </p>
                    <p>
                      {t('workspaceSetting.import.imported')}: {job.issuesImported} ·{' '}
                      {t('workspaceSetting.import.skipped')}: {job.issuesSkipped} ·{' '}
                      {t('workspaceSetting.import.failed')}: {job.issuesFailed}
                    </p>
                    {job.lastError && <p className={styles.error}>{job.lastError}</p>}
                    {job.status === 'failed' && (
                      <Button disabled={busy} icon={RefreshCw} onClick={resume}>
                        {t('workspaceSetting.import.resume')}
                      </Button>
                    )}
                    {job.status !== 'completed' && (
                      <Button disabled={busy} onClick={() => void pollJob(job.id)}>
                        {t('workspaceSetting.import.refresh')}
                      </Button>
                    )}
                  </div>
                ) : step === 0 ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="import-project">
                      {t('workspaceSetting.import.selectProject')}
                    </label>
                    <SearchPicker
                      disabled={projectLoading}
                      hasMore={projectNextOffset !== null}
                      id="import-project"
                      loadingMore={moreProjectsLoading}
                      placeholder={t('workspaceSetting.import.projectPlaceholder')}
                      value={projectId}
                      options={[
                        ...projects,
                        ...(selectedProject &&
                        !projects.some((project) => project.id === selectedProject.id)
                          ? [selectedProject]
                          : []),
                      ].map((project) => ({
                        label: `${project.name} (${project.identifier})`,
                        value: project.id,
                      }))}
                      onLoadMore={() => void loadMoreProjects()}
                      onChange={(value) => {
                        setProjectId(value);
                        setSelectedProject(
                          projects.find((project) => project.id === value) ??
                            (selectedProject?.id === value ? selectedProject : null),
                        );
                      }}
                      onSearch={(query) => {
                        setProjectSearch(query);
                        setProjectNextOffset(null);
                        setProjects([]);
                      }}
                    />
                  </div>
                ) : step === 1 ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="import-installation">
                      {t('workspaceSetting.import.selectConnection')}
                    </label>
                    <SearchPicker
                      disabled={loading}
                      id="import-installation"
                      placeholder={t('workspaceSetting.import.connectionPlaceholder')}
                      value={installationId}
                      options={installations
                        .filter((item) => item.status === 'active')
                        .map((item) => ({ label: item.name || item.id, value: item.id }))}
                      onChange={(value) => {
                        setInstallationId(value);
                        setTeamId('');
                        setMappings({});
                        setPreview(null);
                        if (value) void refresh(value);
                        else setTeams([]);
                      }}
                    />
                    <Button disabled={busy} onClick={connect}>
                      {installationId
                        ? t('workspaceSetting.linear.reconnect')
                        : t('workspaceSetting.linear.connect')}
                    </Button>
                    {installationId && (
                      <>
                        <label className={styles.label} htmlFor="import-team">
                          {t('workspaceSetting.import.selectTeam')}
                        </label>
                        <SearchPicker
                          disabled={loading}
                          id="import-team"
                          placeholder={t('workspaceSetting.import.teamPlaceholder')}
                          value={teamId}
                          options={teams.map((team) => ({
                            label: `${team.name} (${team.key})`,
                            value: team.id,
                          }))}
                          onChange={(value) => {
                            setTeamId(value);
                            setMappings({});
                            setPreview(null);
                          }}
                        />
                      </>
                    )}
                  </div>
                ) : step === 2 ? (
                  <div>
                    <div className={styles.mapping}>
                      <strong>{t('workspaceSetting.import.linearState')}</strong>
                      <strong>{t('workspaceSetting.import.orviloState')}</strong>
                    </div>
                    {preview?.states.map((state) => (
                      <div className={styles.mapping} key={state.id}>
                        <span>{state.name}</span>
                        <SearchPicker
                          ariaLabel={`${state.name} ${t('workspaceSetting.import.orviloState')}`}
                          id={`import-state-${state.id}`}
                          placeholder={t('workspaceSetting.import.orviloState')}
                          value={mappings[state.id] ?? ''}
                          options={categories.map((category) => ({
                            label: t(`workspaceSetting.import.category.${category}`),
                            value: category,
                          }))}
                          onChange={(value) =>
                            setMappings((current) => ({
                              ...current,
                              [state.id]: value as Category,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t('workspaceSetting.import.data')}</th>
                          <th>{t('workspaceSetting.import.migrating')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{t('workspaceSetting.import.issues')}</td>
                          <td>
                            {preview
                              ? `${preview.counts.issues}${preview.counts.exact ? '' : '+'}`
                              : '—'}
                          </td>
                        </tr>
                        <tr>
                          <td>{t('workspaceSetting.import.states')}</td>
                          <td>
                            {preview?.states.length ?? '—'}{' '}
                            {t('workspaceSetting.import.mappedOnly')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p className={styles.description}>{t('workspaceSetting.import.scopeNote')}</p>
                  </>
                )}
              </div>
              <footer className={styles.footer}>
                {job ? (
                  <span />
                ) : (
                  <Button
                    disabled={step === 0 || busy}
                    onClick={() => setStep((current) => current - 1)}
                  >
                    {t('workspaceSetting.import.back')}
                  </Button>
                )}
                {job && ['completed', 'failed'].includes(job.status) && (
                  <Button disabled={busy} type="primary" onClick={newImport}>
                    {t('workspaceSetting.import.newImport')}
                  </Button>
                )}
                {!job && (
                  <Button
                    disabled={!canNext || loading || busy}
                    type="primary"
                    onClick={() => {
                      if (step === 3) void start();
                      else setStep((current) => current + 1);
                    }}
                  >
                    {step === 3
                      ? t('workspaceSetting.import.confirm')
                      : t('workspaceSetting.import.next')}
                  </Button>
                )}
              </footer>
            </section>
          </Frame>
        )}
      </div>
    </main>
  );
}

export default function LinearImportWizard() {
  const { workspaceSlug = '' } = useParams();
  return <LinearImportWizardForWorkspace key={workspaceSlug} workspaceSlug={workspaceSlug} />;
}
