'use client';

import { ArrowRightIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useCurrentProjectList, useProjectStore } from '@/store/project';

import ProjectItem from './ProjectItem';

interface ProjectProps {
  itemKey: string;
}

const Project = memo<ProjectProps>(({ itemKey }) => {
  const { t } = useTranslation('project');
  const navigate = useWorkspaceAwareNavigate();
  const projects = useCurrentProjectList();
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectList)(true);

  return (
    <AccordionItem value={itemKey}>
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          <AccordionTrigger>
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {t('sidebar.title')}
            </span>
          </AccordionTrigger>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            aria-label={t('list.viewAll')}
            size="icon"
            title={t('list.viewAll')}
            variant="ghost"
            onClick={() => navigate('/projects')}
          >
            <ArrowRightIcon />
          </Button>
        </div>
      </div>
      <AccordionContent>
        {error ? (
          <AsyncError error={error} variant="inline" onRetry={() => mutate()} />
        ) : isLoading ? (
          <SkeletonList rows={3} />
        ) : projects.length === 0 ? (
          <NavItem
            icon={ArrowRightIcon}
            title={t('list.viewAll')}
            onClick={() => navigate('/projects')}
          />
        ) : (
          projects.map((project) => <ProjectItem key={project.id} project={project} />)
        )}
      </AccordionContent>
    </AccordionItem>
  );
});

export default Project;
