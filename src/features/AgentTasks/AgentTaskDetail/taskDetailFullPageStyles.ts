/**
 * Geometry for the routed issue page; split and Portal keep their own width.
 * The main/rail switch lives in one place — the `task-detail` container query
 * in `taskDetailLayoutStyles` — so the page only sets gutters and caps the
 * content width instead of redefining the breakpoint.
 */
export const taskDetailFullPageStyles = {
  document:
    'w-full max-w-240 mx-0 px-4 [&_[data-task-detail-header]]:max-w-240 [&_[data-task-detail-header]]:mx-auto [&_[data-task-detail-header]]:pbs-1.25',
};
