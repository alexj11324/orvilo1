'use client';

import { Github } from '@lobehub/icons';
import { type SkillResourceTreeNode } from '@orvilo/types';
import { cn } from 'cn';
import { DotIcon, ExternalLinkIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import PublishedTime from '@/components/PublishedTime';
import { ArticleSkeleton } from '@/components/Skeleton';
import SkillAvatar from '@/components/SkillAvatar';
import { buttonVariants } from '@/components/ui/button';
import FileTree, { FileTreeSkeleton } from '@/features/FileTree';
import { useToolStore } from '@/store/tool';

import ContentViewer from './ContentViewer';

const styles = {
  description: 'truncate m-0 text-sm leading-5.5 text-muted-foreground',
  divider: 'shrink-0 w-px bg-divider',
  left: 'overflow-y-auto shrink-0 w-60 p-4',
  meta: 'shrink-0 p-4 border-be border-divider',
  metadata: 'truncate m-0 text-xs leading-5 text-muted-foreground',
  name: 'text-base leading-6 font-semibold text-foreground',
  right: '[container-type:size] overflow-auto flex-1',
};

interface AgentSkillDetailProps {
  skillId: string;
}

const buildContentMap = (nodes: SkillResourceTreeNode[] = []): Record<string, string> => {
  const map: Record<string, string> = {};
  const walk = (items: SkillResourceTreeNode[]) => {
    for (const node of items) {
      if (node.type === 'file' && node.content !== undefined) {
        map[node.path] = node.content;
      } else if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return map;
};

const AgentSkillDetail = memo<AgentSkillDetailProps>(({ skillId }) => {
  const { t } = useTranslation('setting');
  const [selectedFile, setSelectedFile] = useState('SKILL.md');
  const { data, isLoading } = useToolStore((s) => s.useFetchAgentSkillDetail)(skillId);

  const skillDetail = data?.skillDetail;
  const resourceTree = data?.resourceTree;
  const contentMap = useMemo(() => buildContentMap(resourceTree), [resourceTree]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className={styles.meta}>
          <ArticleSkeleton className="m-0" rows={1} title={220} />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className={styles.left}>
            <FileTreeSkeleton rows={9} />
          </div>
          <div className={styles.divider} />
          <div className={styles.right}>
            <ArticleSkeleton className="p-4" rows={8} />
          </div>
        </div>
      </div>
    );
  }

  const version = skillDetail?.manifest?.version;
  const description = skillDetail?.description || skillDetail?.manifest?.description;
  const repository = skillDetail?.manifest?.repository;
  const sourceUrl = skillDetail?.manifest?.sourceUrl;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {skillDetail && (
        <div className={styles.meta}>
          <div className="flex items-center gap-3">
            <SkillAvatar size={40} />
            <div className="flex flex-col flex-1 gap-1 overflow-hidden">
              <div className="flex items-center gap-2 justify-between">
                <div className={cn('flex items-center gap-1', styles.metadata)}>
                  <span className={styles.name}>{skillDetail.name}</span>
                  {version && (
                    <>
                      <DotIcon size={16} />
                      <span>v{version}</span>
                    </>
                  )}
                  <DotIcon size={16} />
                  {t('agentSkillDetail.updatedAt')}{' '}
                  <PublishedTime
                    date={new Date(skillDetail.updatedAt).toISOString()}
                    template={'YYYY/MM/DD'}
                  />
                </div>
                {(repository || sourceUrl) && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {repository && (
                      <a
                        aria-label={t('agentSkillDetail.repository')}
                        href={repository}
                        rel="noreferrer"
                        target={'_blank'}
                        title={t('agentSkillDetail.repository')}
                        className={cn(
                          buttonVariants({ size: 'icon', variant: 'ghost' }),
                          'text-muted-foreground',
                        )}
                      >
                        <Github className="size-4 text-foreground-description" size={16} />
                      </a>
                    )}
                    {sourceUrl && (
                      <a
                        aria-label={t('agentSkillDetail.sourceUrl')}
                        href={sourceUrl}
                        rel="noreferrer"
                        target={'_blank'}
                        title={t('agentSkillDetail.sourceUrl')}
                        className={cn(
                          buttonVariants({ size: 'icon', variant: 'ghost' }),
                          'text-muted-foreground',
                        )}
                      >
                        <ExternalLinkIcon className="size-4" size={16} />
                      </a>
                    )}
                  </div>
                )}
              </div>
              {description && <p className={styles.description}>{description}</p>}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className={styles.left}>
          <FileTree
            resourceTree={resourceTree || []}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />
        </div>
        <div className={styles.divider} />
        <div className={styles.right} key={selectedFile}>
          <ContentViewer
            contentMap={contentMap}
            selectedFile={selectedFile}
            skillDetail={skillDetail}
          />
        </div>
      </div>
    </div>
  );
});

AgentSkillDetail.displayName = 'AgentSkillDetail';

export default AgentSkillDetail;
