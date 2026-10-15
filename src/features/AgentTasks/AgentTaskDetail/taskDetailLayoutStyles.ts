export const TASK_DETAIL_SIDEBAR_MIN_WIDTH = 720;

// One header, two forms, chosen by the column width rather than the viewport:
// the same sections mount in the full page, the chat-side Portal and beside
// the task-agent panel. One mounted property set wraps beneath the title in
// narrow panes and stays in the right rail when that same container is wide.
export const taskDetailLayoutStyles = {
  root: '[container-name:task-detail] [container-type:inline-size]',
  header:
    'grid grid-cols-[minmax(0,1fr)] gap-y-4 pbs-6 pbe-9 [@container_task-detail_(width>=720px)]:grid-cols-[minmax(0,1fr)_232px] [@container_task-detail_(width>=720px)]:gap-x-10',
  description: 'col-start-1 min-w-0 [@container_task-detail_(width>=720px)]:row-start-2',
  main: 'min-w-0',
  body: 'col-start-1 min-w-0 pbe-30 [@container_task-detail_(width>=720px)]:row-start-3',
  side: 'flex flex-col gap-4 min-w-0 [@container_task-detail_(width>=720px)]:sticky [@container_task-detail_(width>=720px)]:top-4 [@container_task-detail_(width>=720px)]:col-start-2 [@container_task-detail_(width>=720px)]:row-span-3 [@container_task-detail_(width>=720px)]:row-start-1 [@container_task-detail_(width>=720px)]:self-start [@container_task-detail_(width>=720px)]:pbs-0',
  // Linear splits its section chrome into two tiers: the top-level "Activity"
  // band reads as a 15px/600 heading inside a 32px container while the
  // collapsible sections (Sub-issues, …) keep the compact 12px/500 label on a
  // 24px flat row — both chrome shapes live in `TaskDetailSectionHeader`.
  sectionHeading: 'text-[15px] leading-5 font-semibold', // linear-token-override: Linear-measured 15px Activity band — no scale class between text-sm(14) and text-base(16).
  propertyGroups:
    'flex flex-wrap gap-2 items-center min-w-0 [&>div]:contents [@container_task-detail_(width>=720px)]:flex-col [@container_task-detail_(width>=720px)]:flex-nowrap [@container_task-detail_(width>=720px)]:gap-6 [@container_task-detail_(width>=720px)]:items-stretch [@container_task-detail_(width>=720px)]:[&>div]:flex',
  railSection: 'flex flex-col gap-2 min-w-0',
  // Linear's rail group labels (Properties / Labels / Related) measure 16px
  // at weight 400 on the muted ink — a real heading line, not the compact
  // 12px/500 tier the collapsible section headers keep. They read as group
  // headers only in the wide rail — the narrow chip strip keeps them hidden.
  railSectionLabel:
    'hidden text-base font-normal text-muted-foreground [@container_task-detail_(width>=720px)]:block',
  railRow:
    'w-fit max-w-full min-h-7 ps-2 pe-2.5 rounded-(--radius-input) whitespace-nowrap bg-muted [@container_task-detail_(width>=720px)]:w-full [@container_task-detail_(width>=720px)]:px-0 [@container_task-detail_(width>=720px)]:bg-transparent',
  properties:
    'contents [@container_task-detail_(width>=720px)]:flex [@container_task-detail_(width>=720px)]:flex-col [@container_task-detail_(width>=720px)]:gap-1 [@container_task-detail_(width>=720px)]:items-stretch [@container_task-detail_(width>=720px)]:max-w-full',
  propertyRow:
    'flex flex-none gap-2 items-center min-w-0 max-w-full [@container_task-detail_(width>=720px)]:w-full',
  propertyValue:
    'flex flex-none flex-wrap gap-1 items-center min-w-0 max-w-full min-h-7 text-(length:--text-dense) leading-5 font-normal text-foreground tracking-normal [@container_task-detail_(width>=720px)]:flex-1',
  propertyButton:
    '-mx-1.5 px-1.5 border-0 [font-size:inherit] [line-height:inherit] [letter-spacing:inherit]',
  // The "+ Add …" affordances and "Show N more" share one role in Linear's
  // rail: 13px muted ink (measured ~150 luminance beside 255 row text).
  addProperty:
    'w-fit text-(length:--text-dense) text-muted-foreground [@container_task-detail_(width>=720px)]:-ms-1.5',
  propertyDanger: 'text-destructive-text',
  propertyItem:
    'max-w-full min-h-7 ps-2 pe-2.5 rounded-(--radius-input) whitespace-nowrap bg-muted [@container_task-detail_(width>=720px)]:w-full [@container_task-detail_(width>=720px)]:bg-transparent',
};
