import { BRANDING_PROVIDER } from '@orvilo/business-const';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { BrandingProviderCard } from '@/business/client/features/BrandingProviderCard';
import Avatar from '@/components/Avatar';
import { ProviderCombine, ProviderIcon } from '@/components/OrviloIcons';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { type AiProviderListItem } from '@/types/aiProvider';

import EnableSwitch from './EnableSwitch';

const isCodingPlanProvider = (id: string) => id.endsWith('codingplan');

/**
 * ChatGPT is an OpenAI subscription, so its icon config points at the OpenAI
 * mark — ProviderCombine renders the OpenAI wordmark and the card reads as a
 * duplicate of the OpenAI one right beside it. Name these providers after the
 * plan instead, the way the detail page header does.
 */
const sharesVendorMark = (id: string) => id === 'chatgpt';

const CARD_CLASS =
  'relative flex flex-col gap-2 rounded-(--radius-card) border border-border bg-card p-4 transition-colors';

interface ProviderCardProps extends AiProviderListItem {
  loading?: boolean;
  onProviderSelect: (provider: string) => void;
}
const ProviderCard = memo<ProviderCardProps>(
  ({ id, description, name, enabled, source, logo, loading, onProviderSelect }) => {
    const { t } = useTranslation('providers');
    const { t: tProvider } = useTranslation('modelProvider');

    if (loading)
      return (
        <div aria-hidden className={CARD_CLASS}>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-full" />
          <div className="mt-1 flex items-center justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4.5 w-8 rounded-full" />
          </div>
        </div>
      );

    if (id === BRANDING_PROVIDER) {
      return <BrandingProviderCard />;
    }

    const displayName = name || id;

    return (
      <div className={cn(CARD_CLASS, 'hover:bg-accent')}>
        {/* Stretched button: the whole card navigates, the switch stays a separate control. */}
        <Button
          aria-label={displayName}
          className="absolute inset-0 h-full w-full rounded-(--radius-card) hover:bg-transparent"
          variant="ghost"
          onClick={() => {
            onProviderSelect(id);
          }}
        />
        <div className="pointer-events-none relative flex min-w-0 items-center gap-2.5">
          {source === 'builtin' ? (
            <>
              {sharesVendorMark(id) ? (
                <span className="flex min-w-0 items-center gap-3">
                  <ProviderIcon
                    provider={id}
                    size={24}
                    style={{ borderRadius: 6 }}
                    type={'avatar'}
                  />
                  <span className="truncate font-semibold">{displayName}</span>
                </span>
              ) : (
                <span className="text-foreground">
                  <ProviderCombine provider={id} size={24} title={name} />
                </span>
              )}
              {isCodingPlanProvider(id) && (
                <Badge variant="info-light">{t('codingPlan', { ns: 'setting' })}</Badge>
              )}
            </>
          ) : (
            <>
              {logo ? (
                <Avatar alt={displayName} avatar={logo} size={28} />
              ) : (
                <ProviderIcon provider={id} size={24} style={{ borderRadius: 6 }} type={'avatar'} />
              )}
              <span className="truncate font-semibold">{displayName}</span>
            </>
          )}
        </div>
        <p className="pointer-events-none relative line-clamp-2 min-h-9 text-xs leading-[18px] text-muted-foreground">
          {source === 'custom'
            ? description
            : description && t(`${id}.description`, { defaultValue: description })}
        </p>
        <div className="pointer-events-none relative mt-1 flex items-center gap-2">
          {enabled ? (
            <Badge variant="success-light">{tProvider('menu.list.enabled')}</Badge>
          ) : (
            <Badge variant="secondary">{tProvider('menu.list.disabled')}</Badge>
          )}
          <span className="flex-1" />
          <div className="pointer-events-auto">
            <EnableSwitch enabled={enabled} id={id} label={displayName} />
          </div>
        </div>
      </div>
    );
  },
);

export default ProviderCard;
