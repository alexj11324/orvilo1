import { slugifyWorkspaceName } from '@orvilo/const';
import { useRef, useState } from 'react';

/**
 * Workspace URL field that tracks the slugified workspace name until the user
 * takes it over; clearing a manual slug hands the field back to auto-fill.
 */
export const useWorkspaceSlug = (initialName = '', initialSlug = '') => {
  const [workspaceName, setWorkspaceName] = useState(initialName);
  const [workspaceSlug, setWorkspaceSlug] = useState(
    initialSlug || slugifyWorkspaceName(initialName),
  );
  const slugEditedRef = useRef(initialSlug.trim() !== '');

  const onWorkspaceNameChange = (value: string) => {
    setWorkspaceName(value);
    if (!slugEditedRef.current) {
      setWorkspaceSlug(slugifyWorkspaceName(value));
    }
  };

  const onWorkspaceSlugChange = (value: string) => {
    slugEditedRef.current = value.trim() !== '';
    setWorkspaceSlug(value);
  };

  return { onWorkspaceNameChange, onWorkspaceSlugChange, workspaceName, workspaceSlug };
};
