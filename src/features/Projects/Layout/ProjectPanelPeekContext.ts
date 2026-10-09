import { createContext, useContext, useEffect } from 'react';

/**
 * A project tab can ask the layout to hide the right-hand properties panel
 * while the tab shows something that takes the panel's place (the Issues
 * peek). The layout derives `visible = viewport && section && !suppressed`; the
 * panel stays mounted, so nothing the user toggled inside it is lost.
 * Outside a project layout the default is a no-op.
 */
export const ProjectPanelSuppressContext = createContext<(suppressed: boolean) => void>(() => {});

/** Hide the project properties panel for as long as `suppressed` is true. */
export const useSuppressProjectPanel = (suppressed: boolean) => {
  const setSuppressed = useContext(ProjectPanelSuppressContext);
  useEffect(() => {
    if (!suppressed) return;
    setSuppressed(true);
    return () => setSuppressed(false);
  }, [setSuppressed, suppressed]);
};
