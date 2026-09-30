import { confirmModal } from '@lobehub/ui/base-ui';
import { COMPOSIO_APP_TYPES } from '@orvilo/const';
import { X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToolStore } from '@/store/tool';
import { type ComposioServer } from '@/store/tool/slices/composioStore';

interface ComposioAuthItemProps {
  server: ComposioServer;
}

const ComposioAuthItem = memo<ComposioAuthItemProps>(({ server }) => {
  const { t } = useTranslation('auth');
  const [isRevoking, setIsRevoking] = useState(false);

  const removeComposioConnection = useToolStore((s) => s.removeComposioConnection);

  // Get server type configuration (icons, etc.)
  const serverType = COMPOSIO_APP_TYPES.find((item) => item.identifier === server.identifier);

  // Handle deauthorization
  const handleRevoke = useCallback(() => {
    confirmModal({
      content: t('profile.authorizations.revoke.description'),
      okButtonProps: { danger: true },
      onOk: async () => {
        setIsRevoking(true);
        try {
          await removeComposioConnection(server.identifier);
        } finally {
          setIsRevoking(false);
        }
      },
      title: t('profile.authorizations.revoke.title', {
        name: serverType?.label || server.label,
      }),
    });
  }, [removeComposioConnection, server.identifier, server.label, serverType?.label, t]);

  // Render icon
  const renderIcon = () => {
    if (!serverType) return null;

    if (typeof serverType.icon === 'string') {
      return (
        <Avatar className="size-4">
          <AvatarImage alt="" src={serverType.icon} />
        </Avatar>
      );
    }

    const IconComponent = serverType.icon;
    return <IconComponent size={14} />;
  };

  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-sm">
      <div
        className="flex flex-row gap-[4px] items-center"
        style={{ opacity: isRevoking ? 0.5 : 1 }}
      >
        {renderIcon()}
        {serverType?.label || server.label}
      </div>
      <Button
        disabled={isRevoking}
        size="icon-xs"
        variant="ghost"
        aria-label={t('profile.authorizations.revoke.title', {
          name: serverType?.label || server.label,
        })}
        onClick={handleRevoke}
      >
        <X />
      </Button>
    </span>
  );
});

interface ComposioAuthorizationListProps {
  servers: ComposioServer[];
}

export const ComposioAuthorizationList = memo<ComposioAuthorizationListProps>(({ servers }) => {
  return (
    <div className="flex flex-wrap gap-2">
      {servers.map((server) => (
        <ComposioAuthItem key={server.identifier} server={server} />
      ))}
    </div>
  );
});

export default ComposioAuthorizationList;
