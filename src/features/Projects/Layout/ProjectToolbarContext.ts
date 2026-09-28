import { createContext } from 'react';

/** The active project tab mounts its controls beside the shared tab strip. */
export const ProjectToolbarContext = createContext<HTMLDivElement | null>(null);
