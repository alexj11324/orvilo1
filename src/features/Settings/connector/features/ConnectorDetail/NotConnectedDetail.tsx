'use client';

import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface NotConnectedDetailProps {
  /** The Connect action for this connector; omitted when none can be offered. */
  action?: ReactNode;
  /** What the connector is, when the catalog has a description. */
  description?: string;
  title: string;
}

/**
 * Detail pane of a connector that is listed but not connected. It exists so a
 * click on any list row has a visible result: the name, why there is nothing to
 * configure yet, and the Connect action — never a Disconnect or Delete.
 */
const NotConnectedDetail = memo<NotConnectedDetailProps>(({ action, description, title }) => {
  const { t } = useTranslation('setting');

  return (
    <div className="flex flex-col gap-2 p-6 text-sm text-muted-foreground">
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold text-foreground">{title}</div>
        {action}
      </div>
      {description && <p>{description}</p>}
      <p>{t('tools.notConnected.desc')}</p>
    </div>
  );
});

NotConnectedDetail.displayName = 'NotConnectedDetail';

export default NotConnectedDetail;
