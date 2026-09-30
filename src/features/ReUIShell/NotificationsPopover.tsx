'use client';

import { BellIcon, CheckCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { Badge } from '@/components/reui/badge';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSidebar } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useInboxUnreadCount } from '@/features/HomeSidebar/Header/components/useInboxUnreadCount';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { inboxKeys } from '@/libs/swr/keys';
import { notificationService } from '@/services/notification';

type NotificationRow = Awaited<ReturnType<typeof notificationService.list>>[number];

function NotificationItem({ notification }: { notification: NotificationRow }) {
  const { title, content, createdAt, isRead } = notification;
  return (
    <div className="relative">
      {!isRead && (
        <span
          aria-hidden="true"
          className="bg-primary ring-background pointer-events-none absolute top-3 right-3 z-10 size-1.5 rounded-full ring-1"
        />
      )}
      <div className="flex w-full items-start gap-2 px-3 py-2 text-left">
        <div className="shrink-0">
          <div className="text-info flex size-6 items-center justify-center [&_svg]:size-4">
            <BellIcon aria-hidden="true" />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-foreground text-xs leading-snug">
              <span className="font-medium">{title}</span>
            </p>
          </div>
          {content && <p className="text-muted-foreground line-clamp-2 text-xs">{content}</p>}
          <div className="flex items-center gap-2 pt-0.5">
            <p className="text-muted-foreground text-[11px]">
              {new Date(createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel() {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const { enabled, unreadCount } = useInboxUnreadCount();
  const navigate = useWorkspaceAwareNavigate();
  const key = inboxKeys.notifications(workspaceId, undefined, undefined, undefined);
  const {
    data: notifications,
    error,
    isLoading,
  } = useClientDataSWR(enabled ? key : null, () => notificationService.list({ limit: 5 }));

  const markAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      await Promise.all([mutate(key), mutate(inboxKeys.feedSummary(workspaceId))]);
    } catch {
      toast.error(t('reuiShell9.markAllReadFailed'));
    }
  };

  return (
    <>
      <div className="border-border/40 flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{t('reuiShell9.notifications')}</span>
          {unreadCount > 0 && <Badge size="xs">{unreadCount}</Badge>}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t('reuiShell9.markAllRead')}
                  className="opacity-60 hover:opacity-100"
                  disabled={unreadCount === 0}
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => void markAllRead()}
                />
              }
            >
              <CheckCheckIcon aria-hidden="true" className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t('reuiShell9.markAllRead')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="relative flex max-h-full min-h-0">
        <ScrollArea className="max-h-[360px] min-h-0 grow md:max-h-[420px]">
          {error ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t('reuiShell9.notificationsUnavailable')}
            </div>
          ) : isLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{t('loading')}</div>
          ) : notifications?.length ? (
            notifications.map((notification, index) => (
              <div key={notification.id}>
                <NotificationItem notification={notification} />
                {index < notifications.length - 1 && <Separator className="opacity-60" />}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t('reuiShell9.noNotifications')}
            </div>
          )}
        </ScrollArea>
      </div>
      <div className="border-border/60 border-t px-2 py-1">
        <Button
          className="w-full text-xs"
          size="sm"
          variant="ghost"
          onClick={() => navigate('/inbox')}
        >
          {t('reuiShell9.viewAllNotifications')}
        </Button>
      </div>
    </>
  );
}

export function NotificationsPopover() {
  const { t } = useTranslation('common');
  const { isMobile } = useSidebar();
  const { unreadCount } = useInboxUnreadCount();
  const trigger = (
    <Button
      aria-label={t('reuiShell9.notifications')}
      className="relative"
      size="icon-sm"
      variant="ghost"
    />
  );
  const triggerContent = (
    <>
      <BellIcon aria-hidden="true" />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 size-1.5 rounded-full bg-sidebar-foreground"
        />
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger aria-label={t('reuiShell9.notifications')} render={trigger}>
          {triggerContent}
        </SheetTrigger>
        <SheetContent
          className="flex w-full flex-col gap-0 p-0 **:data-[slot=sheet-close]:hidden sm:w-md"
          side="right"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('reuiShell9.notifications')}</SheetTitle>
            <SheetDescription>{t('reuiShell9.notificationsDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <NotificationsPanel />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger aria-label={t('reuiShell9.notifications')} render={trigger}>
        {triggerContent}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-92 gap-0 p-0" side="bottom" sideOffset={8}>
        <NotificationsPanel />
      </PopoverContent>
    </Popover>
  );
}
