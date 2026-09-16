'use client';

import { Block, Flexbox } from '@lobehub/ui';
import { Alert, Button, Select, Switch, Text, toast } from '@lobehub/ui/base-ui';
import type { TaskPlanningProposal } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { Link2, RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';
import { useToolStore } from '@/store/tool';
import { lobehubSkillStoreSelectors } from '@/store/tool/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow-y: auto;
    height: 100%;
    padding: 24px;
  `,
  description: css`
    color: ${cssVar.colorTextSecondary};
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  `,
  row: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  `,
}));

type Catalog = {
  organizations: Array<{ id: string; name: string; url?: string | null }>;
  projects: Array<{ id: string; name: string; state?: string | null; teamIds: string[] }>;
  teams: Array<{ id: string; key: string; name: string }>;
};

type LocalProject = { id: string; identifier: string; name: string };
type ProjectBinding = {
  autoExecutionEnabled: boolean;
  id: string;
  installationId: string;
  linearProjectId: string;
  projectId: string;
  replanningEnabled: boolean;
};
type PlanningRevision = {
  createdAt: string | Date;
  id: string;
  proposal: TaskPlanningProposal | null;
  status: string;
};
type PlanningScope = {
  id: string;
  scopeId: string;
  scopeType: string;
  status: string;
};

const waitForPopup = (popup: Window) =>
  new Promise<void>((resolve) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        resolve();
      }
    }, 500);
  });

const LinearWorkspaceSettings = memo(() => {
  const { t } = useTranslation('setting');
  const { allowed: canManage, reason } = usePermission('manage_settings');
  const linearServer = useToolStore(lobehubSkillStoreSelectors.getServerByIdentifier('linear'));
  const getAuthorizeUrl = useToolStore((state) => state.getLobehubSkillAuthorizeUrl);
  const checkStatus = useToolStore((state) => state.checkLobehubSkillStatus);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [installations, setInstallations] = useState<
    Array<{ id: string; organizationId: string; organizationName: string | null }>
  >([]);
  const [localProjects, setLocalProjects] = useState<LocalProject[]>([]);
  const [bindings, setBindings] = useState<ProjectBinding[]>([]);
  const [planningScopes, setPlanningScopes] = useState<PlanningScope[]>([]);
  const [planningRevisions, setPlanningRevisions] = useState<PlanningRevision[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [selectedInstallationId, setSelectedInstallationId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedLinearProjectId, setSelectedLinearProjectId] = useState('');
  const [replanningEnabled, setReplanningEnabled] = useState(false);
  const [autoExecutionEnabled, setAutoExecutionEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const [catalogResponse, installationResponse, projectResponse, bindingResponse, scopeResponse] = await Promise.all([
      lambdaClient.linearSync.catalog.query(),
      lambdaClient.linearSync.installations.query(),
      lambdaClient.linearSync.projects.query(),
      lambdaClient.linearSync.bindings.query(),
      lambdaClient.linearSync.planningScopes.query(),
    ]);
    if (
      !catalogResponse?.data ||
      !installationResponse?.data ||
      !projectResponse?.data ||
      !bindingResponse?.data ||
      !scopeResponse?.data
    ) {
      throw new Error('Linear workspace settings returned an incomplete response');
    }
    setCatalog(catalogResponse.data);
    setInstallations(installationResponse.data);
    setLocalProjects(projectResponse.data);
    setBindings(bindingResponse.data);
    setPlanningScopes(scopeResponse.data);
    setSelectedInstallationId((current) => current || installationResponse.data[0]?.id || '');
    setSelectedOrganizationId((current) => current || installationResponse.data[0]?.organizationId || '');
  }, []);

  useEffect(() => {
    if (!linearServer?.isConnected) return;
    void refresh().catch((error) => {
      console.error('[LinearWorkspaceSettings] Failed to load catalog', error);
      toast.error(t('workspaceSetting.linear.loadFailed'));
    });
  }, [linearServer?.isConnected, refresh, t]);

  useEffect(() => {
    const binding = bindings.find((item) => item.projectId === selectedProjectId);
    if (!binding) return;
    setSelectedInstallationId(binding.installationId);
    setSelectedLinearProjectId(binding.linearProjectId);
    setReplanningEnabled(binding.replanningEnabled);
    setAutoExecutionEnabled(binding.autoExecutionEnabled);
  }, [bindings, selectedProjectId]);

  const selectedPlanningScope = planningScopes.find(
    (scope) => scope.scopeType === 'project' && scope.scopeId === selectedProjectId,
  );

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
      });
  }, [selectedPlanningScope]);

  const connect = async () => {
    if (!canManage) return;
    const popup = window.open('about:blank', 'orvilo-linear-oauth', 'width=600,height=720');
    if (!popup) {
      toast.error(t('workspaceSetting.linear.popupBlocked'));
      return;
    }
    setLoading(true);
    try {
      const { authorizeUrl } = await getAuthorizeUrl('linear', {
        redirectUri: `${window.location.origin}/oauth/callback/success?provider=linear`,
      });
      popup.location.href = authorizeUrl;
      await waitForPopup(popup);
      await checkStatus('linear');
      toast.success(t('workspaceSetting.linear.connected'));
    } catch (error) {
      popup.close();
      toast.error((error as Error).message || t('workspaceSetting.linear.connectFailed'));
    } finally {
      setLoading(false);
    }
  };

  const saveInstallation = async () => {
    if (!selectedOrganizationId) return;
    setLoading(true);
    try {
      const response = await lambdaClient.linearSync.upsertInstallation.mutate({
        organizationId: selectedOrganizationId,
        organizationName: catalog?.organizations.find((item) => item.id === selectedOrganizationId)?.name,
      });
      if (!response?.data) throw new Error('Linear installation response is empty');
      setInstallations((current) => [
        response.data,
        ...current.filter((item) => item.id !== response.data.id),
      ]);
      setSelectedInstallationId(response.data.id);
      toast.success(t('workspaceSetting.linear.installationSaved'));
    } catch (error) {
      toast.error((error as Error).message || t('workspaceSetting.linear.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const saveBinding = async () => {
    if (!selectedInstallationId || !selectedProjectId || !selectedLinearProjectId) return;
    const remoteProject = catalog?.projects.find((item) => item.id === selectedLinearProjectId);
    setLoading(true);
    try {
      const response = await lambdaClient.linearSync.createProjectBinding.mutate({
        defaultTeamId: remoteProject?.teamIds[0],
        installationId: selectedInstallationId,
        linearProjectId: selectedLinearProjectId,
        projectId: selectedProjectId,
        settings: { autoExecutionEnabled, replanningEnabled },
        teamIds: remoteProject?.teamIds,
      });
      if (!response?.data) throw new Error('Linear binding response is empty');
      setBindings((current) => [
        response.data,
        ...current.filter((item) => item.id !== response.data.id),
      ]);
      toast.success(t('workspaceSetting.linear.bindingSaved'));
    } catch (error) {
      toast.error((error as Error).message || t('workspaceSetting.linear.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const selectedOrganizationName = useMemo(
    () => catalog?.organizations.find((item) => item.id === selectedOrganizationId)?.name,
    [catalog?.organizations, selectedOrganizationId],
  );
  const selectedInstallation = installations.find((item) => item.id === selectedInstallationId);
  const selectedBinding = bindings.find(
    (item) => item.projectId === selectedProjectId && item.installationId === selectedInstallationId,
  );
  const latestProposalRevision = planningRevisions.find(
    (revision) => revision.status === 'proposed' && revision.proposal,
  );

  return (
    <div className={styles.container}>
      <Flexbox gap={20} style={{ margin: '0 auto', maxWidth: 920 }}>
        <Flexbox gap={4}>
          <Text strong as="h1" style={{ fontSize: 24, margin: 0 }}>
            {t('workspaceSetting.linear.title')}
          </Text>
          <Text className={styles.description}>
            {t('workspaceSetting.linear.description')}
          </Text>
        </Flexbox>

        <Block variant="outlined">
          <Flexbox gap={16} padding={20}>
            <div className={styles.row}>
              <Flexbox gap={4}>
                <Text strong>{t('workspaceSetting.linear.connectionTitle')}</Text>
                <Text type="secondary">
                  {linearServer?.isConnected
                    ? t('workspaceSetting.linear.connectedAs', {
                        name: linearServer.providerUsername || t('workspaceSetting.linear.connectedAccount'),
                      })
                    : t('workspaceSetting.linear.connectionDescription')}
                </Text>
              </Flexbox>
              <Button
                disabled={!canManage}
                icon={Link2}
                loading={loading}
                title={!canManage ? reason : undefined}
                onClick={connect}
              >
                {linearServer?.isConnected
                  ? t('workspaceSetting.linear.reconnect')
                  : t('workspaceSetting.linear.connect')}
              </Button>
            </div>
          </Flexbox>
        </Block>

        {linearServer?.isConnected && (
          <>
            <Block variant="outlined">
              <Flexbox gap={16} padding={20}>
                <Flexbox gap={4}>
                  <Text strong>{t('workspaceSetting.linear.organizationTitle')}</Text>
                  <Text type="secondary">{t('workspaceSetting.linear.organizationDescription')}</Text>
                </Flexbox>
                <Select
                  placeholder={t('workspaceSetting.linear.organizationPlaceholder')}
                  value={selectedOrganizationId || undefined}
                  options={(catalog?.organizations ?? []).map((item) => ({
                    label: item.name,
                    value: item.id,
                  }))}
                  onChange={(value) => setSelectedOrganizationId(value)}
                />
                <Button disabled={!canManage || !selectedOrganizationId} loading={loading} onClick={saveInstallation}>
                  {t('workspaceSetting.linear.saveOrganization')}
                </Button>
                {selectedOrganizationName && <Text type="secondary">{selectedOrganizationName}</Text>}
                {selectedInstallation && (
                  <Text type="secondary">
                    {t('workspaceSetting.linear.installationReady', {
                      name: selectedInstallation.organizationName || selectedInstallation.organizationId,
                    })}
                  </Text>
                )}
              </Flexbox>
            </Block>

            <Block variant="outlined">
              <Flexbox gap={16} padding={20}>
                <Flexbox gap={4}>
                  <Text strong>{t('workspaceSetting.linear.bindingTitle')}</Text>
                  <Text type="secondary">{t('workspaceSetting.linear.bindingDescription')}</Text>
                </Flexbox>
                <div className={styles.grid}>
                  <Select
                    options={localProjects.map((item) => ({ label: item.name, value: item.id }))}
                    placeholder={t('workspaceSetting.linear.localProjectPlaceholder')}
                    value={selectedProjectId || undefined}
                    onChange={(value) => setSelectedProjectId(value)}
                  />
                  <Select
                    options={(catalog?.projects ?? []).map((item) => ({ label: item.name, value: item.id }))}
                    placeholder={t('workspaceSetting.linear.remoteProjectPlaceholder')}
                    value={selectedLinearProjectId || undefined}
                    onChange={(value) => setSelectedLinearProjectId(value)}
                  />
                </div>
                <div className={styles.row}>
                  <Text>{t('workspaceSetting.linear.replanning')}</Text>
                  <Switch checked={replanningEnabled} disabled={!canManage} onChange={setReplanningEnabled} />
                </div>
                <div className={styles.row}>
                  <Text>{t('workspaceSetting.linear.autoExecution')}</Text>
                  <Switch checked={autoExecutionEnabled} disabled={!canManage} onChange={setAutoExecutionEnabled} />
                </div>
                <Text type="secondary">{t('workspaceSetting.linear.autoExecutionNote')}</Text>
                <Button
                  disabled={!canManage || !selectedInstallationId || !selectedProjectId || !selectedLinearProjectId}
                  loading={loading}
                  onClick={saveBinding}
                >
                  {t('workspaceSetting.linear.saveBinding')}
                </Button>
                <Button
                  disabled={!canManage || !selectedBinding}
                  loading={loading}
                  onClick={async () => {
                    if (!selectedBinding) return;
                    setLoading(true);
                    try {
                      await lambdaClient.linearSync.importProject.mutate({
                        bindingId: selectedBinding.id,
                        limit: 50,
                      });
                      toast.success(t('workspaceSetting.linear.importSuccess'));
                    } catch (error) {
                      toast.error((error as Error).message || t('workspaceSetting.linear.importFailed'));
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {t('workspaceSetting.linear.importProject')}
                </Button>
              </Flexbox>
            </Block>

            <Alert
              description={t('workspaceSetting.linear.workerDescription')}
              title={t('workspaceSetting.linear.workerTitle')}
            />
            <Button
              disabled={!selectedInstallationId || !canManage}
              icon={RefreshCw}
              loading={loading}
              onClick={async () => {
                if (!selectedInstallationId) return;
                setLoading(true);
                try {
                  await lambdaClient.linearSync.processInbox.mutate({
                    installationId: selectedInstallationId,
                    limit: 20,
                  });
                  await lambdaClient.linearSync.processOutbox.mutate({
                    installationId: selectedInstallationId,
                    limit: 20,
                  });
                  await lambdaClient.linearSync.processPlanning.mutate({ limit: 10 });
                  toast.success(t('workspaceSetting.linear.workerSuccess'));
                } catch (error) {
                  toast.error((error as Error).message || t('workspaceSetting.linear.workerFailed'));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {t('workspaceSetting.linear.runWorker')}
            </Button>

            {selectedPlanningScope && (
              <Block variant="outlined">
                <Flexbox gap={12} padding={20}>
                  <Text strong>{t('workspaceSetting.linear.planningTitle')}</Text>
                  {latestProposalRevision?.proposal ? (
                    <Alert
                      title={latestProposalRevision.proposal.explanation}
                      type={latestProposalRevision.proposal.requiresApproval ? 'warning' : 'info'}
                      description={
                        <Flexbox gap={4}>
                          {latestProposalRevision.proposal.actions.map((action, index) => (
                            <Text key={`${latestProposalRevision.id}-${index}`} type="secondary">
                              {action.action}: {action.reason}
                            </Text>
                          ))}
                        </Flexbox>
                      }
                    />
                  ) : (
                    <Text type="secondary">{t('workspaceSetting.linear.noProposal')}</Text>
                  )}
                  <Button
                    disabled={!canManage || !latestProposalRevision?.proposal}
                    loading={loading}
                    onClick={async () => {
                      if (!latestProposalRevision?.proposal) return;
                      setLoading(true);
                      try {
                        await lambdaClient.linearSync.applyPlanningProposal.mutate({
                          proposal: latestProposalRevision.proposal,
                          revisionId: latestProposalRevision.id,
                        });
                        setPlanningRevisions((current) =>
                          current.map((revision) =>
                            revision.id === latestProposalRevision.id
                              ? { ...revision, status: 'applied' }
                              : revision,
                          ),
                        );
                        toast.success(t('workspaceSetting.linear.proposalApplied'));
                      } catch (error) {
                        toast.error(
                          (error as Error).message || t('workspaceSetting.linear.proposalFailed'),
                        );
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    {t('workspaceSetting.linear.applyProposal')}
                  </Button>
                </Flexbox>
              </Block>
            )}
          </>
        )}
      </Flexbox>
    </div>
  );
});

LinearWorkspaceSettings.displayName = 'LinearWorkspaceSettings';

export default LinearWorkspaceSettings;
