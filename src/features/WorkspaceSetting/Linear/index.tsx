'use client';

import { Block, Flexbox, Icon } from '@lobehub/ui';
import { Alert, Button, Select, Switch, Tag, Text, toast } from '@lobehub/ui/base-ui';
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
  Link2,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';

import { waitForLinearOAuthPopup } from './oauthPopup';

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
    <Tag icon={<Icon icon={installation.status === 'active' ? CircleCheck : CircleAlert} />}>
      <Text type={tone}>{t(`workspaceSetting.linear.status.${installation.status}` as never)}</Text>
    </Tag>
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
  <Block className={styles.card} variant={'outlined'}>
    <Flexbox gap={16} padding={20}>
      <div className={styles.cardHeader}>
        <Flexbox gap={4}>
          <Text strong as={'h2'} className={styles.cardTitle} style={{ margin: 0 }}>
            {title}
          </Text>
          <Text className={styles.description}>{description}</Text>
        </Flexbox>
        {action}
      </div>
      {children}
    </Flexbox>
  </Block>
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
  const loadScope = useCallback(async () => {
    if (!selectedInstallationId) {
      setSyncScope(null);
      setTeamLinks([]);
      return;
    }
    try {
      const [scopeResponse, teamLinkResponse] = await Promise.all([
        lambdaClient.linearSync.syncScope.query({ installationId: selectedInstallationId }),
        lambdaClient.linearSync.teamLinks.query(),
      ]);
      setSyncScope((scopeResponse?.data as LinearSyncScopeView | null) ?? null);
      setTeamLinks((teamLinkResponse?.data as LinearTeamLinkView[]) ?? []);
    } catch (error) {
      console.error('[LinearWorkspaceSettings] Failed to load sync scope', error);
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
    const timer = setInterval(() => void loadScope(), 3_000);
    return () => clearInterval(timer);
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
      const response = await lambdaClient.linearSync.startOAuth.mutate({
        returnTo: window.location.pathname,
      });
      if (!response?.authorizationUrl) throw new Error('Linear OAuth URL was not returned');
      popup.location.href = response.authorizationUrl;
      const callback = await waitForLinearOAuthPopup(
        popup,
        response.callbackOrigin ?? window.location.origin,
      );
      if (callback.kind !== 'success') {
        throw new Error(
          callback.kind === 'cancelled'
            ? t('workspaceSetting.linear.connectFailed')
            : callback.error || t('workspaceSetting.linear.connectFailed'),
        );
      }
      const refreshedInstallations = await refresh();
      if (
        !refreshedInstallations.some(
          (installation) =>
            installation.id === callback.installationId && installation.status === 'active',
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
              disabled={!canManage}
              icon={Link2}
              loading={action === 'connect'}
              onClick={connect}
            >
              {t('workspaceSetting.linear.operations.reconnect')}
            </Button>
          ) : undefined
        }
      >
        <Flexbox gap={12}>
          <div className={styles.statusGrid}>
            <div className={styles.statusCell}>
              <Text type={'secondary'}>{t('workspaceSetting.linear.operations.status')}</Text>
              <Text>
                {selectedInstallationRecovery
                  ? t(
                      `workspaceSetting.linear.status.${selectedInstallationRecovery.status}` as never,
                    )
                  : '—'}
              </Text>
            </div>
            <div className={styles.statusCell}>
              <Text type={'secondary'}>{t('workspaceSetting.linear.operations.failed')}</Text>
              <Text>{recoverySummary.failed}</Text>
            </div>
            <div className={styles.statusCell}>
              <Text type={'secondary'}>{t('workspaceSetting.linear.operations.deadLetter')}</Text>
              <Text>{recoverySummary.deadLetter}</Text>
            </div>
            <div className={styles.statusCell}>
              <Text type={'secondary'}>
                {t('workspaceSetting.linear.operations.outcomeUnknown')}
              </Text>
              <Text>{recoverySummary.outcomeUnknown}</Text>
            </div>
          </div>
          {selectedInstallationRecovery?.lastError && (
            <Alert
              showIcon
              description={selectedInstallationRecovery.lastError}
              title={t('workspaceSetting.linear.operations.lastSafeError')}
              type={'error'}
            />
          )}
          {recoveryRows.length === 0 ? (
            <Text className={styles.muted}>{t('workspaceSetting.linear.operations.empty')}</Text>
          ) : (
            <div>
              {recoveryRows.map((row) => (
                <div className={styles.operationRow} key={`${row.kind}-${row.id}`}>
                  <Tag size={'small'}>
                    {t(`workspaceSetting.linear.operations.kind.${row.kind}` as never)}
                  </Tag>
                  <Text type={'secondary'}>{row.status}</Text>
                  <Text type={'secondary'}>
                    {t('workspaceSetting.linear.operations.attempts', { count: row.attempts })}
                  </Text>
                  <Text className={styles.operationError} title={row.lastError ?? undefined}>
                    {row.lastError ?? t('workspaceSetting.linear.operations.noError')}
                  </Text>
                  <Flexbox horizontal align={'center'} gap={8}>
                    <Text className={styles.muted} fontSize={12}>
                      {t('workspaceSetting.linear.operations.age', {
                        time: dateLabel(row.createdAt, i18n.language),
                      })}
                    </Text>
                    <Button
                      disabled={!canManage}
                      loading={action === 'retry'}
                      size={'small'}
                      onClick={() => void retryRecoveryRow(row)}
                    >
                      {t('workspaceSetting.linear.operations.retry')}
                    </Button>
                  </Flexbox>
                </div>
              ))}
            </div>
          )}
          <Flexbox gap={8}>
            <Text strong>{t('workspaceSetting.linear.conflicts.title')}</Text>
            <Text type={'secondary'}>{t('workspaceSetting.linear.conflicts.description')}</Text>
          </Flexbox>
          {conflicts.length === 0 ? (
            <Text className={styles.muted}>
              {t('workspaceSetting.linear.conflicts.emptyState')}
            </Text>
          ) : (
            <Flexbox gap={12}>
              {conflicts.map((link) => {
                const conflict = link.conflict!;
                const selections = conflictChoices[link.id] ?? {};
                const mergeReady =
                  conflict.localRevision !== undefined &&
                  conflict.fields.every((field) => Boolean(selections[field]));
                return (
                  <div className={styles.conflictCard} key={link.id}>
                    <Flexbox horizontal align={'center'} gap={12} justify={'space-between'}>
                      <Flexbox gap={2} style={{ minWidth: 0 }}>
                        <Text strong>{link.linearIdentifier}</Text>
                        <Text className={styles.muted} fontSize={12}>
                          {t('workspaceSetting.linear.conflicts.detectedAt', {
                            time: dateLabel(conflict.detectedAt, i18n.language),
                          })}
                        </Text>
                      </Flexbox>
                      <Tag size={'small'}>{t('workspaceSetting.linear.import.conflict')}</Tag>
                    </Flexbox>
                    {conflict.fields.map((field) => (
                      <div className={styles.conflictField} key={field}>
                        <Text weight={500}>{field}</Text>
                        <Text
                          className={styles.conflictValue}
                          title={valueLabel(conflict.local[field])}
                        >
                          {t('workspaceSetting.linear.conflicts.localValue', {
                            value: valueLabel(conflict.local[field]),
                          })}
                        </Text>
                        <Text
                          className={styles.conflictValue}
                          title={valueLabel(conflict.remote[field])}
                        >
                          {t('workspaceSetting.linear.conflicts.linearValue', {
                            value: valueLabel(conflict.remote[field]),
                          })}
                        </Text>
                        <Select
                          placeholder={t('workspaceSetting.linear.conflicts.chooseField')}
                          value={selections[field]}
                          options={[
                            {
                              label: t('workspaceSetting.linear.conflicts.chooseLocal'),
                              value: 'local',
                            },
                            {
                              label: t('workspaceSetting.linear.conflicts.chooseLinear'),
                              value: 'linear',
                            },
                          ]}
                          onChange={(value) =>
                            updateConflictChoice(link.id, field, value as 'linear' | 'local')
                          }
                        />
                      </div>
                    ))}
                    {conflict.localRevision === undefined ? (
                      <Alert
                        showIcon
                        description={t('workspaceSetting.linear.conflicts.refreshRequired')}
                        type={'warning'}
                      />
                    ) : (
                      <Flexbox horizontal gap={8} justify={'flex-end'} wrap={'wrap'}>
                        <Button
                          disabled={!canManage}
                          loading={resolvingConflictId === link.id}
                          size={'small'}
                          onClick={() => void resolveConflict(link, 'keep_local')}
                        >
                          {t('workspaceSetting.linear.conflicts.keepLocal')}
                        </Button>
                        <Button
                          disabled={!canManage}
                          loading={resolvingConflictId === link.id}
                          size={'small'}
                          onClick={() => void resolveConflict(link, 'keep_linear')}
                        >
                          {t('workspaceSetting.linear.conflicts.keepLinear')}
                        </Button>
                        <Button
                          disabled={!canManage || !mergeReady}
                          loading={resolvingConflictId === link.id}
                          size={'small'}
                          type={'primary'}
                          onClick={() => void resolveConflict(link, 'merge')}
                        >
                          {t('workspaceSetting.linear.conflicts.merge')}
                        </Button>
                      </Flexbox>
                    )}
                  </div>
                );
              })}
            </Flexbox>
          )}
        </Flexbox>
      </StepCard>
    );
  };

  const renderInstallation = () => (
    <StepCard
      description={t(STEP_COPY.installation.description as never)}
      title={t(STEP_COPY.installation.title as never)}
      action={
        <Button
          disabled={!canManage}
          icon={Link2}
          loading={action === 'connect'}
          title={!canManage ? reason : undefined}
          onClick={connect}
        >
          {isConnected
            ? t('workspaceSetting.linear.reconnect')
            : t('workspaceSetting.linear.connect')}
        </Button>
      }
    >
      <Flexbox gap={12}>
        <Text className={styles.description}>
          {isConnected
            ? t('workspaceSetting.linear.connectedAccount')
            : t('workspaceSetting.linear.connectionDescription')}
        </Text>
        {!isConnected ? (
          <Alert
            showIcon
            description={t('workspaceSetting.linear.wizard.installationRequired')}
            type={'info'}
          />
        ) : catalogError ? (
          <Alert
            showIcon
            description={catalogError}
            title={t('workspaceSetting.linear.loadFailed')}
            type={'error'}
            action={
              <Button loading={action === 'load'} onClick={() => void loadCatalog()}>
                {t('workspaceSetting.linear.retryLoad')}
              </Button>
            }
          />
        ) : (
          <>
            <div className={styles.row}>
              <Text type={'secondary'}>{t('workspaceSetting.linear.installationIdentity')}</Text>
              <Text type={'secondary'}>
                {selectedInstallation?.organizationName || selectedInstallation?.organizationId}
              </Text>
            </div>
            {selectedInstallation && (
              <div className={styles.statusPanel}>
                <InstallationStatusTag installation={selectedInstallation} />
                <Text type={'secondary'}>
                  {selectedInstallation.organizationName || selectedInstallation.organizationId}
                </Text>
                {selectedInstallation.lastSyncAt && (
                  <Text className={styles.muted} fontSize={12}>
                    {t('workspaceSetting.linear.lastSync', {
                      time: dateLabel(selectedInstallation.lastSyncAt, i18n.language),
                    })}
                  </Text>
                )}
                {selectedInstallationRecovery?.lastError && (
                  <Text style={{ flexBasis: '100%' }} type={'danger'}>
                    {selectedInstallationRecovery.lastError}
                  </Text>
                )}
                {selectedInstallation.status !== 'active' && (
                  <Alert
                    showIcon
                    type={selectedInstallation.status === 'paused' ? 'warning' : 'error'}
                    description={t(
                      `workspaceSetting.linear.installationAction.${selectedInstallation.status}` as never,
                    )}
                  />
                )}
              </div>
            )}
          </>
        )}
      </Flexbox>
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
      <Flexbox className={styles.scopePanel} gap={12}>
        <Flexbox horizontal align={'center'} justify={'space-between'}>
          <Text weight={600}>{t('workspaceSetting.linear.workspaceScopeTitle')}</Text>
          <Button
            disabled={!canManage || remoteTeams.length === 0}
            icon={Upload}
            loading={action === 'scopeImport' || importing}
            type={'primary'}
            onClick={() => void startWorkspaceImport()}
          >
            {importing
              ? t('workspaceSetting.linear.workspaceImporting')
              : syncScope?.importCompletedAt
                ? t('workspaceSetting.linear.workspaceReimport')
                : t('workspaceSetting.linear.workspaceImportStart')}
          </Button>
        </Flexbox>
        <Text className={styles.description} fontSize={12}>
          {t('workspaceSetting.linear.workspaceScopeDescription')}
        </Text>
        <Flexbox gap={8}>
          {remoteTeams.map((team) => (
            <Flexbox horizontal align={'center'} gap={8} key={team.id}>
              <input
                checked={approved(team.id)}
                disabled={!canManage || importing}
                type={'checkbox'}
                onChange={(event) => toggleTeam(team.id, event.target.checked)}
              />
              <Text>
                {team.name} ({team.key})
              </Text>
              {linkedTeamIds.has(team.id) && (
                <Tag>{t('workspaceSetting.linear.workspaceScopeLinked')}</Tag>
              )}
            </Flexbox>
          ))}
        </Flexbox>
        <Flexbox horizontal gap={24} wrap={'wrap'}>
          <Flexbox horizontal align={'center'} gap={8}>
            <input
              checked={scopeIncludeProjectless}
              disabled={!canManage || importing}
              type={'checkbox'}
              onChange={(event) => setScopeIncludeProjectless(event.target.checked)}
            />
            <Text type={'secondary'}>{t('workspaceSetting.linear.includeProjectlessIssues')}</Text>
          </Flexbox>
          <Flexbox horizontal align={'center'} gap={8}>
            <Text type={'secondary'}>{t('workspaceSetting.linear.privateTeamPolicy')}</Text>
            <Select
              disabled={!canManage || importing}
              size={'small'}
              value={scopePrivateTeamPolicy}
              options={[
                {
                  label: t('workspaceSetting.linear.privateTeamImportRestricted'),
                  value: 'import_restricted',
                },
                { label: t('workspaceSetting.linear.privateTeamSkip'), value: 'skip' },
              ]}
              onChange={(value) => setScopePrivateTeamPolicy(value as 'import_restricted' | 'skip')}
            />
          </Flexbox>
        </Flexbox>
        {syncScope && (
          <div className={styles.statusPanel}>
            <Tag
              icon={
                <Icon
                  spin={syncScope.status === 'importing'}
                  icon={
                    syncScope.status === 'importing'
                      ? RefreshCw
                      : syncScope.status === 'failed'
                        ? CircleAlert
                        : CircleCheck
                  }
                />
              }
            >
              <Text type={syncScope.status === 'failed' ? 'danger' : undefined}>
                {t(`workspaceSetting.linear.scopeStatus.${syncScope.status}` as never)}
              </Text>
            </Tag>
            {syncScope.importPhase && (
              <Text type={'secondary'}>
                {t('workspaceSetting.linear.scopePhase', {
                  phase: t(
                    `workspaceSetting.linear.scopePhaseName.${syncScope.importPhase}` as never,
                  ),
                })}
              </Text>
            )}
            <Text className={styles.muted} fontSize={12}>
              {t('workspaceSetting.linear.scopeCounters', {
                issues: syncScope.issuesImported,
                issuesFailed: syncScope.issuesFailed,
                projects: syncScope.projectsLinked,
                teams: syncScope.teamsLinked,
              })}
            </Text>
            {syncScope.lastError && <Text type={'danger'}>{syncScope.lastError}</Text>}
            {syncScope.importCompletedAt && (
              <Text className={styles.muted} fontSize={12}>
                {t('workspaceSetting.linear.scopeCompletedAt', {
                  time: dateLabel(syncScope.importCompletedAt, i18n.language),
                })}
              </Text>
            )}
          </div>
        )}
      </Flexbox>
    );
  };

  const renderScope = () => (
    <StepCard
      description={t(STEP_COPY.scope.description as never)}
      title={t(STEP_COPY.scope.title as never)}
      action={
        <Button disabled={!hasScope} icon={ChevronRight} onClick={() => setActiveStep('binding')}>
          {t('workspaceSetting.linear.continue')}
        </Button>
      }
    >
      {!selectedInstallation || selectedInstallation.status !== 'active' ? (
        <Alert
          showIcon
          description={t('workspaceSetting.linear.wizard.completeInstallation')}
          type={'warning'}
        />
      ) : (
        <Flexbox gap={16}>
          <Text type={'secondary'}>
            {t('workspaceSetting.linear.organizationScopedTo', {
              organization:
                selectedInstallation.organizationName || selectedInstallation.organizationId,
            })}
          </Text>
          {renderWorkspaceScope()}
          <div className={styles.grid}>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>{t('workspaceSetting.linear.teamTitle')}</Text>
              <Select
                disabled={!canManage}
                placeholder={t('workspaceSetting.linear.teamPlaceholder')}
                value={selectedTeamId || undefined}
                options={(catalog?.teams ?? []).map((team) => ({
                  label: `${team.name} (${team.key})`,
                  value: team.id,
                }))}
                onChange={(value) => {
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
              />
            </div>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>
                {t('workspaceSetting.linear.remoteProjectTitle')}
              </Text>
              <Select
                disabled={!canManage || !selectedTeamId}
                placeholder={t('workspaceSetting.linear.remoteProjectPlaceholder')}
                value={selectedLinearProjectId || undefined}
                options={scopedRemoteProjects.map((project) => ({
                  label: project.name,
                  value: project.id,
                }))}
                onChange={(value) => {
                  setSelectedLinearProjectId(value);
                  const project = catalog?.projects.find((item) => item.id === value);
                  if (project && !project.teamIds.includes(selectedTeamId)) {
                    setSelectedTeamId(project.teamIds[0] ?? '');
                  }
                }}
              />
            </div>
          </div>
          {!catalog?.teams.length || !scopedRemoteProjects.length ? (
            <Alert
              showIcon
              description={t('workspaceSetting.linear.scopeCatalogEmpty')}
              type={'warning'}
            />
          ) : null}
        </Flexbox>
      )}
    </StepCard>
  );

  const renderBinding = () => (
    <StepCard
      description={t(STEP_COPY.binding.description as never)}
      title={t(STEP_COPY.binding.title as never)}
      action={
        <Button
          disabled={!canManage || !hasScope || !selectedProjectId || !selectedRemoteProject}
          loading={action === 'binding'}
          onClick={() => void saveBinding()}
        >
          {t('workspaceSetting.linear.saveBinding')}
        </Button>
      }
    >
      {!hasScope ? (
        <Alert
          showIcon
          description={t('workspaceSetting.linear.wizard.completeScope')}
          type={'warning'}
        />
      ) : (
        <Flexbox gap={16}>
          <div className={styles.field}>
            <Text className={styles.fieldLabel}>
              {t('workspaceSetting.linear.localProjectTitle')}
            </Text>
            <Select
              disabled={!canManage}
              placeholder={t('workspaceSetting.linear.localProjectPlaceholder')}
              value={selectedProjectId || undefined}
              options={localProjects.map((project) => ({
                label: `${project.name} (${project.identifier})`,
                value: project.id,
              }))}
              onChange={(value) => setSelectedProjectId(value)}
            />
          </div>
          <div className={styles.statusPanel}>
            <GitBranch size={16} />
            <Text>
              {catalog?.projects.find((project) => project.id === selectedLinearProjectId)?.name}
            </Text>
            <Text type={'secondary'}>·</Text>
            <Text type={'secondary'}>
              {catalog?.teams.find((team) => team.id === selectedTeamId)?.name}
            </Text>
            {hasBinding && (
              <Tag icon={<Check size={12} />} size={'small'}>
                {t('workspaceSetting.linear.bindingSaved')}
              </Tag>
            )}
          </div>
          <Flexbox gap={12}>
            <div className={styles.gate}>
              <div className={styles.row}>
                <Flexbox gap={4}>
                  <Text strong>{t('workspaceSetting.linear.inboundReadTitle')}</Text>
                  <Text className={styles.description} fontSize={12}>
                    {t('workspaceSetting.linear.inboundReadDescription')}
                  </Text>
                </Flexbox>
                <Switch
                  checked={readEnabled}
                  disabled={!canManage}
                  onChange={(value) => void persistRolloutControl('read', value)}
                />
              </div>
            </div>
            <div className={styles.gate}>
              <div className={styles.row}>
                <Flexbox gap={4}>
                  <Text strong>{t('workspaceSetting.linear.outboundWriteTitle')}</Text>
                  <Text className={styles.description} fontSize={12}>
                    {t('workspaceSetting.linear.outboundWriteDescription')}
                  </Text>
                </Flexbox>
                <Switch
                  checked={writeEnabled}
                  disabled={!canManage}
                  onChange={(value) => void persistRolloutControl('write', value)}
                />
              </div>
            </div>
          </Flexbox>
          <Text className={styles.muted} fontSize={12}>
            {t('workspaceSetting.linear.rolloutCompatibilityNote')}
          </Text>
          <Text className={styles.muted} fontSize={12}>
            {t('workspaceSetting.linear.bindingSyncDisabledUntilStep')}
          </Text>
        </Flexbox>
      )}
    </StepCard>
  );

  const renderMapping = () => (
    <StepCard
      description={t(STEP_COPY.mapping.description as never)}
      title={t(STEP_COPY.mapping.title as never)}
      action={
        <Button disabled={!hasBinding} icon={ChevronRight} onClick={() => setActiveStep('import')}>
          {t('workspaceSetting.linear.continue')}
        </Button>
      }
    >
      {!hasBinding || !selectedBinding ? (
        <Alert
          showIcon
          description={t('workspaceSetting.linear.wizard.completeBinding')}
          type={'warning'}
        />
      ) : (
        <Flexbox gap={16}>
          <Alert
            showIcon
            description={t('workspaceSetting.linear.mappingCatalogUnavailable')}
            title={t('workspaceSetting.linear.mappingReadOnlyTitle')}
            type={'info'}
          />
          {mappingStateIds.length > 0 && (
            <Flexbox gap={4}>
              <Text strong>{t('workspaceSetting.linear.statusMappingsTitle')}</Text>
              <div>
                {mappingStateIds.map((stateId) => {
                  const mapping = selectedBinding.settings.statusMappings?.find(
                    (item) => item.linearStateId === stateId,
                  );
                  return (
                    <div className={styles.mappingRow} key={stateId}>
                      <Text style={{ wordBreak: 'break-all' }}>
                        {catalogWorkflowStatesById.get(stateId)?.name ?? stateId}
                        {catalogWorkflowStatesById.has(stateId) ? ` (${stateId})` : ''}
                      </Text>
                      <Text type={mapping ? undefined : 'secondary'}>
                        {mapping?.localStatus ?? t('workspaceSetting.linear.unmapped')}
                      </Text>
                    </div>
                  );
                })}
              </div>
            </Flexbox>
          )}
          {mappingAssigneeIds.length > 0 && (
            <Flexbox gap={4}>
              <Text strong>{t('workspaceSetting.linear.assigneeMappingsTitle')}</Text>
              <div>
                {mappingAssigneeIds.map((linearUserId) => {
                  const mapping = selectedBinding.settings.assignmentMappings?.find(
                    (item) => item.linearUserId === linearUserId,
                  );
                  const target = mapping?.orviloAgentId || mapping?.orviloUserId;
                  return (
                    <div className={styles.mappingRow} key={linearUserId}>
                      <Text style={{ wordBreak: 'break-all' }}>
                        {catalogMembersById.get(linearUserId)?.name ?? linearUserId}
                        {catalogMembersById.has(linearUserId) ? ` (${linearUserId})` : ''}
                      </Text>
                      <Text type={target ? undefined : 'secondary'}>
                        {target ?? t('workspaceSetting.linear.unmapped')}
                      </Text>
                    </div>
                  );
                })}
              </div>
            </Flexbox>
          )}
          {mappingStateIds.length === 0 && mappingAssigneeIds.length === 0 && (
            <Text className={styles.muted}>{t('workspaceSetting.linear.noMappingsYet')}</Text>
          )}
        </Flexbox>
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
            disabled={!canManage || !hasBinding || issueLinksLoading}
            icon={Upload}
            loading={action === 'import'}
            onClick={() => void importProject()}
          >
            {t('workspaceSetting.linear.importProject')}
          </Button>
        }
      >
        {!hasBinding || !selectedBinding ? (
          <Alert
            showIcon
            description={t('workspaceSetting.linear.wizard.completeBinding')}
            type={'warning'}
          />
        ) : (
          <Flexbox gap={16}>
            <div className={styles.statusPanel}>
              <Tag icon={<Upload size={12} />} size={'small'}>
                {selectedBinding.importCompletedAt || selectedBinding.importPhase === 'completed'
                  ? t('workspaceSetting.linear.importComplete')
                  : importInProgress
                    ? t('workspaceSetting.linear.importInProgress')
                    : t('workspaceSetting.linear.importReady')}
              </Tag>
              <Text type={'secondary'}>
                {selectedBinding.importCompletedAt || selectedBinding.importPhase === 'completed'
                  ? dateLabel(selectedBinding.importCompletedAt, i18n.language)
                  : importInProgress
                    ? t('workspaceSetting.linear.importInProgress')
                    : t('workspaceSetting.linear.importNotRun')}
              </Text>
              {lastImport && (
                <Text className={styles.muted} fontSize={12}>
                  {t('workspaceSetting.linear.importBatch', {
                    failed: lastImport.failed,
                    imported: lastImport.imported,
                  })}
                </Text>
              )}
            </div>
            {issueLinksError && (
              <Alert
                showIcon
                description={issueLinksError}
                title={t('workspaceSetting.linear.issueLinksLoadFailed')}
                type={'error'}
                action={
                  <Button onClick={() => void loadIssueLinks(selectedBinding.id)}>
                    {t('workspaceSetting.linear.retryLoad')}
                  </Button>
                }
              />
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
                  <Text fontSize={12} type={'secondary'}>
                    {t(`workspaceSetting.linear.import.${key}` as never)}
                  </Text>
                  <Text strong>{count}</Text>
                </div>
              ))}
            </div>
            {issueLinksLoading ? (
              <Text className={styles.muted}>{t('workspaceSetting.linear.loadingIssueLinks')}</Text>
            ) : issueLinks.length > 0 ? (
              <div className={styles.previewList}>
                {issueLinks.slice(0, 8).map((link) => (
                  <div className={styles.previewItem} key={link.id}>
                    <Flexbox gap={2} style={{ minWidth: 0 }}>
                      <Text ellipsis weight={500}>
                        {link.linearIdentifier}
                      </Text>
                      <Text ellipsis className={styles.muted} fontSize={12}>
                        {link.remoteSnapshot?.title ?? link.lastConfirmedSnapshot.title}
                      </Text>
                    </Flexbox>
                    <Tag size={'small'}>{link.syncState}</Tag>
                  </div>
                ))}
              </div>
            ) : (
              <Text className={styles.muted}>
                {t('workspaceSetting.linear.importPreviewEmpty')}
              </Text>
            )}
          </Flexbox>
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
          disabled={!canManage || !hasBinding}
          loading={action === 'sync'}
          onClick={() => void persistBinding({ action: 'sync', syncEnabled: !syncEnabled })}
        >
          {syncEnabled
            ? t('workspaceSetting.linear.disableSync')
            : t('workspaceSetting.linear.enableSync')}
        </Button>
      }
    >
      {!hasBinding || !selectedBinding ? (
        <Alert
          showIcon
          description={t('workspaceSetting.linear.wizard.completeBinding')}
          type={'warning'}
        />
      ) : (
        <Flexbox gap={16}>
          <div className={styles.statusPanel}>
            <Tag icon={syncEnabled ? <CircleCheck size={12} /> : <CircleDashed size={12} />}>
              {syncEnabled
                ? t('workspaceSetting.linear.syncEnabled')
                : t('workspaceSetting.linear.syncDisabled')}
            </Tag>
            <Text type={'secondary'}>
              {selectedInstallation?.lastSyncAt
                ? t('workspaceSetting.linear.lastSync', {
                    time: dateLabel(selectedInstallation.lastSyncAt, i18n.language),
                  })
                : t('workspaceSetting.linear.noSyncRecorded')}
            </Text>
          </div>
          <Text className={styles.muted} fontSize={12}>
            {t('workspaceSetting.linear.syncEnableNote')}
          </Text>
          <Button
            disabled={!canManage || !syncEnabled || selectedInstallation?.status !== 'active'}
            icon={RefreshCw}
            loading={action === 'worker'}
            onClick={() => void runWorker()}
          >
            {t('workspaceSetting.linear.runWorker')}
          </Button>
        </Flexbox>
      )}
    </StepCard>
  );

  const renderAutomation = () => (
    <StepCard
      description={t(STEP_COPY.automation.description as never)}
      title={t(STEP_COPY.automation.title as never)}
    >
      {!hasBinding || !selectedBinding || !syncEnabled ? (
        <Alert
          showIcon
          description={t('workspaceSetting.linear.wizard.enableSyncFirst')}
          type={'warning'}
        />
      ) : (
        <Flexbox gap={12}>
          <div className={styles.gate}>
            <Flexbox gap={12}>
              <div className={styles.row}>
                <Flexbox gap={4}>
                  <Text strong>{t('workspaceSetting.linear.replanningGateTitle')}</Text>
                  <Text className={styles.description} fontSize={12}>
                    {t('workspaceSetting.linear.replanningGateDescription')}
                  </Text>
                </Flexbox>
                <Switch
                  checked={replanningEnabled}
                  disabled={!canManage}
                  onChange={setReplanningEnabled}
                />
              </div>
              <Button
                disabled={!canManage || replanningEnabled === selectedBinding.replanningEnabled}
                loading={action === 'replanning'}
                onClick={() => void persistBinding({ action: 'replanning', replanningEnabled })}
              >
                {t('workspaceSetting.linear.saveReplanning')}
              </Button>
            </Flexbox>
          </div>
          <div className={styles.gate}>
            <Flexbox gap={12}>
              <div className={styles.row}>
                <Flexbox gap={4}>
                  <Text strong>{t('workspaceSetting.linear.autoExecutionGateTitle')}</Text>
                  <Text className={styles.description} fontSize={12}>
                    {t('workspaceSetting.linear.autoExecutionGateDescription')}
                  </Text>
                </Flexbox>
                <Switch
                  checked={autoExecutionEnabled}
                  disabled={!canManage}
                  onChange={setAutoExecutionEnabled}
                />
              </div>
              <Button
                loading={action === 'autoExecution'}
                disabled={
                  !canManage || autoExecutionEnabled === selectedBinding.autoExecutionEnabled
                }
                onClick={() =>
                  void persistBinding({ action: 'autoExecution', autoExecutionEnabled })
                }
              >
                {t('workspaceSetting.linear.saveAutoExecution')}
              </Button>
            </Flexbox>
          </div>
          {selectedPlanningScope && (
            <Block variant={'outlined'}>
              <Flexbox gap={12} padding={16}>
                <Text strong>{t('workspaceSetting.linear.planningTitle')}</Text>
                {latestProposalRevision?.proposal ? (
                  <Alert
                    title={latestProposalRevision.proposal.explanation}
                    type={latestProposalRevision.proposal.requiresApproval ? 'warning' : 'info'}
                    description={
                      <Flexbox gap={4}>
                        {latestProposalRevision.proposal.actions.map((proposalAction, index) => (
                          <Text key={`${latestProposalRevision.id}-${index}`} type={'secondary'}>
                            {proposalAction.action}: {proposalAction.reason}
                          </Text>
                        ))}
                      </Flexbox>
                    }
                  />
                ) : (
                  <Text type={'secondary'}>{t('workspaceSetting.linear.noProposal')}</Text>
                )}
                <Button
                  disabled={!canManage || !replanningEnabled || !latestProposalRevision?.proposal}
                  loading={action === 'proposal'}
                  onClick={() => void applyProposal()}
                >
                  {t('workspaceSetting.linear.applyProposal')}
                </Button>
              </Flexbox>
            </Block>
          )}
        </Flexbox>
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
      <Flexbox className={styles.inner} gap={20}>
        <Flexbox gap={4}>
          <Text strong as={'h1'} style={{ fontSize: 24, margin: 0 }}>
            {t('workspaceSetting.linear.title')}
          </Text>
          <Text className={styles.description}>{t('workspaceSetting.linear.description')}</Text>
        </Flexbox>

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

        <Alert
          description={t('workspaceSetting.linear.wizard.scopeBoundary')}
          title={t('workspaceSetting.linear.wizard.scopeBoundaryTitle')}
          type={'info'}
        />
      </Flexbox>
    </div>
  );
});

LinearWorkspaceSettings.displayName = 'LinearWorkspaceSettings';

export default LinearWorkspaceSettings;
