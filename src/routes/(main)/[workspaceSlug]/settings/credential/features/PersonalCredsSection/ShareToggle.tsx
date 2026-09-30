'use client';

import { type OwnCredSummary } from '@orvilo/types';
import { useMutation } from '@tanstack/react-query';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { lambdaClient } from '@/libs/trpc/client';

interface ShareToggleProps {
  cred: OwnCredSummary;
  /**
   * Called after a share/unshare/visibility change lands — may be async.
   * The mutation waits for it to settle before releasing its optimistic
   * override (see below), so the switch never reverts-then-jumps once fresh
   * data arrives.
   */
  onChange: () => Promise<unknown> | void;
}

/**
 * Per-row control for the workspace creds page's "your personal credentials"
 * section. Lets the owner share one of their own personal credentials into
 * the current workspace (or unshare it), and — once
 * shared — flip its visibility between 'private' (draft, only the owner can
 * see it's linked) and 'public' (visible to the rest of the workspace).
 *
 * Always targets the *active* workspace: the underlying `creds.share`
 * procedure resolves the workspace from `ctx.workspaceId` server-side
 * (verified membership), never from client input.
 */
const ShareToggle: FC<ShareToggleProps> = ({ cred, onChange }) => {
  const { t } = useTranslation('setting');

  // A personal credential can only be shared to one workspace at a time,
  // so `sharedWorkspaceId != null` alone can't tell "shared to *this*
  // workspace" apart from "shared to some other workspace previously" — the
  // list procedure resolves that distinction server-side. Defaults to false
  // (safe: never surfaces an unshare/visibility control for a link that
  // actually belongs to a different workspace) when unset, e.g. outside a
  // workspace context.
  const isShared = cred.sharedToActiveWorkspace ?? false;

  // `cred` only reflects the real server state once the parent's list(s)
  // refetch — which we deliberately wait on inside the mutations below, so
  // there's a real gap between "user clicked" and "`cred` prop updates".
  // Without a local optimistic override, the switch/segmented would sit
  // frozen (looking unresponsive) for that whole round-trip, then snap on
  // their own once fresh data lands. `null` means "no override, trust `cred`".
  const [pendingShared, setPendingShared] = useState<boolean | null>(null);
  const [pendingVisibility, setPendingVisibility] = useState<'private' | 'public' | null>(null);

  const clearPending = () => {
    setPendingShared(null);
    setPendingVisibility(null);
  };

  const shareMutation = useMutation({
    mutationFn: async (visibility: 'private' | 'public') => {
      await lambdaClient.creds.share.mutate({ id: cred.id, visibility });
    },
    onError: () => {
      toast.error(t('creds.share.error'));
    },
    // Awaited by react-query before onSettled fires, so the optimistic
    // override below only lifts once the refetched `cred` prop already
    // agrees with it — never a moment earlier.
    onSuccess: async () => {
      await onChange();
    },
    onSettled: clearPending,
  });

  const unshareMutation = useMutation({
    mutationFn: async () => {
      await lambdaClient.creds.unshare.mutate({ id: cred.id });
    },
    onError: () => {
      toast.error(t('creds.share.error'));
    },
    onSuccess: async () => {
      await onChange();
    },
    onSettled: clearPending,
  });

  const isPending = shareMutation.isPending || unshareMutation.isPending;
  const shared = pendingShared ?? isShared;
  const visibility = pendingVisibility ?? cred.visibility ?? 'private';

  const handleSwitchChange = (checked: boolean) => {
    setPendingShared(checked);
    if (checked) {
      setPendingVisibility('private');
      shareMutation.mutate('private');
    } else {
      unshareMutation.mutate();
    }
  };

  const handleVisibilityChange = (value: 'private' | 'public') => {
    setPendingVisibility(value);
    shareMutation.mutate(value);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="text-[12px] text-muted-foreground">{t('creds.share.toggle')}</div>
      {shared && (
        <ToggleGroup
          disabled={isPending}
          size="sm"
          value={visibility}
          onValueChange={(value) => {
            if (value === 'private' || value === 'public') handleVisibilityChange(value);
          }}
        >
          <ToggleGroupItem value="private">{t('creds.share.visibility.private')}</ToggleGroupItem>
          <ToggleGroupItem value="public">{t('creds.share.visibility.public')}</ToggleGroupItem>
        </ToggleGroup>
      )}
      <Switch checked={shared} disabled={isPending} onCheckedChange={handleSwitchChange} />
    </div>
  );
};

export default ShareToggle;
