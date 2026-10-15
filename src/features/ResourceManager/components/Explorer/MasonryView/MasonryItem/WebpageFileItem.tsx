import { cn } from 'cn';
import { ExternalLinkIcon, GlobeIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const hostnameOf = (url?: string): string | null => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/**
 * Clippings without a real page title store the URL in `name`. A raw URL as a
 * bold card title reads broken — fall back to the last path segment (the
 * document name, e.g. `SKILL.md`) or the hostname; the full source stays on
 * the domain row and the open-link button.
 */
export const displayTitle = (name: string): string => {
  if (!/^https?:\/\//.test(name.trim())) return name;
  try {
    const parsed = new URL(name.trim());
    const lastSegment = decodeURIComponent(
      parsed.pathname.split('/').findLast(Boolean) ?? '',
    ).trim();
    return lastSegment || parsed.hostname.replace(/^www\./, '');
  } catch {
    return name;
  }
};

interface WebpageFileItemProps {
  contentPreview?: string | null;
  name: string;
  url?: string;
}

/**
 * Masonry card for web clippings — a Cubox-style reading card: excerpt sheet
 * on top, title and source domain below, with a direct link to the original.
 */
const WebpageFileItem = memo<WebpageFileItemProps>(({ contentPreview, name, url }) => {
  const { t } = useTranslation('common');
  const hostname = hostnameOf(url);
  const title = displayTitle(name);

  return (
    <>
      {contentPreview && (
        <div className="p-3.5 border-be border-solid border-divider bg-fill-quaternary">
          <div className="line-clamp-5 text-sm leading-5.5 text-muted-foreground [word-break:break-word]">
            {contentPreview}
          </div>
        </div>
      )}
      <div className={cn('flex flex-col gap-2', 'p-3')}>
        <span className="line-clamp-2 text-sm leading-5.5 font-semibold text-foreground [word-break:break-word]">
          {title}
        </span>
        <div className="flex flex-row items-center gap-2 justify-between">
          <div className="overflow-hidden flex items-center gap-1.5 text-xs leading-5 text-muted-foreground [&_span]:truncate">
            <span className="anticon" role="img">
              <GlobeIcon fill={'transparent'} height={14} size={14} width={14} />
            </span>
            {hostname && <span>{hostname}</span>}
          </div>
          {url && (
            <button
              aria-label={t('openSourcePage', { ns: 'common' })}
              className="cursor-pointer grid flex-none place-items-center size-8 rounded-(--radius-button) text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              type={'button'}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
            >
              <span className="anticon" role="img">
                <ExternalLinkIcon fill={'transparent'} height={14} size={14} width={14} />
              </span>
            </button>
          )}
        </div>
      </div>
    </>
  );
});

WebpageFileItem.displayName = 'WebpageFileItem';

export default WebpageFileItem;
