import {
  isWorkspaceSlugFormatValid,
  slugifyWorkspaceName,
  WORKSPACE_SLUG_MAX,
  WORKSPACE_SLUG_MIN,
} from '@orvilo/const';
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
  // The URL the server last rejected as owned by another workspace. Only that
  // exact value is flagged, so editing the field clears the error.
  const [takenSlug, setTakenSlug] = useState<string>();

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

  // Match workspace.create before the wizard advances or checkpoints a URL
  // the backend will reject. Empty Skip keeps its existing fallback behavior.
  const slug = workspaceSlug.trim();
  const workspaceSlugError: 'invalidLength' | 'invalidPattern' | 'taken' | undefined = !slug
    ? undefined
    : slug.length < WORKSPACE_SLUG_MIN || slug.length > WORKSPACE_SLUG_MAX
      ? 'invalidLength'
      : !isWorkspaceSlugFormatValid(slug)
        ? 'invalidPattern'
        : slug === takenSlug
          ? 'taken'
          : undefined;

  /** Call when create fails with `isWorkspaceSlugTakenError` to flag the submitted URL. */
  const markWorkspaceSlugTaken = () => setTakenSlug(slug);

  return {
    markWorkspaceSlugTaken,
    onWorkspaceNameChange,
    onWorkspaceSlugChange,
    workspaceName,
    workspaceSlug,
    workspaceSlugError,
  };
};
