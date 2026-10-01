'use client';

import { cn } from 'cn';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export interface WorkspaceAvatarOption {
  avatar?: null | string;
  id: null | string;
  name: string;
}

export const isImageAvatar = (avatar?: null | string) =>
  Boolean(avatar && (/^(?:data:|https?:|\/)/.test(avatar) || avatar.startsWith('blob:')));

export function WorkspaceAvatar({
  workspace,
  className,
}: {
  className?: string;
  workspace: WorkspaceAvatarOption;
}) {
  return (
    <Avatar className={cn('shrink-0', className)}>
      {isImageAvatar(workspace.avatar) && (
        <AvatarImage alt={workspace.name} src={workspace.avatar ?? undefined} />
      )}
      <AvatarFallback className="border border-border bg-background text-sm font-medium text-foreground">
        {workspace.avatar && !isImageAvatar(workspace.avatar)
          ? workspace.avatar
          : workspace.name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
