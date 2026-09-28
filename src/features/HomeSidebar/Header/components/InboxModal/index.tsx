'use client';

import { createModal, useModalContext } from '@lobehub/ui/base-ui';
import { memo, useEffect } from 'react';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

const RedirectToWorkInbox = memo(() => {
  const navigate = useWorkspaceAwareNavigate();
  const { close } = useModalContext();

  useEffect(() => {
    navigate('/inbox');
    close();
  }, [close, navigate]);

  return null;
});

RedirectToWorkInbox.displayName = 'RedirectToWorkInbox';

/**
 * Legacy opener. Bell, CMDK, and the mobile tab already land on `/inbox`.
 * Leftover callers must redirect — the old modal list UI was removed so it
 * cannot be remounted as a third notification center.
 */
export const InboxModalContent = RedirectToWorkInbox;

export const openInboxModal = () =>
  createModal({
    content: <RedirectToWorkInbox />,
    footer: null,
    maskClosable: true,
    title: false,
    width: 1,
  });
