import { slugifyWorkspaceName } from '@orvilo/const';
import { useRef, useState } from 'react';

/**
 * Workspace URL field that tracks the slugified workspace name until the user
 * takes it over; clearing a manual slug hands the field back to auto-fill.
 */
export const useWorkspaceSlug = () => {
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const slugEditedRef = useRef(false);

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
