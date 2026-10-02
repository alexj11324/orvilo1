'use client';

import type {
  LinearInstallationRecoveryState,
  LinearProjectBindingSettings,
  LinearSyncRecoveryRow,
  TaskPlanningProposal,
} from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import {
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  GitBranch,
  Info,
  Link2,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  getInstallationTone,
  getLinearRecoverySummary,
  getScopedProjects,
  getWizardStepStates,
  isLinearImportInProgress,
  type LinearBindingView,
  type LinearImportSummary,
  type LinearInstallationView,
  type LinearIssueLinkView,
  type LinearWizardStepId,
  summarizeIssueLinks,
} from '@/features/AgentTasks/shared/linearSyncViewModel';
import { newOAuthAttempt, waitForOAuthSession } from '@/features/Connectors/oauthSession';
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow-y: auto;
    height: 100%;
    padding: 24px;
  `,
  description: css`
    color: ${cssVar.colorTextSecondary};
  `,
  inner: css`
    width: min(100%, 960px);
    margin-block: 0;
    margin-inline: auto;
  `,
  steps: css`
    display: grid;
    grid-template-columns: repeat(7, minmax(100px, 1fr));
    gap: 8px;

    @media (width <= 820px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  `,
  stepButton: css`
    cursor: pointer;

    display: flex;
    flex-direction: column;
    gap: 8px;

    min-width: 0;
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextSecondary};
    text-align: start;

    background: ${cssVar.colorBgContainer};

    transition:
      border-color 0.2s,
      background 0.2s;

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    &:hover:not(:disabled) {
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  stepButtonActive: css`
    border-color: ${cssVar.colorPrimary};
    color: ${cssVar.colorText};
    background: ${cssVar.colorFillQuaternary};
  `,
  stepTop: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  `,
  stepNumber: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 24px;
    height: 24px;
    border-radius: 9999px;

    font-size: ${cssVar.fontSizeSM};
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
  stepNumberComplete: css`
    color: ${cssVar.colorSuccessText};
    background: ${cssVar.colorSuccessBg};
  `,
  stepLabel: css`
    overflow: hidden;

    font-size: ${cssVar.fontSizeSM};
    font-weight: 600;
    line-height: ${cssVar.lineHeightSM};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  stepState: css`
    font-size: ${cssVar.fontSizeSM};
    line-height: ${cssVar.lineHeightSM};
    color: ${cssVar.colorTextTertiary};
  `,
  card: css`
    border-color: ${cssVar.colorBorderSecondary};
  `,
  cardHeader: css`
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
  `,
  cardTitle: css`
    color: ${cssVar.colorText};
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (width <= 640px) {
      grid-template-columns: 1fr;
    }
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  `,
  fieldLabel: css`
    font-size: ${cssVar.fontSizeSM};
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
  `,
  row: css`
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
  `,
  muted: css`
    color: ${cssVar.colorTextTertiary};
  `,
  statusPanel: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorBgContainer};
  `,
  scopePanel: css`
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgElevated};
  `,
  statusGrid: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;

    @media (width <= 640px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  `,
  operationRow: css`
    display: grid;
    grid-template-columns: minmax(90px, auto) minmax(80px, auto) minmax(80px, auto) 1fr auto;
    gap: 10px;
    align-items: center;

    padding-block: 10px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }

    @media (width <= 680px) {
      grid-template-columns: 1fr auto;
    }
  `,
  operationError: css`
    overflow: hidden;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  conflictCard: css`
    display: flex;
    flex-direction: column;
    gap: 12px;

    padding: 12px;
    border: 1px solid ${cssVar.colorWarningBorder};
    border-radius: ${cssVar.borderRadius};

    background: ${cssVar.colorWarningBg};
  `,
  conflictField: css`
    display: grid;
    grid-template-columns: minmax(100px, 0.7fr) minmax(0, 1fr) minmax(0, 1fr) minmax(140px, 0.8fr);
    gap: 8px;
    align-items: center;

    @media (width <= 680px) {
      grid-template-columns: 1fr;
    }
  `,
  conflictValue: css`
    overflow: hidden;

    padding-block: 6px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadiusSM};

    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;

    background: ${cssVar.colorFillQuaternary};
  `,
  statusCell: css`
    display: flex;
    flex-direction: column;
    gap: 4px;

    padding: 10px;
    border-radius: ${cssVar.borderRadiusSM};

    background: ${cssVar.colorFillQuaternary};
  `,
  previewList: css`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;

    max-height: 240px;
  `,
  previewItem: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block: 6px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }
  `,
  mappingRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;

    padding-block: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }
  `,
  gate: css`
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorBgContainer};
  `,
}));

type Catalog = {
  members: Array<{ id: string; name: string }>;
  organizations: Array<{ id: string; name: string; url?: string | null }>;
  projects: Array<{ id: string; name: string; state?: string | null; teamIds: string[] }>;
  teams: Array<{ id: string; key: string; name: string }>;
  workflowStates: Record<
    string,
    Array<{
      id: string;
      name: string;
      position: number | null;
      teamId: string;
      type: string | null;
    }>
  >;
};

type LocalProject = { id: string; identifier: string; name: string };

/** Workspace sync scope row (linear-workspace-v3) as returned by `syncScope`. */
type LinearSyncScopeView = {
  id: string;
  importCompletedAt: string | Date | null;
  importPhase: string | null;
  importStartedAt: string | Date | null;
  installationId: string;
  issuesFailed: number;
  issuesImported: number;
  lastError: string | null;
  projectsLinked: number;
  settings: {
    approvedTeamIds?: string[];
    includeProjectlessIssues?: boolean;
    privateTeamPolicy?: 'import_restricted' | 'skip';
  } | null;
  status: string;
  teamsLinked: number;
};

type LinearTeamLinkView = {
  id: string;
  linearTeamId: string;
  linearTeamKey: string | null;
  syncState: string;
  teamId: string;
};

type PlanningRevision = {
  createdAt: string | Date;
  id: string;
  proposal: TaskPlanningProposal | null;
  status: string;
};
type PlanningScope = { id: string; scopeId: string; scopeType: string; status: string };
type ImportResult = {
  completed: boolean;
  failed: number;
  imported: number;
  nextCursor: string | null;
  pendingBinding: number;
  processed: number;
};
type Action =
  | 'autoExecution'
  | 'binding'
  | 'connect'
  | 'import'
  | 'issueLinks'
  | 'load'
  | 'proposal'
  | 'replanning'
  | 'read'
  | 'retry'
  | 'scopeImport'
  | 'sync'
  | 'write'
  | 'worker';

const STEP_ORDER: LinearWizardStepId[] = [
  'installation',
  'scope',
  'binding',
  'mapping',
  'import',
  'sync',
  'automation',
];

const STEP_COPY: Record<LinearWizardStepId, { description: string; title: string }> = {
  automation: {
    description: 'workspaceSetting.linear.wizard.automationDescription',
    title: 'workspaceSetting.linear.wizard.automationTitle',
  },
  binding: {
    description: 'workspaceSetting.linear.wizard.bindingDescription',
    title: 'workspaceSetting.linear.wizard.bindingTitle',
  },
  import: {
    description: 'workspaceSetting.linear.wizard.importDescription',
    title: 'workspaceSetting.linear.wizard.importTitle',
  },
  installation: {
    description: 'workspaceSetting.linear.wizard.installationDescription',
    title: 'workspaceSetting.linear.wizard.installationTitle',
  },
  mapping: {
    description: 'workspaceSetting.linear.wizard.mappingDescription',
    title: 'workspaceSetting.linear.wizard.mappingTitle',
  },
  scope: {
    description: 'workspaceSetting.linear.wizard.scopeDescription',
    title: 'workspaceSetting.linear.wizard.scopeTitle',
  },
  sync: {
    description: 'workspaceSetting.linear.wizard.syncDescription',
    title: 'workspaceSetting.linear.wizard.syncTitle',
  },
};

const STEP_ICONS = {
  automation: ShieldCheck,
  binding: GitBranch,
  import: Upload,
  installation: Link2,
  mapping: SlidersHorizontal,
  scope: ListChecks,
  sync: RefreshCw,
} satisfies Record<LinearWizardStepId, typeof Link2>;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const dateLabel = (value: Date | string | null | undefined, locale: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const InstallationStatusTag = memo<{ installation: LinearInstallationView }>(({ installation }) => {
  const { t } = useTranslation('setting');
  const tone = getInstallationTone(installation.status);
  return (
    <Badge
      variant={
        tone === 'danger'
          ? 'destructive-light'
          : tone === 'success'
            ? 'success-light'
            : tone === 'warning'
              ? 'warning-light'
              : 'secondary'
      }
    >
      {installation.status === 'active' ? (
        <CircleCheck aria-hidden size={16} />
      ) : (
        <CircleAlert aria-hidden size={16} />
      )}
      {t(`workspaceSetting.linear.status.${installation.status}` as never)}
    </Badge>
  );
});

InstallationStatusTag.displayName = 'InstallationStatusTag';

interface StepCardProps {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  title: string;
}

const StepCard = ({ action, children, description, title }: StepCardProps) => (
  <div className={'rounded-lg border border-border bg-background' + ' ' + styles.card}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
      <div className={styles.cardHeader}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 className={styles.cardTitle} style={{ fontWeight: 600, margin: 0 }}>
            {title}
          </h2>
          <span className={styles.description}>{description}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  </div>
);

const LinearWorkspaceSettings = memo(() => {
  const { t, i18n } = useTranslation('setting');
  const { allowed: canManage, reason } = usePermission('manage_settings');

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [installations, setInstallations] = useState<LinearInstallationView[]>([]);
  const [localProjects, setLocalProjects] = useState<LocalProject[]>([]);
  const [bindings, setBindings] = useState<LinearBindingView[]>([]);
  const [issueLinks, setIssueLinks] = useState<LinearIssueLinkView[]>([]);
  const [issueLinksError, setIssueLinksError] = useState<string | null>(null);
  const [planningScopes, setPlanningScopes] = useState<PlanningScope[]>([]);
  const [planningRevisions, setPlanningRevisions] = useState<PlanningRevision[]>([]);
  const [recoveryRows, setRecoveryRows] = useState<LinearSyncRecoveryRow[]>([]);
  const [installationRecovery, setInstallationRecovery] = useState<
    LinearInstallationRecoveryState[]
  >([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedLinearProjectId, setSelectedLinearProjectId] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [readEnabled, setReadEnabled] = useState(false);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [replanningEnabled, setReplanningEnabled] = useState(false);
  const [autoExecutionEnabled, setAutoExecutionEnabled] = useState(false);
  const [activeStep, setActiveStep] = useState<LinearWizardStepId>('installation');
  const [action, setAction] = useState<Action | null>(null);
  const [issueLinksLoading, setIssueLinksLoading] = useState(false);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);
  const [conflictChoices, setConflictChoices] = useState<
    Record<string, Record<string, 'linear' | 'local'>>
  >({});
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  // Workspace sync scope (linear-workspace-v3): the durable approved-team set
  // behind the resumable workspace import.
  const [syncScope, setSyncScope] = useState<LinearSyncScopeView | null>(null);
  const [teamLinks, setTeamLinks] = useState<LinearTeamLinkView[]>([]);
  const [scopeApprovedTeamIds, setScopeApprovedTeamIds] = useState<string[] | null>(null);
  const [scopeIncludeProjectless, setScopeIncludeProjectless] = useState(true);
  const [scopePrivateTeamPolicy, setScopePrivateTeamPolicy] = useState<
    'import_restricted' | 'skip'
  >('import_restricted');
  const isConnected = installations.some((installation) => installation.status === 'active');

  const selectedInstallation = installations.find((item) => item.id === selectedInstallationId);
  const selectedInstallationRecovery = installationRecovery.find(
    (item) => item.id === selectedInstallationId,
  );
  const selectedRemoteProject = catalog?.projects.find(
    (item) => item.id === selectedLinearProjectId,
  );
  const scopedRemoteProjects = useMemo(
    () => getScopedProjects(catalog?.projects ?? [], selectedTeamId),
    [catalog?.projects, selectedTeamId],
  );
  const selectedBinding = bindings.find(
    (item) =>
      item.projectId === selectedProjectId && item.installationId === selectedInstallationId,
  );
  const selectedPlanningScope = planningScopes.find(
    (scope) => scope.scopeType === 'project' && scope.scopeId === selectedProjectId,
  );
  const issueSummary: LinearImportSummary = useMemo(
    () => summarizeIssueLinks(issueLinks),
    [issueLinks],
  );
  const hasScope = Boolean(
    selectedInstallation?.status === 'active' &&
    selectedTeamId &&
    selectedRemoteProject?.teamIds.includes(selectedTeamId),
  );
  const hasBinding = Boolean(
    selectedBinding &&
    selectedBinding.linearProjectId === selectedLinearProjectId &&
    (selectedBinding.defaultTeamId ?? selectedBinding.teamIds[0]) === selectedTeamId,
  );
  const stepStates = getWizardStepStates({
    hasBinding,
    hasScope,
    installationIsActive: selectedInstallation?.status === 'active',
    isConnected,
    isSyncEnabled: hasBinding && syncEnabled,
  });
  const latestProposalRevision = planningRevisions.find(
    (revision) => revision.status === 'proposed' && revision.proposal,
  );

  const refresh = useCallback(async () => {
    const [
      installationResponse,
      projectResponse,
      bindingResponse,
      scopeResponse,
      operationsResponse,
      installationRecoveryResponse,
    ] = await Promise.all([
      lambdaClient.linearSync.installations.query(),
      lambdaClient.linearSync.projects.query(),
      lambdaClient.linearSync.bindings.query(),
      lambdaClient.linearSync.planningScopes.query(),
      canManage
        ? lambdaClient.linearSync.operations.query({ limit: 50 })
        : Promise.resolve({ data: [] }),
      canManage
        ? lambdaClient.linearSync.installationRecovery.query()
        : Promise.resolve({ data: [] }),
    ]);
    if (
      !installationResponse?.data ||
      !projectResponse?.data ||
      !bindingResponse?.data ||
      !scopeResponse?.data ||
      !operationsResponse?.data ||
      !installationRecoveryResponse?.data
    ) {
      throw new Error('Linear workspace settings returned an incomplete response');
    }

    setInstallations(installationResponse.data as LinearInstallationView[]);
    setLocalProjects(projectResponse.data);
    setBindings(bindingResponse.data as LinearBindingView[]);
    setPlanningScopes(scopeResponse.data);
    setRecoveryRows(operationsResponse.data as LinearSyncRecoveryRow[]);
    setInstallationRecovery(installationRecoveryResponse.data as LinearInstallationRecoveryState[]);

    const nextInstallation =
      installationResponse.data.find((item) => item.id === selectedInstallationId) ??
      installationResponse.data.find((item) => item.status === 'active') ??
      installationResponse.data[0];
    setSelectedInstallationId(nextInstallation?.id ?? '');
    const catalogInstallation =
      nextInstallation?.status === 'active'
        ? nextInstallation
        : installationResponse.data.find((item) => item.status === 'active');
    const catalogResponse = catalogInstallation
      ? await lambdaClient.linearSync.catalog
          .query({ installationId: catalogInstallation.id })
          .catch((error) => {
            if (nextInstallation?.status === 'active') throw error;
            console.error('[LinearWorkspaceSettings] Failed to load fallback catalog', error);
            return undefined;
          })
      : undefined;
    setCatalog(
      nextInstallation?.status === 'active' && catalogResponse?.data
        ? catalogResponse.data
        : {
            members: [],
            organizations: [],
            projects: [],
            teams: [],
            workflowStates: {},
          },
    );
    return installationResponse.data as LinearInstallationView[];
  }, [canManage, selectedInstallationId]);

  const loadCatalog = useCallback(async () => {
    setAction('load');
    try {
      await refresh();
      setCatalogError(null);
    } catch (error) {
      const message = errorMessage(error, t('workspaceSetting.linear.loadFailed'));
      setCatalogError(message);
      console.error('[LinearWorkspaceSettings] Failed to load catalog', error);
    } finally {
      setAction(null);
    }
  }, [refresh, t]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  /** Load the workspace sync scope + team links for the selected installation. */
  const loadScope = useCallback(async (): Promise<boolean> => {
    if (!selectedInstallationId) {
      setSyncScope(null);
      setTeamLinks([]);
      return true;
    }
    try {
      const [scopeResponse, teamLinkResponse] = await Promise.all([
        lambdaClient.linearSync.syncScope.query({ installationId: selectedInstallationId }),
        lambdaClient.linearSync.teamLinks.query(),
      ]);
      setSyncScope((scopeResponse?.data as LinearSyncScopeView | null) ?? null);
      setTeamLinks((teamLinkResponse?.data as LinearTeamLinkView[]) ?? []);
      return true;
    } catch (error) {
      console.error('[LinearWorkspaceSettings] Failed to load sync scope', error);
      return false;
    }
  }, [selectedInstallationId]);

  useEffect(() => {
    void loadScope();
  }, [loadScope]);

  // Hydrate the draft scope settings once the persisted scope arrives — a
  // missing `approvedTeamIds` means "every remote team is approved" (null).
  useEffect(() => {
    const settings = syncScope?.settings;
    setScopeApprovedTeamIds(settings?.approvedTeamIds ?? null);
    setScopeIncludeProjectless(settings?.includeProjectlessIssues !== false);
    setScopePrivateTeamPolicy(settings?.privateTeamPolicy ?? 'import_restricted');
    // Rehydrate only when a different scope loads — polling refresh must not
    // clobber in-progress draft edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncScope?.id]);

  // While an import runs, poll the durable scope row — the server keeps
  // stepping even if this page closes.
  useEffect(() => {
    if (syncScope?.status !== 'importing') return;
    let cancelled = false;
    let delay = 3_000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === 'hidden') {
          delay = Math.min(delay * 2, 30_000);
          schedule();
          return;
        }
        const succeeded = await loadScope();
        delay = succeeded ? 3_000 : Math.min(delay * 2, 30_000);
        schedule();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        delay = 3_000;
        void loadScope();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncScope?.status, loadScope]);

  const startWorkspaceImport = async () => {
    if (!selectedInstallationId) return;
    setAction('scopeImport');
    try {
      await lambdaClient.linearSync.upsertSyncScope.mutate({
        installationId: selectedInstallationId,
        settings: {
          ...(scopeApprovedTeamIds ? { approvedTeamIds: scopeApprovedTeamIds } : {}),
          includeProjectlessIssues: scopeIncludeProjectless,
          privateTeamPolicy: scopePrivateTeamPolicy,
        },
        startImport: true,
      });
      await loadScope();
    } catch (error) {
      console.error('[LinearWorkspaceSettings] Failed to start workspace import', error);
    } finally {
      setAction(null);
    }
  };

  useEffect(() => {
    const binding = bindings.find((item) => item.projectId === selectedProjectId);
    if (!binding) {
      setSyncEnabled(false);
      setReadEnabled(false);
      setWriteEnabled(false);
      setReplanningEnabled(false);
      setAutoExecutionEnabled(false);
      return;
    }
    setSelectedInstallationId(binding.installationId);
    setSelectedLinearProjectId(binding.linearProjectId);
    setSelectedTeamId(binding.defaultTeamId ?? binding.teamIds[0] ?? '');
    setSyncEnabled(binding.syncEnabled);
    setReadEnabled(binding.settings.readEnabled ?? binding.syncEnabled);
    setWriteEnabled(binding.settings.writeEnabled ?? binding.syncEnabled);
    setReplanningEnabled(binding.replanningEnabled);
    setAutoExecutionEnabled(binding.autoExecutionEnabled);
  }, [bindings, selectedProjectId]);

  const loadIssueLinks = useCallback(
    async (bindingId: string) => {
      setIssueLinksLoading(true);
      setIssueLinksError(null);
      try {
        const response = await lambdaClient.linearSync.issueLinks.query({ bindingId });
        if (!response?.data) throw new Error('Linear issue links response is empty');
        setIssueLinks(response.data as LinearIssueLinkView[]);
      } catch (error) {
        const message = errorMessage(error, t('workspaceSetting.linear.issueLinksLoadFailed'));
        setIssueLinksError(message);
        setIssueLinks([]);
      } finally {
        setIssueLinksLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!selectedBinding?.id) {
      setIssueLinks([]);
      setIssueLinksError(null);
      return;
    }
    void loadIssueLinks(selectedBinding.id);
  }, [loadIssueLinks, selectedBinding?.id]);

  useEffect(() => {
    if (!selectedPlanningScope) {
      setPlanningRevisions([]);
      return;
    }
    void lambdaClient.linearSync.planningRevisions
      .query({ limit: 10, scopeId: selectedPlanningScope.id })
      .then((response) => {
        if (!response?.data) throw new Error('Planning revisions response is empty');
        setPlanningRevisions(
          response.data.map((revision) => ({
            ...revision,
            proposal: revision.proposal as TaskPlanningProposal | null,
          })),
        );
      })
      .catch((error) => {
        console.error('[LinearWorkspaceSettings] Failed to load planning revisions', error);
        setPlanningRevisions([]);
      });
  }, [selectedPlanningScope]);

  const connect = async () => {
    if (!canManage) return;
    const popup = window.open('about:blank', 'orvilo-linear-oauth', 'width=600,height=720');
    if (!popup) {
      toast.error(t('workspaceSetting.linear.popupBlocked'));
      return;
    }
    setAction('connect');
    try {
      const attempt = newOAuthAttempt();
      const response = await lambdaClient.linearSync.startOAuth.mutate({
        attempt,
        returnTo: window.location.pathname,
      });
      if (!response?.authorizationUrl) throw new Error('Linear OAuth URL was not returned');
      popup.location.href = response.authorizationUrl;
      const result = await waitForOAuthSession({
        attempt,
        expectedOrigin: response.callbackOrigin ?? window.location.origin,
        messageType: 'orvilo-linear-oauth',
        popup,
      });
      if (result.status !== 'success' || !result.installationId) {
        throw new Error(result.error || t('workspaceSetting.linear.connectFailed'));
      }
      const refreshedInstallations = await refresh();
      if (
        !refreshedInstallations.some(
          (installation) =>
            installation.id === result.installationId && installation.status === 'active',
        )
      ) {
        throw new Error(t('workspaceSetting.linear.connectFailed'));
      }
      toast.success(t('workspaceSetting.linear.connected'));
      setActiveStep('installation');
    } catch (error) {
      popup.close();
      toast.error(errorMessage(error, t('workspaceSetting.linear.connectFailed')));
    } finally {
      setAction(null);
    }
  };

  const retryRecoveryRow = async (row: LinearSyncRecoveryRow) => {
    if (!canManage) return;
    setAction('retry');
    try {
      await lambdaClient.linearSync.retryOperation.mutate({
        expectedUpdatedAt: new Date(row.updatedAt).toISOString(),
        id: row.id,
        kind: row.kind,
      });
      await refresh();
      toast.success(t('workspaceSetting.linear.operations.retrySuccess'));
    } catch (error) {
      toast.error(errorMessage(error, t('workspaceSetting.linear.operations.retryFailed')));
    } finally {
      setAction(null);
    }
  };

  const resolveConflict = async (
    link: LinearIssueLinkView,
    strategy: 'keep_linear' | 'keep_local' | 'merge',
  ) => {
    if (!canManage || !link.conflict || link.conflict.localRevision === undefined) return;
    const fieldSources = conflictChoices[link.id] ?? {};
    if (strategy === 'merge' && link.conflict.fields.some((field) => !fieldSources[field])) return;

    setResolvingConflictId(link.id);
    try {
      await lambdaClient.linearSync.resolveConflict.mutate({
        expectedDetectedAt: link.conflict.detectedAt,
        expectedLocalRevision: link.conflict.localRevision,
        expectedRemoteUpdatedAt:
          link.conflict.remoteUpdatedAt ?? link.remoteSnapshot?.updatedAt ?? null,
        ...(strategy === 'merge' ? { fieldSources } : {}),
        issueLinkId: link.id,
        strategy,
      });
      setConflictChoices((current) => {
        const next = { ...current };
        delete next[link.id];
        return next;
      });
      if (selectedBinding) await loadIssueLinks(selectedBinding.id);
      toast.success(t('workspaceSetting.linear.conflicts.resolveSuccess'));
    } catch (error) {
      toast.error(errorMessage(error, t('workspaceSetting.linear.conflicts.resolveFailed')));
    } finally {
      setResolvingConflictId(null);
    }
  };

  const updateConflictChoice = (issueLinkId: string, field: string, source: 'linear' | 'local') => {
    setConflictChoices((current) => ({
      ...current,
      [issueLinkId]: { ...current[issueLinkId], [field]: source },
    }));
  };

  const persistBinding = async (input: {
    action: Action;
    autoExecutionEnabled?: boolean;
    replanningEnabled?: boolean;
    syncEnabled?: boolean;
  }): Promise<boolean> => {
    if (!canManage || !selectedInstallation || !selectedProjectId || !selectedRemoteProject) {
      return false;
    }
    const nextReplanningEnabled = input.replanningEnabled ?? replanningEnabled;
    const nextAutoExecutionEnabled = input.autoExecutionEnabled ?? autoExecutionEnabled;
    const nextSyncEnabled = input.syncEnabled ?? syncEnabled;
    setAction(input.action);
    try {
      const settings: LinearProjectBindingSettings = {
        ...selectedBinding?.settings,
        autoExecutionEnabled: nextAutoExecutionEnabled,
        readEnabled,
        replanningEnabled: nextReplanningEnabled,
        writeEnabled,
      };
      const response = await lambdaClient.linearSync.createProjectBinding.mutate({
        defaultTeamId: selectedTeamId || selectedRemoteProject.teamIds[0],
        installationId: selectedInstallation.id,
        linearProjectId: selectedRemoteProject.id,
        projectId: selectedProjectId,
        settings,
        syncEnabled: nextSyncEnabled,
        teamIds: selectedRemoteProject.teamIds,
      });
      if (!response?.data) throw new Error('Linear binding response is empty');
      const binding = response.data as LinearBindingView;
      setBindings((current) => [
        binding,
        ...current.filter((item) => item.id !== binding.id && item.projectId !== binding.projectId),
      ]);
      setSelectedInstallationId(binding.installationId);
      setSelectedLinearProjectId(binding.linearProjectId);
      setSelectedTeamId(binding.defaultTeamId ?? binding.teamIds[0] ?? '');
      setSyncEnabled(binding.syncEnabled);
      setReadEnabled(binding.settings.readEnabled ?? binding.syncEnabled);
      setWriteEnabled(binding.settings.writeEnabled ?? binding.syncEnabled);
      setReplanningEnabled(binding.replanningEnabled);
      setAutoExecutionEnabled(binding.autoExecutionEnabled);
      toast.success(t('workspaceSetting.linear.bindingSaved'));
      return true;
    } catch (error) {
      toast.error(errorMessage(error, t('workspaceSetting.linear.saveFailed')));
      return false;
    } finally {
      setAction(null);
    }
  };

  const persistRolloutControl = async (control: 'read' | 'write', enabled: boolean) => {
    if (!canManage || !selectedBinding) return;
    setAction(control);
    try {
      const response = await lambdaClient.linearSync.updateBindingControls.mutate({
        expectedVersion: selectedBinding.version,
        id: selectedBinding.id,
        ...(control === 'read' ? { readEnabled: enabled } : { writeEnabled: enabled }),
      });
      if (!response?.data) throw new Error('Linear rollout response is empty');
      const binding = response.data as LinearBindingView;
      setBindings((current) => current.map((item) => (item.id === binding.id ? binding : item)));
      if (control === 'read') setReadEnabled(enabled);
      else setWriteEnabled(enabled);
      toast.success(t('workspaceSetting.linear.rolloutSaved'));
    } catch (error) {
      toast.error(errorMessage(error, t('workspaceSetting.linear.saveFailed')));
    } finally {
      setAction(null);
    }
  };

  const saveBinding = async () => {
    if (!hasScope) return;
    const saved = await persistBinding({
      action: 'binding',
      syncEnabled: selectedBinding?.syncEnabled ?? false,
    });
    if (saved) setActiveStep('mapping');
  };

  const importProject = async () => {
    if (!canManage || !selectedBinding) return;
    setAction('import');
    try {
      const response = await lambdaClient.linearSync.importProject.mutate({
        bindingId: selectedBinding.id,
        limit: 50,
      });
      if (!response?.data) throw new Error('Linear import response is empty');
      setLastImport(response.data);
      await Promise.all([refresh(), loadIssueLinks(selectedBinding.id)]);
      toast.success(
        t(
          response.data.completed
            ? 'workspaceSetting.linear.importSuccess'
            : 'workspaceSetting.linear.importInProgress',
        ),
      );
    } catch (error) {
      toast.error(errorMessage(error, t('workspaceSetting.linear.importFailed')));
    } finally {
      setAction(null);
    }
  };

  const runWorker = async () => {
    if (!canManage || !selectedInstallation || !syncEnabled) return;
    setAction('worker');
    try {
      await lambdaClient.linearSync.processInbox.mutate({
        installationId: selectedInstallation.id,
        limit: 20,
      });
      await lambdaClient.linearSync.processOutbox.mutate({
        installationId: selectedInstallation.id,
        limit: 20,
      });
      await lambdaClient.linearSync.processPlanning.mutate({ limit: 10 });
      await Promise.all([
        refresh(),
        selectedBinding ? loadIssueLinks(selectedBinding.id) : Promise.resolve(),
      ]);
      toast.success(t('workspaceSetting.linear.workerSuccess'));
    } catch (error) {
      toast.error(errorMessage(error, t('workspaceSetting.linear.workerFailed')));
    } finally {
      setAction(null);
    }
  };

  const applyProposal = async () => {
    if (!canManage || !replanningEnabled || !latestProposalRevision?.proposal) return;
    setAction('proposal');
    try {
      const response = await lambdaClient.linearSync.applyPlanningProposal.mutate({
        approvalConfirmed: true,
        revisionId: latestProposalRevision.id,
      });
      if (!response?.data) throw new Error('Planning proposal response is empty');
      if (response.data.stale) {
        setPlanningRevisions((current) =>
          current.map((revision) =>
            revision.id === latestProposalRevision.id
              ? { ...revision, status: 'superseded' }
              : revision,
          ),
        );
        toast.error(t('workspaceSetting.linear.proposalStale'));
        return;
      }
      setPlanningRevisions((current) =>
        current.map((revision) =>
          revision.id === latestProposalRevision.id ? { ...revision, status: 'applied' } : revision,
        ),
      );
      toast.success(t('workspaceSetting.linear.proposalApplied'));
    } catch (error) {
      toast.error(errorMessage(error, t('workspaceSetting.linear.proposalFailed')));
    } finally {
      setAction(null);
    }
  };

  const mappingStateIds = useMemo(
    () =>
      [
        ...(selectedBinding?.settings.statusMappings ?? []).map((mapping) => mapping.linearStateId),
        ...issueLinks.map(
          (link) => link.remoteSnapshot?.stateId ?? link.lastConfirmedSnapshot.stateId,
        ),
      ].filter((id): id is string => Boolean(id)),
    [issueLinks, selectedBinding?.settings.statusMappings],
  );
  const mappingAssigneeIds = useMemo(
    () =>
      [
        ...(selectedBinding?.settings.assignmentMappings ?? []).map(
          (mapping) => mapping.linearUserId,
        ),
        ...issueLinks.map(
          (link) => link.remoteSnapshot?.assigneeId ?? link.lastConfirmedSnapshot.assigneeId,
        ),
      ].filter((id): id is string => Boolean(id)),
    [issueLinks, selectedBinding?.settings.assignmentMappings],
  );
  const catalogWorkflowStatesById = useMemo(
    () =>
      new Map(
        Object.values(catalog?.workflowStates ?? {})
          .flat()
          .map((state) => [state.id, state]),
      ),
    [catalog?.workflowStates],
  );
  const catalogMembersById = useMemo(
    () => new Map((catalog?.members ?? []).map((member) => [member.id, member])),
    [catalog?.members],
  );

  const renderOperations = () => {
    const recoverySummary = getLinearRecoverySummary(recoveryRows);
    const conflicts = issueLinks.filter((link) => link.syncState === 'conflict' && link.conflict);
    const valueLabel = (value: unknown) => {
      if (value === undefined) return t('workspaceSetting.linear.conflicts.missing');
      if (value === null) return t('workspaceSetting.linear.conflicts.empty');
      const serialized =
        typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
      return serialized.length > 120 ? `${serialized.slice(0, 117)}…` : serialized;
    };
    return (
      <StepCard
        description={t('workspaceSetting.linear.operations.description')}
        title={t('workspaceSetting.linear.operations.title')}
        action={
          selectedInstallationRecovery?.reauthRequired ? (
            <Button
              aria-busy={action === 'connect'}
              disabled={!canManage || action === 'connect'}
              variant="outline"
              onClick={connect}
            >
              {action === 'connect' && <Loader2 aria-hidden className="size-4 animate-spin" />}
              <Link2 aria-hidden size={16} />
              {t('workspaceSetting.linear.operations.reconnect')}
            </Button>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className={styles.statusGrid}>
            <div className={styles.statusCell}>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {t('workspaceSetting.linear.operations.status')}
              </span>
              <span>
                {selectedInstallationRecovery
                  ? t(
                      `workspaceSetting.linear.status.${selectedInstallationRecovery.status}` as never,
                    )
                  : '—'}
              </span>
            </div>
            <div className={styles.statusCell}>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {t('workspaceSetting.linear.operations.failed')}
              </span>
              <span>{recoverySummary.failed}</span>
            </div>
            <div className={styles.statusCell}>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {t('workspaceSetting.linear.operations.deadLetter')}
              </span>
              <span>{recoverySummary.deadLetter}</span>
            </div>
            <div className={styles.statusCell}>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {t('workspaceSetting.linear.operations.outcomeUnknown')}
              </span>
              <span>{recoverySummary.outcomeUnknown}</span>
            </div>
          </div>
          {selectedInstallationRecovery?.lastError && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden className="size-4" />
              <AlertTitle>{t('workspaceSetting.linear.operations.lastSafeError')}</AlertTitle>
              <AlertDescription>{selectedInstallationRecovery.lastError}</AlertDescription>
            </Alert>
          )}
          {recoveryRows.length === 0 ? (
            <span className={styles.muted}>{t('workspaceSetting.linear.operations.empty')}</span>
          ) : (
            <div>
              {recoveryRows.map((row) => (
                <div className={styles.operationRow} key={`${row.kind}-${row.id}`}>
                  <Badge size="sm" variant="secondary">
                    {t(`workspaceSetting.linear.operations.kind.${row.kind}` as never)}
                  </Badge>
                  <span style={{ color: 'var(--muted-foreground)' }}>{row.status}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    {t('workspaceSetting.linear.operations.attempts', { count: row.attempts })}
                  </span>
                  <span className={styles.operationError} title={row.lastError ?? undefined}>
                    {row.lastError ?? t('workspaceSetting.linear.operations.noError')}
                  </span>
                  <div
                    style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <span className={styles.muted} style={{ fontSize: 12 }}>
                      {t('workspaceSetting.linear.operations.age', {
                        time: dateLabel(row.createdAt, i18n.language),
                      })}
                    </span>
                    <Button
                      aria-busy={action === 'retry'}
                      disabled={!canManage || action === 'retry'}
                      size="sm"
                      variant="outline"
                      onClick={() => void retryRecoveryRow(row)}
                    >
                      {action === 'retry' && (
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                      )}
                      {t('workspaceSetting.linear.operations.retry')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{t('workspaceSetting.linear.conflicts.title')}</span>
            <span style={{ color: 'var(--muted-foreground)' }}>
              {t('workspaceSetting.linear.conflicts.description')}
            </span>
          </div>
          {conflicts.length === 0 ? (
            <span className={styles.muted}>
              {t('workspaceSetting.linear.conflicts.emptyState')}
            </span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {conflicts.map((link) => {
                const conflict = link.conflict!;
                const selections = conflictChoices[link.id] ?? {};
                const mergeReady =
                  conflict.localRevision !== undefined &&
                  conflict.fields.every((field) => Boolean(selections[field]));
                return (
                  <div className={styles.conflictCard} key={link.id}>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
                      >
                        <span style={{ fontWeight: 600 }}>{link.linearIdentifier}</span>
                        <span className={styles.muted} style={{ fontSize: 12 }}>
                          {t('workspaceSetting.linear.conflicts.detectedAt', {
                            time: dateLabel(conflict.detectedAt, i18n.language),
                          })}
                        </span>
                      </div>
                      <Badge size="sm" variant="secondary">
                        {t('workspaceSetting.linear.import.conflict')}
                      </Badge>
                    </div>
                    {conflict.fields.map((field) => (
                      <div className={styles.conflictField} key={field}>
                        <span style={{ fontWeight: 500 }}>{field}</span>
                        <span
                          className={styles.conflictValue}
                          title={valueLabel(conflict.local[field])}
                        >
                          {t('workspaceSetting.linear.conflicts.localValue', {
                            value: valueLabel(conflict.local[field]),
                          })}
                        </span>
                        <span
                          className={styles.conflictValue}
                          title={valueLabel(conflict.remote[field])}
                        >
                          {t('workspaceSetting.linear.conflicts.linearValue', {
                            value: valueLabel(conflict.remote[field]),
                          })}
                        </span>
                        <Select
                          disabled={false}
                          value={selections[field] ?? null}
                          items={[
                            {
                              label: t('workspaceSetting.linear.conflicts.chooseLocal'),
                              value: 'local',
                            },
                            {
                              label: t('workspaceSetting.linear.conflicts.chooseLinear'),
                              value: 'linear',
                            },
                          ]}
                          onValueChange={(value) => {
                            if (value === null) return;
                            updateConflictChoice(link.id, field, value as 'linear' | 'local');
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={t('workspaceSetting.linear.conflicts.chooseField')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              {
                                label: t('workspaceSetting.linear.conflicts.chooseLocal'),
                                value: 'local',
                              },
                              {
                                label: t('workspaceSetting.linear.conflicts.chooseLinear'),
                                value: 'linear',
                              },
                            ].map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    {conflict.localRevision === undefined ? (
                      <Alert variant="warning">
                        <TriangleAlert aria-hidden className="size-4" />
                        <AlertDescription>
                          {t('workspaceSetting.linear.conflicts.refreshRequired')}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'row',
                          justifyContent: 'flex-end',
                          flexWrap: 'wrap',
                          gap: 8,
                        }}
                      >
                        <Button
                          aria-busy={resolvingConflictId === link.id}
                          disabled={!canManage || resolvingConflictId === link.id}
                          size="sm"
                          variant="outline"
                          onClick={() => void resolveConflict(link, 'keep_local')}
                        >
                          {resolvingConflictId === link.id && (
                            <Loader2 aria-hidden className="size-4 animate-spin" />
                          )}
                          {t('workspaceSetting.linear.conflicts.keepLocal')}
                        </Button>
                        <Button
                          aria-busy={resolvingConflictId === link.id}
                          disabled={!canManage || resolvingConflictId === link.id}
                          size="sm"
                          variant="outline"
                          onClick={() => void resolveConflict(link, 'keep_linear')}
                        >
                          {resolvingConflictId === link.id && (
                            <Loader2 aria-hidden className="size-4 animate-spin" />
                          )}
                          {t('workspaceSetting.linear.conflicts.keepLinear')}
                        </Button>
                        <Button
                          aria-busy={resolvingConflictId === link.id}
                          disabled={!canManage || !mergeReady || resolvingConflictId === link.id}
                          size="sm"
                          variant="default"
                          onClick={() => void resolveConflict(link, 'merge')}
                        >
                          {resolvingConflictId === link.id && (
                            <Loader2 aria-hidden className="size-4 animate-spin" />
                          )}
                          {t('workspaceSetting.linear.conflicts.merge')}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </StepCard>
    );
  };

  const renderInstallation = () => (
    <StepCard
      description={t(STEP_COPY.installation.description as never)}
      title={t(STEP_COPY.installation.title as never)}
      action={
        <Button
          aria-busy={action === 'connect'}
          disabled={!canManage || action === 'connect'}
          title={!canManage ? reason : undefined}
          variant="outline"
          onClick={connect}
        >
          {action === 'connect' && <Loader2 aria-hidden className="size-4 animate-spin" />}
          <Link2 aria-hidden size={16} />
          {isConnected
            ? t('workspaceSetting.linear.reconnect')
            : t('workspaceSetting.linear.connect')}
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className={styles.description}>
          {isConnected
            ? t('workspaceSetting.linear.connectedAccount')
            : t('workspaceSetting.linear.connectionDescription')}
        </span>
        {!isConnected ? (
          <Alert variant="info">
            <Info aria-hidden className="size-4" />
            <AlertDescription>
              {t('workspaceSetting.linear.wizard.installationRequired')}
            </AlertDescription>
          </Alert>
        ) : catalogError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden className="size-4" />
            <AlertTitle>{t('workspaceSetting.linear.loadFailed')}</AlertTitle>
            <AlertDescription>{catalogError}</AlertDescription>
            <AlertAction>
              {
                <Button
                  aria-busy={action === 'load'}
                  disabled={action === 'load'}
                  variant="outline"
                  onClick={() => void loadCatalog()}
                >
                  {action === 'load' && <Loader2 aria-hidden className="size-4 animate-spin" />}
                  {t('workspaceSetting.linear.retryLoad')}
                </Button>
              }
            </AlertAction>
          </Alert>
        ) : (
          <>
            <div className={styles.row}>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {t('workspaceSetting.linear.installationIdentity')}
              </span>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {selectedInstallation?.organizationName || selectedInstallation?.organizationId}
              </span>
            </div>
            {selectedInstallation && (
              <div className={styles.statusPanel}>
                <InstallationStatusTag installation={selectedInstallation} />
                <span style={{ color: 'var(--muted-foreground)' }}>
                  {selectedInstallation.organizationName || selectedInstallation.organizationId}
                </span>
                {selectedInstallation.lastSyncAt && (
                  <span className={styles.muted} style={{ fontSize: 12 }}>
                    {t('workspaceSetting.linear.lastSync', {
                      time: dateLabel(selectedInstallation.lastSyncAt, i18n.language),
                    })}
                  </span>
                )}
                {selectedInstallationRecovery?.lastError && (
                  <span style={{ color: 'var(--destructive)', flexBasis: '100%' }}>
                    {selectedInstallationRecovery.lastError}
                  </span>
                )}
                {selectedInstallation.status !== 'active' && (
                  <Alert
                    variant={selectedInstallation.status === 'paused' ? 'warning' : 'destructive'}
                  >
                    {selectedInstallation.status === 'paused' ? (
                      <TriangleAlert aria-hidden className="size-4" />
                    ) : (
                      <CircleAlert aria-hidden className="size-4" />
                    )}
                    <AlertDescription>
                      {t(
                        `workspaceSetting.linear.installationAction.${selectedInstallation.status}` as never,
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </StepCard>
  );

  /**
   * Workspace-scope import panel (linear-workspace-v3): pick the approved
   * remote teams, start the resumable import, and watch durable progress.
   * The server keeps stepping after this page closes — this card only
   * reports the persisted scope row.
   */
  const renderWorkspaceScope = () => {
    const importing = syncScope?.status === 'importing';
    const remoteTeams = catalog?.teams ?? [];
    const approved = (teamId: string) =>
      scopeApprovedTeamIds === null || scopeApprovedTeamIds.includes(teamId);
    const toggleTeam = (teamId: string, checked: boolean) => {
      setScopeApprovedTeamIds((current) => {
        const base = current ?? remoteTeams.map((team) => team.id);
        const next = checked ? [...new Set([...base, teamId])] : base.filter((id) => id !== teamId);
        return next.length === remoteTeams.length ? null : next;
      });
    };
    const linkedTeamIds = new Set(teamLinks.map((link) => link.linearTeamId));
    return (
      <div
        className={styles.scopePanel}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {t('workspaceSetting.linear.workspaceScopeTitle')}
          </span>
          <Button
            aria-busy={action === 'scopeImport' || importing}
            variant="default"
            disabled={
              !canManage || remoteTeams.length === 0 || action === 'scopeImport' || importing
            }
            onClick={() => void startWorkspaceImport()}
          >
            {action === 'scopeImport' ||
              (importing && <Loader2 aria-hidden className="size-4 animate-spin" />)}
            <Upload aria-hidden size={16} />
            {importing
              ? t('workspaceSetting.linear.workspaceImporting')
              : syncScope?.importCompletedAt
                ? t('workspaceSetting.linear.workspaceReimport')
                : t('workspaceSetting.linear.workspaceImportStart')}
          </Button>
        </div>
        <span className={styles.description} style={{ fontSize: 12 }}>
          {t('workspaceSetting.linear.workspaceScopeDescription')}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {remoteTeams.map((team) => (
            <div
              key={team.id}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <input
                checked={approved(team.id)}
                disabled={!canManage || importing}
                type={'checkbox'}
                onChange={(event) => toggleTeam(team.id, event.target.checked)}
              />
              <span>
                {team.name} ({team.key})
              </span>
              {linkedTeamIds.has(team.id) && (
                <Badge variant="secondary">
                  {t('workspaceSetting.linear.workspaceScopeLinked')}
                </Badge>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              checked={scopeIncludeProjectless}
              disabled={!canManage || importing}
              type={'checkbox'}
              onChange={(event) => setScopeIncludeProjectless(event.target.checked)}
            />
            <span style={{ color: 'var(--muted-foreground)' }}>
              {t('workspaceSetting.linear.includeProjectlessIssues')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted-foreground)' }}>
              {t('workspaceSetting.linear.privateTeamPolicy')}
            </span>
            <Select
              disabled={!canManage || importing}
              value={scopePrivateTeamPolicy ?? null}
              items={[
                {
                  label: t('workspaceSetting.linear.privateTeamImportRestricted'),
                  value: 'import_restricted',
                },
                { label: t('workspaceSetting.linear.privateTeamSkip'), value: 'skip' },
              ]}
              onValueChange={(value) => {
                if (value === null) return;
                setScopePrivateTeamPolicy(value as 'import_restricted' | 'skip');
              }}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder={undefined} />
              </SelectTrigger>
              <SelectContent>
                {[
                  {
                    label: t('workspaceSetting.linear.privateTeamImportRestricted'),
                    value: 'import_restricted',
                  },
                  { label: t('workspaceSetting.linear.privateTeamSkip'), value: 'skip' },
                ].map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {syncScope && (
          <div className={styles.statusPanel}>
            <Badge variant="secondary">
              {
                <span className="inline-flex">
                  {createElement(
                    syncScope.status === 'importing'
                      ? RefreshCw
                      : syncScope.status === 'failed'
                        ? CircleAlert
                        : CircleCheck,
                    {
                      size: 16,
                      className: syncScope.status === 'importing' ? 'animate-spin' : undefined,
                    },
                  )}
                </span>
              }
              <span
                style={{
                  color: syncScope.status === 'failed' ? 'var(--destructive)' : undefined,
                }}
              >
                {t(`workspaceSetting.linear.scopeStatus.${syncScope.status}` as never)}
              </span>
            </Badge>
            {syncScope.importPhase && (
              <span style={{ color: 'var(--muted-foreground)' }}>
                {t('workspaceSetting.linear.scopePhase', {
                  phase: t(
                    `workspaceSetting.linear.scopePhaseName.${syncScope.importPhase}` as never,
                  ),
                })}
              </span>
            )}
            <span className={styles.muted} style={{ fontSize: 12 }}>
              {t('workspaceSetting.linear.scopeCounters', {
                issues: syncScope.issuesImported,
                issuesFailed: syncScope.issuesFailed,
                projects: syncScope.projectsLinked,
                teams: syncScope.teamsLinked,
              })}
            </span>
            {syncScope.lastError && (
              <span style={{ color: 'var(--destructive)' }}>{syncScope.lastError}</span>
            )}
            {syncScope.importCompletedAt && (
              <span className={styles.muted} style={{ fontSize: 12 }}>
                {t('workspaceSetting.linear.scopeCompletedAt', {
                  time: dateLabel(syncScope.importCompletedAt, i18n.language),
                })}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderScope = () => (
    <StepCard
      description={t(STEP_COPY.scope.description as never)}
      title={t(STEP_COPY.scope.title as never)}
      action={
        <Button disabled={!hasScope} variant="outline" onClick={() => setActiveStep('binding')}>
          <ChevronRight aria-hidden size={16} />
          {t('workspaceSetting.linear.continue')}
        </Button>
      }
    >
      {!selectedInstallation || selectedInstallation.status !== 'active' ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>
            {t('workspaceSetting.linear.wizard.completeInstallation')}
          </AlertDescription>
        </Alert>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span style={{ color: 'var(--muted-foreground)' }}>
            {t('workspaceSetting.linear.organizationScopedTo', {
              organization:
                selectedInstallation.organizationName || selectedInstallation.organizationId,
            })}
          </span>
          {renderWorkspaceScope()}
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('workspaceSetting.linear.teamTitle')}</span>
              <Select
                disabled={!canManage}
                value={(selectedTeamId || undefined) ?? null}
                items={(catalog?.teams ?? []).map((team) => ({
                  label: `${team.name} (${team.key})`,
                  value: team.id,
                }))}
                onValueChange={(value) => {
                  if (value === null) return;
                  setSelectedTeamId(value);
                  if (
                    selectedLinearProjectId &&
                    !catalog?.projects
                      .find((project) => project.id === selectedLinearProjectId)
                      ?.teamIds.includes(value)
                  ) {
                    setSelectedLinearProjectId('');
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('workspaceSetting.linear.teamPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(catalog?.teams ?? [])
                    .map((team) => ({
                      label: `${team.name} (${team.key})`,
                      value: team.id,
                    }))
                    .map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                {t('workspaceSetting.linear.remoteProjectTitle')}
              </span>
              <Select
                disabled={!canManage || !selectedTeamId}
                value={(selectedLinearProjectId || undefined) ?? null}
                items={scopedRemoteProjects.map((project) => ({
                  label: project.name,
                  value: project.id,
                }))}
                onValueChange={(value) => {
                  if (value === null) return;
                  setSelectedLinearProjectId(value);
                  const project = catalog?.projects.find((item) => item.id === value);
                  if (project && !project.teamIds.includes(selectedTeamId)) {
                    setSelectedTeamId(project.teamIds[0] ?? '');
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={t('workspaceSetting.linear.remoteProjectPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {scopedRemoteProjects
                    .map((project) => ({
                      label: project.name,
                      value: project.id,
                    }))
                    .map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!catalog?.teams.length || !scopedRemoteProjects.length ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden className="size-4" />
              <AlertDescription>{t('workspaceSetting.linear.scopeCatalogEmpty')}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      )}
    </StepCard>
  );

  const renderBinding = () => (
    <StepCard
      description={t(STEP_COPY.binding.description as never)}
      title={t(STEP_COPY.binding.title as never)}
      action={
        <Button
          aria-busy={action === 'binding'}
          variant="outline"
          disabled={
            !canManage ||
            !hasScope ||
            !selectedProjectId ||
            !selectedRemoteProject ||
            action === 'binding'
          }
          onClick={() => void saveBinding()}
        >
          {action === 'binding' && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {t('workspaceSetting.linear.saveBinding')}
        </Button>
      }
    >
      {!hasScope ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>{t('workspaceSetting.linear.wizard.completeScope')}</AlertDescription>
        </Alert>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              {t('workspaceSetting.linear.localProjectTitle')}
            </span>
            <Select
              disabled={!canManage}
              value={(selectedProjectId || undefined) ?? null}
              items={localProjects.map((project) => ({
                label: `${project.name} (${project.identifier})`,
                value: project.id,
              }))}
              onValueChange={(value) => {
                if (value === null) return;
                setSelectedProjectId(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('workspaceSetting.linear.localProjectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {localProjects
                  .map((project) => ({
                    label: `${project.name} (${project.identifier})`,
                    value: project.id,
                  }))
                  .map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className={styles.statusPanel}>
            <GitBranch size={16} />
            <span>
              {catalog?.projects.find((project) => project.id === selectedLinearProjectId)?.name}
            </span>
            <span style={{ color: 'var(--muted-foreground)' }}>·</span>
            <span style={{ color: 'var(--muted-foreground)' }}>
              {catalog?.teams.find((team) => team.id === selectedTeamId)?.name}
            </span>
            {hasBinding && (
              <Badge size="sm" variant="secondary">
                {<Check size={12} />}
                {t('workspaceSetting.linear.bindingSaved')}
              </Badge>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className={styles.gate}>
              <div className={styles.row}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>
                    {t('workspaceSetting.linear.inboundReadTitle')}
                  </span>
                  <span className={styles.description} style={{ fontSize: 12 }}>
                    {t('workspaceSetting.linear.inboundReadDescription')}
                  </span>
                </div>
                <Switch
                  checked={readEnabled}
                  disabled={!canManage}
                  onCheckedChange={(value) => void persistRolloutControl('read', value)}
                />
              </div>
            </div>
            <div className={styles.gate}>
              <div className={styles.row}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>
                    {t('workspaceSetting.linear.outboundWriteTitle')}
                  </span>
                  <span className={styles.description} style={{ fontSize: 12 }}>
                    {t('workspaceSetting.linear.outboundWriteDescription')}
                  </span>
                </div>
                <Switch
                  checked={writeEnabled}
                  disabled={!canManage}
                  onCheckedChange={(value) => void persistRolloutControl('write', value)}
                />
              </div>
            </div>
          </div>
          <span className={styles.muted} style={{ fontSize: 12 }}>
            {t('workspaceSetting.linear.rolloutCompatibilityNote')}
          </span>
          <span className={styles.muted} style={{ fontSize: 12 }}>
            {t('workspaceSetting.linear.bindingSyncDisabledUntilStep')}
          </span>
        </div>
      )}
    </StepCard>
  );

  const renderMapping = () => (
    <StepCard
      description={t(STEP_COPY.mapping.description as never)}
      title={t(STEP_COPY.mapping.title as never)}
      action={
        <Button disabled={!hasBinding} variant="outline" onClick={() => setActiveStep('import')}>
          <ChevronRight aria-hidden size={16} />
          {t('workspaceSetting.linear.continue')}
        </Button>
      }
    >
      {!hasBinding || !selectedBinding ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>{t('workspaceSetting.linear.wizard.completeBinding')}</AlertDescription>
        </Alert>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Alert variant="info">
            <Info aria-hidden className="size-4" />
            <AlertTitle>{t('workspaceSetting.linear.mappingReadOnlyTitle')}</AlertTitle>
            <AlertDescription>
              {t('workspaceSetting.linear.mappingCatalogUnavailable')}
            </AlertDescription>
          </Alert>
          {mappingStateIds.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>
                {t('workspaceSetting.linear.statusMappingsTitle')}
              </span>
              <div>
                {mappingStateIds.map((stateId) => {
                  const mapping = selectedBinding.settings.statusMappings?.find(
                    (item) => item.linearStateId === stateId,
                  );
                  return (
                    <div className={styles.mappingRow} key={stateId}>
                      <span style={{ wordBreak: 'break-all' }}>
                        {catalogWorkflowStatesById.get(stateId)?.name ?? stateId}
                        {catalogWorkflowStatesById.has(stateId) ? ` (${stateId})` : ''}
                      </span>
                      <span
                        style={{
                          color: mapping ? undefined : 'var(--muted-foreground)',
                        }}
                      >
                        {mapping?.workflowCategory ??
                          mapping?.localStatus ??
                          t('workspaceSetting.linear.unmapped')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {mappingAssigneeIds.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontWeight: 600 }}>
                {t('workspaceSetting.linear.assigneeMappingsTitle')}
              </span>
              <div>
                {mappingAssigneeIds.map((linearUserId) => {
                  const mapping = selectedBinding.settings.assignmentMappings?.find(
                    (item) => item.linearUserId === linearUserId,
                  );
                  const target = mapping?.orviloAgentId || mapping?.orviloUserId;
                  return (
                    <div className={styles.mappingRow} key={linearUserId}>
                      <span style={{ wordBreak: 'break-all' }}>
                        {catalogMembersById.get(linearUserId)?.name ?? linearUserId}
                        {catalogMembersById.has(linearUserId) ? ` (${linearUserId})` : ''}
                      </span>
                      <span
                        style={{
                          color: target ? undefined : 'var(--muted-foreground)',
                        }}
                      >
                        {target ?? t('workspaceSetting.linear.unmapped')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {mappingStateIds.length === 0 && mappingAssigneeIds.length === 0 && (
            <span className={styles.muted}>{t('workspaceSetting.linear.noMappingsYet')}</span>
          )}
        </div>
      )}
    </StepCard>
  );

  const renderImport = () => {
    const importInProgress = Boolean(
      selectedBinding && isLinearImportInProgress(selectedBinding, lastImport?.completed),
    );

    return (
      <StepCard
        description={t(STEP_COPY.import.description as never)}
        title={t(STEP_COPY.import.title as never)}
        action={
          <Button
            aria-busy={action === 'import'}
            disabled={!canManage || !hasBinding || issueLinksLoading || action === 'import'}
            variant="outline"
            onClick={() => void importProject()}
          >
            {action === 'import' && <Loader2 aria-hidden className="size-4 animate-spin" />}
            <Upload aria-hidden size={16} />
            {t('workspaceSetting.linear.importProject')}
          </Button>
        }
      >
        {!hasBinding || !selectedBinding ? (
          <Alert variant="warning">
            <TriangleAlert aria-hidden className="size-4" />
            <AlertDescription>
              {t('workspaceSetting.linear.wizard.completeBinding')}
            </AlertDescription>
          </Alert>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className={styles.statusPanel}>
              <Badge size="sm" variant="secondary">
                {<Upload size={12} />}
                {selectedBinding.importCompletedAt || selectedBinding.importPhase === 'completed'
                  ? t('workspaceSetting.linear.importComplete')
                  : importInProgress
                    ? t('workspaceSetting.linear.importInProgress')
                    : t('workspaceSetting.linear.importReady')}
              </Badge>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {selectedBinding.importCompletedAt || selectedBinding.importPhase === 'completed'
                  ? dateLabel(selectedBinding.importCompletedAt, i18n.language)
                  : importInProgress
                    ? t('workspaceSetting.linear.importInProgress')
                    : t('workspaceSetting.linear.importNotRun')}
              </span>
              {lastImport && (
                <span className={styles.muted} style={{ fontSize: 12 }}>
                  {t('workspaceSetting.linear.importBatch', {
                    failed: lastImport.failed,
                    imported: lastImport.imported,
                  })}
                </span>
              )}
            </div>
            {issueLinksError && (
              <Alert variant="destructive">
                <CircleAlert aria-hidden className="size-4" />
                <AlertTitle>{t('workspaceSetting.linear.issueLinksLoadFailed')}</AlertTitle>
                <AlertDescription>{issueLinksError}</AlertDescription>
                <AlertAction>
                  {
                    <Button
                      variant="outline"
                      onClick={() => void loadIssueLinks(selectedBinding.id)}
                    >
                      {t('workspaceSetting.linear.retryLoad')}
                    </Button>
                  }
                </AlertAction>
              </Alert>
            )}
            <div className={styles.statusGrid}>
              {(
                [
                  ['total', issueSummary.total],
                  ['synced', issueSummary.synced],
                  ['pending', issueSummary.pending],
                  ['conflict', issueSummary.conflict],
                  ['outcomeUnknown', issueSummary.outcomeUnknown],
                  ['removed', issueSummary.removed],
                ] as const
              ).map(([key, count]) => (
                <div className={styles.statusCell} key={key}>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {t(`workspaceSetting.linear.import.${key}` as never)}
                  </span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
              ))}
            </div>
            {issueLinksLoading ? (
              <span className={styles.muted}>{t('workspaceSetting.linear.loadingIssueLinks')}</span>
            ) : issueLinks.length > 0 ? (
              <div className={styles.previewList}>
                {issueLinks.slice(0, 8).map((link) => (
                  <div className={styles.previewItem} key={link.id}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span className="block min-w-0 truncate" style={{ fontWeight: 500 }}>
                        {link.linearIdentifier}
                      </span>
                      <span
                        className={'block min-w-0 truncate' + ' ' + styles.muted}
                        style={{ fontSize: 12 }}
                      >
                        {link.remoteSnapshot?.title ?? link.lastConfirmedSnapshot.title}
                      </span>
                    </div>
                    <Badge size="sm" variant="secondary">
                      {link.syncState}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <span className={styles.muted}>
                {t('workspaceSetting.linear.importPreviewEmpty')}
              </span>
            )}
          </div>
        )}
      </StepCard>
    );
  };

  const renderSync = () => (
    <StepCard
      description={t(STEP_COPY.sync.description as never)}
      title={t(STEP_COPY.sync.title as never)}
      action={
        <Button
          aria-busy={action === 'sync'}
          disabled={!canManage || !hasBinding || action === 'sync'}
          variant="outline"
          onClick={() => void persistBinding({ action: 'sync', syncEnabled: !syncEnabled })}
        >
          {action === 'sync' && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {syncEnabled
            ? t('workspaceSetting.linear.disableSync')
            : t('workspaceSetting.linear.enableSync')}
        </Button>
      }
    >
      {!hasBinding || !selectedBinding ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>{t('workspaceSetting.linear.wizard.completeBinding')}</AlertDescription>
        </Alert>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={styles.statusPanel}>
            <Badge variant="secondary">
              {syncEnabled ? <CircleCheck size={12} /> : <CircleDashed size={12} />}
              {syncEnabled
                ? t('workspaceSetting.linear.syncEnabled')
                : t('workspaceSetting.linear.syncDisabled')}
            </Badge>
            <span style={{ color: 'var(--muted-foreground)' }}>
              {selectedInstallation?.lastSyncAt
                ? t('workspaceSetting.linear.lastSync', {
                    time: dateLabel(selectedInstallation.lastSyncAt, i18n.language),
                  })
                : t('workspaceSetting.linear.noSyncRecorded')}
            </span>
          </div>
          <span className={styles.muted} style={{ fontSize: 12 }}>
            {t('workspaceSetting.linear.syncEnableNote')}
          </span>
          <Button
            aria-busy={action === 'worker'}
            variant="outline"
            disabled={
              !canManage ||
              !syncEnabled ||
              selectedInstallation?.status !== 'active' ||
              action === 'worker'
            }
            onClick={() => void runWorker()}
          >
            {action === 'worker' && <Loader2 aria-hidden className="size-4 animate-spin" />}
            <RefreshCw aria-hidden size={16} />
            {t('workspaceSetting.linear.runWorker')}
          </Button>
        </div>
      )}
    </StepCard>
  );

  const renderAutomation = () => (
    <StepCard
      description={t(STEP_COPY.automation.description as never)}
      title={t(STEP_COPY.automation.title as never)}
    >
      {!hasBinding || !selectedBinding || !syncEnabled ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden className="size-4" />
          <AlertDescription>{t('workspaceSetting.linear.wizard.enableSyncFirst')}</AlertDescription>
        </Alert>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className={styles.gate}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={styles.row}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>
                    {t('workspaceSetting.linear.replanningGateTitle')}
                  </span>
                  <span className={styles.description} style={{ fontSize: 12 }}>
                    {t('workspaceSetting.linear.replanningGateDescription')}
                  </span>
                </div>
                <Switch
                  checked={replanningEnabled}
                  disabled={!canManage}
                  onCheckedChange={setReplanningEnabled}
                />
              </div>
              <Button
                aria-busy={action === 'replanning'}
                variant="outline"
                disabled={
                  !canManage ||
                  replanningEnabled === selectedBinding.replanningEnabled ||
                  action === 'replanning'
                }
                onClick={() => void persistBinding({ action: 'replanning', replanningEnabled })}
              >
                {action === 'replanning' && <Loader2 aria-hidden className="size-4 animate-spin" />}
                {t('workspaceSetting.linear.saveReplanning')}
              </Button>
            </div>
          </div>
          <div className={styles.gate}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className={styles.row}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>
                    {t('workspaceSetting.linear.autoExecutionGateTitle')}
                  </span>
                  <span className={styles.description} style={{ fontSize: 12 }}>
                    {t('workspaceSetting.linear.autoExecutionGateDescription')}
                  </span>
                </div>
                <Switch
                  checked={autoExecutionEnabled}
                  disabled={!canManage}
                  onCheckedChange={setAutoExecutionEnabled}
                />
              </div>
              <Button
                aria-busy={action === 'autoExecution'}
                variant="outline"
                disabled={
                  !canManage ||
                  autoExecutionEnabled === selectedBinding.autoExecutionEnabled ||
                  action === 'autoExecution'
                }
                onClick={() =>
                  void persistBinding({ action: 'autoExecution', autoExecutionEnabled })
                }
              >
                {action === 'autoExecution' && (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                )}
                {t('workspaceSetting.linear.saveAutoExecution')}
              </Button>
            </div>
          </div>
          {selectedPlanningScope && (
            <div className="rounded-lg border border-border bg-background">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
                <span style={{ fontWeight: 600 }}>
                  {t('workspaceSetting.linear.planningTitle')}
                </span>
                {latestProposalRevision?.proposal ? (
                  <Alert
                    variant={latestProposalRevision.proposal.requiresApproval ? 'warning' : 'info'}
                  >
                    {latestProposalRevision.proposal.requiresApproval ? (
                      <TriangleAlert aria-hidden className="size-4" />
                    ) : (
                      <Info aria-hidden className="size-4" />
                    )}
                    <AlertTitle>{latestProposalRevision.proposal.explanation}</AlertTitle>
                    <AlertDescription>
                      {
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {latestProposalRevision.proposal.actions.map((proposalAction, index) => (
                            <span
                              key={`${latestProposalRevision.id}-${index}`}
                              style={{ color: 'var(--muted-foreground)' }}
                            >
                              {proposalAction.action}: {proposalAction.reason}
                            </span>
                          ))}
                        </div>
                      }
                    </AlertDescription>
                  </Alert>
                ) : (
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    {t('workspaceSetting.linear.noProposal')}
                  </span>
                )}
                <Button
                  aria-busy={action === 'proposal'}
                  variant="outline"
                  disabled={
                    !canManage ||
                    !replanningEnabled ||
                    !latestProposalRevision?.proposal ||
                    action === 'proposal'
                  }
                  onClick={() => void applyProposal()}
                >
                  {action === 'proposal' && <Loader2 aria-hidden className="size-4 animate-spin" />}
                  {t('workspaceSetting.linear.applyProposal')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </StepCard>
  );

  const stepContent: Record<LinearWizardStepId, ReactNode> = {
    automation: renderAutomation(),
    binding: renderBinding(),
    import: renderImport(),
    installation: renderInstallation(),
    mapping: renderMapping(),
    scope: renderScope(),
    sync: renderSync(),
  };

  return (
    <div className={styles.container}>
      <div className={styles.inner} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ fontWeight: 600, fontSize: 24, margin: 0 }}>
            {t('workspaceSetting.linear.title')}
          </h1>
          <span className={styles.description}>{t('workspaceSetting.linear.description')}</span>
        </div>

        <div aria-label={t('workspaceSetting.linear.wizard.progress')} className={styles.steps}>
          {STEP_ORDER.map((step, index) => {
            const state = stepStates[step];
            const StepIcon = STEP_ICONS[step];
            return (
              <button
                aria-current={activeStep === step ? 'step' : undefined}
                className={`${styles.stepButton} ${activeStep === step ? styles.stepButtonActive : ''}`}
                disabled={!state.enabled}
                key={step}
                type={'button'}
                onClick={() => setActiveStep(step)}
              >
                <div className={styles.stepTop}>
                  <span
                    className={`${styles.stepNumber} ${state.complete ? styles.stepNumberComplete : ''}`}
                  >
                    {state.complete ? <Check size={14} /> : index + 1}
                  </span>
                  <StepIcon size={16} />
                </div>
                <span className={styles.stepLabel}>{t(STEP_COPY[step].title as never)}</span>
                <span className={styles.stepState}>
                  {state.complete
                    ? t('workspaceSetting.linear.wizard.complete')
                    : state.enabled
                      ? t('workspaceSetting.linear.wizard.open')
                      : t('workspaceSetting.linear.wizard.locked')}
                </span>
              </button>
            );
          })}
        </div>

        {stepContent[activeStep]}

        {renderOperations()}

        <Alert variant="info">
          <Info aria-hidden className="size-4" />
          <AlertTitle>{t('workspaceSetting.linear.wizard.scopeBoundaryTitle')}</AlertTitle>
          <AlertDescription>{t('workspaceSetting.linear.wizard.scopeBoundary')}</AlertDescription>
        </Alert>
      </div>
    </div>
  );
});

LinearWorkspaceSettings.displayName = 'LinearWorkspaceSettings';

export default LinearWorkspaceSettings;
