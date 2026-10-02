import { activityBucketTitle } from './myWorkDisplay';

export interface WorkQueryGroupTitleCatalog {
  assigneeName?: (id: string) => string | undefined;
  cycleName?: (id: string) => string | undefined;
  labels: {
    noCycle: string;
    noProject: string;
    priority?: (key: string) => string | undefined;
    today: string;
    unassigned: string;
    unknownDate: string;
    yesterday: string;
  };
  locale?: string;
  projectName?: (id: string) => string | undefined;
}

/** Header text for a work-query group. Status and workflow keep their own marks. */
export const workQueryGroupTitle = (
  axis: string,
  key: string,
  catalog: WorkQueryGroupTitleCatalog,
): string | undefined => {
  if (axis === 'activityDate') {
    return activityBucketTitle(key, {
      labels: {
        today: catalog.labels.today,
        unknown: catalog.labels.unknownDate,
        yesterday: catalog.labels.yesterday,
      },
      locale: catalog.locale,
    });
  }
  if (axis === 'priority') return catalog.labels.priority?.(key);
  if (axis === 'project') {
    if (key === 'none') return catalog.labels.noProject;
    return catalog.projectName?.(key);
  }
  if (axis === 'assignee') {
    if (key === 'none') return catalog.labels.unassigned;
    return catalog.assigneeName?.(key);
  }
  if (axis === 'cycle') {
    if (key === 'none') return catalog.labels.noCycle;
    return catalog.cycleName?.(key);
  }
  return undefined;
};
