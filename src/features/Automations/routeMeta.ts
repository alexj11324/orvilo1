import { AlarmClockIcon } from 'lucide-react';

import { createSurfaceSkeleton } from '@/components/Skeleton/Surface';
import { usePublishDynamicRouteMeta } from '@/features/RouteMeta/usePublishDynamicRouteMeta';
import type { DynamicRouteMetaProps } from '@/spa/router/routeMeta';
import { routeMeta } from '@/spa/router/routeMeta';
import { useTaskStore } from '@/store/task';

export const automationsRouteMeta = routeMeta({
  icon: AlarmClockIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'navigation.automations',
});

const AutomationDynamicMeta = ({ onResolve, params }: DynamicRouteMetaProps) => {
  const name = useTaskStore((s) =>
    params.taskId ? s.taskDetailMap[params.taskId]?.name : undefined,
  );
  usePublishDynamicRouteMeta({ title: name || undefined }, onResolve);
  return null;
};

export const automationDetailRouteMeta = routeMeta({
  DynamicMeta: AutomationDynamicMeta,
  icon: AlarmClockIcon,
  Skeleton: createSurfaceSkeleton('detail'),
  titleKey: 'navigation.automations',
});

export const automationNewRouteMeta = routeMeta({
  icon: AlarmClockIcon,
  Skeleton: createSurfaceSkeleton('form'),
  titleKey: 'navigation.automations',
});

export const automationRunsRouteMeta = routeMeta({
  icon: AlarmClockIcon,
  Skeleton: createSurfaceSkeleton('list'),
  titleKey: 'navigation.automations',
});
