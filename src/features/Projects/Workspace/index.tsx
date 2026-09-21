'use client';

import { Center, Flexbox, TextArea } from '@lobehub/ui';
import { Button, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { SendHorizontalIcon, SparklesIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import AsyncError from '@/components/AsyncError';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { getProjectConversationStartPath } from '@/features/Projects/Layout/navigation';
import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

import ProjectDashboard from './ProjectDashboard';

const styles = createStaticStyles(({ css }) => ({
  composer: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
  `,
  composerFooter: css`
    padding-block: 4px 6px;
    padding-inline: 12px 6px;
  `,
  content: css`
    overflow: auto;
    width: 100%;
  `,
  page: css`
    box-sizing: border-box;
    width: min(960px, calc(100% - 64px));
    margin-inline: auto;
    padding-block: 24px 72px;

    @media (width <= 720px) {
      width: calc(100% - 40px);
      padding-block: 20px 48px;
    }
  `,
  shell: css`
    overflow: hidden;
    height: 100%;
    background: ${cssVar.colorBgContainer};
  `,
  textarea: css`
    padding-block: 10px 4px !important;
    padding-inline: 12px !important;
    border: 0 !important;

    font-size: 14px !important;

    background: transparent !important;
    box-shadow: none !important;
  `,
}));

const ProjectWorkspace = memo(() => {
  const { t } = useTranslation('project');
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const enabled = useUserStore(labPreferSelectors.enableProjects);
  const detail = useCurrentProjectDetail(projectId);
  const [message, setMessage] = useState('');
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectDetail)(projectId);

  if (!enabled) return <ProjectDisabled />;
  if (error) return <AsyncError error={error} variant={'page'} onRetry={() => mutate()} />;
  if (isLoading || !detail)
    return (
      <Center height={'100%'}>
        <NeuralNetworkLoading />
      </Center>
    );

  const startConversation = () => {
    const content = message.trim();
    if (!content || !projectId) return;
    navigate(getProjectConversationStartPath(detail.project.slug ?? projectId, content));
  };

  return (
    <Flexbox className={styles.shell} flex={1}>
      <div className={styles.content}>
        <Flexbox className={styles.page} gap={0}>
          <Flexbox gap={16}>
            {detail.project.description ? (
              <Flexbox gap={4}>
                <Text fontSize={13} weight={600}>
                  {t('overview.descriptionLabel', { defaultValue: 'Description' })}
                </Text>
                <Text type={'secondary'}>{detail.project.description}</Text>
              </Flexbox>
            ) : null}
            <Flexbox className={styles.composer}>
              <TextArea
                autoSize={{ maxRows: 6, minRows: 2 }}
                className={styles.textarea}
                placeholder={t('overview.composerPlaceholder')}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')
                    startConversation();
                }}
              />
              <Flexbox
                horizontal
                align={'center'}
                className={styles.composerFooter}
                justify={'space-between'}
              >
                <Flexbox horizontal align={'center'} gap={7}>
                  <Tag icon={<SparklesIcon size={12} />}>{detail.project.name}</Tag>
                  <Text fontSize={12} type={'secondary'}>
                    {t('overview.contextEnabled')}
                  </Text>
                </Flexbox>
                <Button
                  disabled={!message.trim()}
                  icon={SendHorizontalIcon}
                  type={'primary'}
                  onClick={startConversation}
                />
              </Flexbox>
            </Flexbox>
          </Flexbox>
          <ProjectDashboard detail={detail} projectId={detail.project.id} />
        </Flexbox>
      </div>
    </Flexbox>
  );
});

ProjectWorkspace.displayName = 'ProjectWorkspace';

export default ProjectWorkspace;
