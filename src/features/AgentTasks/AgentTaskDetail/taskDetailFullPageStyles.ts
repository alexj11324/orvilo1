/**
 * Geometry for the routed issue page; split and Portal keep their own width.
 * The main/rail switch lives in one place — the `task-detail` container query
 * in `taskDetailLayoutStyles`. WorkSurfaceDocument owns the fixed gutters and
 * document cap; the header stays within that inherited content width.
 */
export const taskDetailFullPageStyles = {
  document:
    'w-full [&_[data-task-detail-header]]:max-w-full [&_[data-task-detail-header]]:mx-auto [&_[data-task-detail-header]]:pbs-1.25',
};
