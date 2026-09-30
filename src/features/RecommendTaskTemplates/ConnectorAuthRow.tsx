import { Image } from '@lobehub/ui';
import type { TaskTemplateConnectorReference } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { getProviderMeta } from './providerMeta';
import {
  ConnectorConnectionMarketAuthRequiredError,
  ConnectorConnectionPopupBlockedError,
  useConnectorConnection,
} from './useConnectorConnection';

interface ConnectorAuthRowProps {
  disabled?: boolean;
  onError: (error: unknown) => void;
  spec: TaskTemplateConnectorReference;
}

/**
 * Inline row for a single required/optional connector the user has not yet authorized.
 * Renders `null` once the provider is connected so the caller can collapse the
 * surrounding container without extra bookkeeping.
 */
export const ConnectorAuthRow = memo<ConnectorAuthRowProps>(({ disabled, spec, onError }) => {
  const { t } = useTranslation('common');
  const specs = useMemo(() => [spec], [spec]);
  const meta = useMemo(() => getProviderMeta(spec), [spec]);
  const { connect, isAllConnected, isConnecting } = useConnectorConnection(specs);

  const handleConnect = useCallback(async () => {
    if (disabled) return;
    try {
      await connect();
    } catch (error) {
      onError(error);
    }
  }, [connect, disabled, onError]);

  if (!meta || isAllConnected) return null;

  return (
    <div className="flex flex-row items-center gap-2 justify-between">
      <div className="flex flex-row items-center gap-2" style={{ minWidth: 0 }}>
        {typeof meta.icon === 'string' ? (
          <Image alt={meta.label} height={16} src={meta.icon} style={{ flex: 'none' }} width={16} />
        ) : (
          <span className="anticon" role="img">
            <meta.icon
              color={cssVar.colorText}
              fill={cssVar.colorText}
              height={16}
              size={16}
              width={16}
            />
          </span>
        )}
        <div className="truncate text-[13px]">{meta.label}</div>
      </div>
      <Button
        disabled={disabled}
        loading={isConnecting}
        size={'sm'}
        variant="outline"
        onClick={handleConnect}
      >
        {t('taskTemplate.action.connect.short')}
      </Button>
    </div>
  );
});

ConnectorAuthRow.displayName = 'ConnectorAuthRow';

export { ConnectorConnectionMarketAuthRequiredError, ConnectorConnectionPopupBlockedError };
