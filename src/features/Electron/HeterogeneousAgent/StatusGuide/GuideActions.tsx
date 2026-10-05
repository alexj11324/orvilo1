import { isDesktop } from '@orvilo/const';
import { ExternalLink, RotateCcw, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getHostPort } from '@/platform';

interface GuideActionsProps {
  docsUrl?: string;
  onOpenSystemTools?: () => void;
  onRetry?: () => void;
  openDocsLabel?: string;
  openSystemToolsLabel?: string;
  retryLabel?: string;
  retryPrimary?: boolean;
  showDocs?: boolean;
}

const GuideActions = ({
  docsUrl,
  onOpenSystemTools,
  onRetry,
  openDocsLabel,
  openSystemToolsLabel,
  retryLabel,
  retryPrimary = false,
  showDocs = false,
}: GuideActionsProps) => {
  const showDocsButton = showDocs && Boolean(docsUrl && openDocsLabel);
  const showSystemToolsButton = Boolean(onOpenSystemTools && openSystemToolsLabel);
  const showRetryButton = Boolean(onRetry && retryLabel);

  if (!showDocsButton && !showSystemToolsButton && !showRetryButton) return null;

  return (
    <div className="flex gap-2 justify-end" style={{ flexWrap: 'wrap' }}>
      {showRetryButton && (
        <Button size="sm" variant={retryPrimary ? 'default' : 'outline'} onClick={onRetry}>
          <RotateCcw size={14} /> {retryLabel}
        </Button>
      )}
      {showSystemToolsButton && (
        <Button size="sm" onClick={onOpenSystemTools}>
          <Settings2 size={14} /> {openSystemToolsLabel}
        </Button>
      )}
      {showDocsButton && docsUrl && openDocsLabel && (
        <Button
          size="sm"
          variant="default"
          onClick={() => {
            const openLink = isDesktop
              ? getHostPort().openExternal(docsUrl)
              : Promise.resolve(window.open(docsUrl, '_blank', 'noopener,noreferrer'));

            openLink.catch(console.error);
          }}
        >
          <ExternalLink size={14} /> {openDocsLabel}
        </Button>
      )}
    </div>
  );
};

export default GuideActions;
