'use client';

import { Markdown } from '@lobehub/ui';
import type { TaskTemplate } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { Clock, X } from 'lucide-react';
import { memo, useEffect, useMemo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { createModal, type ModalInstance, useModalContext } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

import { ConnectorAuthRow } from './ConnectorAuthRow';
import { resolveTemplateIcon } from './resolveTemplateIcon';
import { INTEREST_ICON_MAP, TemplateBriefIcon } from './TemplateBriefIcon';
import { useScheduleText } from './useScheduleText';
import { useTaskTemplateCreate } from './useTaskTemplateCreate';
import { useVisibleAuthSpecs } from './useVisibleAuthSpecs';

interface TaskTemplateDetailContentProps {
  onCreated: (templateId: number) => void;
  template: TaskTemplate;
}

const TaskTemplateDetailContent = memo<TaskTemplateDetailContentProps>(
  ({ template, onCreated }) => {
    const { close } = useModalContext();

    const iconSpec = useMemo(() => resolveTemplateIcon(template, INTEREST_ICON_MAP), [template]);

    const title = template.title;
    const description = template.description;
    const instruction = template.instruction;

    const visibleAuthSpecs = useVisibleAuthSpecs(template);
    const scheduleText = useScheduleText(template.cronPattern);

    const {
      created,
      disabled,
      handleAddTask,
      handleConnectError,
      loading,
      pendingCreate,
      primaryButtonLabel,
    } = useTaskTemplateCreate({ description, onCreated, template, title });

    // Close the modal once creation completes; handleCreate also navigates to
    // the new task, but closing keeps state tidy if navigation is intercepted.
    useEffect(() => {
      if (created) close();
    }, [created, close]);

    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-row items-start gap-3 justify-between">
          <div className="flex flex-row items-center gap-3" style={{ flex: 1, minWidth: 0 }}>
            <TemplateBriefIcon spec={iconSpec} tileSize={36} />
            <div className="flex flex-col gap-0.5" style={{ minWidth: 0 }}>
              <div className="truncate text-[18px] font-semibold">{title}</div>
              <div className="flex flex-row items-center gap-1">
                <span className="anticon" role="img">
                  <Clock
                    color={cssVar.colorTextSecondary}
                    fill={'transparent'}
                    height={12}
                    size={12}
                    width={12}
                  />
                </span>
                <div className="text-[12px] text-muted-foreground">{scheduleText}</div>
              </div>
            </div>
          </div>
          <ActionIcon icon={X} size={'small'} onClick={close} />
        </div>

        {description.trim().length > 0 && (
          <div className="text-muted-foreground">{description}</div>
        )}

        {instruction.trim().length > 0 && (
          <>
            <Separator className="border-dashed" style={{ marginBlock: 0 }} />
            <Markdown variant={'chat'}>{instruction}</Markdown>
          </>
        )}

        {visibleAuthSpecs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {visibleAuthSpecs.map((spec) => (
              <ConnectorAuthRow
                disabled={disabled}
                key={`${spec.source}:${spec.identifier}`}
                spec={spec}
                onError={handleConnectError}
              />
            ))}
          </div>
        )}

        <div className="flex flex-row justify-end">
          <Button
            disabled={disabled}
            loading={loading || pendingCreate}
            shape={'round'}
            variant="outline"
            onClick={handleAddTask}
          >
            {primaryButtonLabel}
          </Button>
        </div>
      </div>
    );
  },
);

TaskTemplateDetailContent.displayName = 'TaskTemplateDetailContent';

interface CreateTaskTemplateDetailModalOptions {
  onCreated: (templateId: number) => void;
  template: TaskTemplate;
}

export const createTaskTemplateDetailModal = ({
  template,
  onCreated,
}: CreateTaskTemplateDetailModalOptions): ModalInstance =>
  createModal({
    content: <TaskTemplateDetailContent template={template} onCreated={onCreated} />,
    footer: null,
    maskClosable: true,
    styles: {
      content: { overflow: 'hidden', padding: 0 },
    },
    title: null,
    width: 'min(80%, 680px)',
  });
