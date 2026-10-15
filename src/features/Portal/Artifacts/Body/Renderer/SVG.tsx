import { BRANDING_NAME } from '@orvilo/business-const';
import { copyImageToClipboard, sanitizeSVGContent } from '@orvilo/utils/client';
import { snapdom } from '@zumer/snapdom';
import { CopyIcon, DownloadIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import { SimpleTooltip } from '../../../SimpleTooltip';

const DOM_ID = 'artfact-svg';
interface SVGRendererProps {
  content: string;
}

const SVGRenderer = ({ content }: SVGRendererProps) => {
  const { t } = useTranslation('portal');

  // Sanitize SVG content to prevent XSS attacks
  const sanitizedContent = useMemo(() => sanitizeSVGContent(content), [content]);

  const generatePng = async () => {
    const blob = await snapdom.toBlob(document.querySelector(`#${DOM_ID}`) as HTMLDivElement, {
      scale: 2,
      type: 'png',
    });

    if (!blob) {
      throw new Error('Failed to generate PNG blob');
    }

    // Convert blob to data URL
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('FileReader result is not a string'));
        }
      });
      reader.addEventListener('error', () =>
        reject(reader.error || new Error('Failed to read blob as data URL')),
      );
      reader.readAsDataURL(blob);
    });
  };

  const downloadImage = async (type: string) => {
    let dataUrl = '';
    if (type === 'png') dataUrl = await generatePng();
    else if (type === 'svg') {
      const blob = new Blob([sanitizedContent], { type: 'image/svg+xml' });

      dataUrl = URL.createObjectURL(blob);
    }

    const title = chatPortalSelectors.artifactTitle(useChatStore.getState());

    const link = document.createElement('a');
    link.download = `${BRANDING_NAME}_${title}.${type}`;
    link.href = dataUrl;
    link.click();
    link.remove();
  };

  return (
    <div className="svg-renderer relative flex h-full flex-col items-center">
      <div
        className="flex h-full w-full flex-col items-center justify-center [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        id={DOM_ID}
      />
      <div className="absolute inset-be-2 end-2 flex flex-row gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button aria-label={t('download', { ns: 'common' })} size="icon" variant="outline">
                <DownloadIcon data-icon="inline-start" />
              </Button>
            }
          />
          <DropdownMenuContent align={'end'} className={'w-auto'} side={'bottom'}>
            <DropdownMenuItem onClick={() => downloadImage('png')}>
              {t('artifacts.svg.download.png')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadImage('svg')}>
              {t('artifacts.svg.download.svg')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SimpleTooltip title={t('artifacts.svg.copyAsImage')}>
          <Button
            aria-label={t('artifacts.svg.copyAsImage')}
            size="compact"
            variant="outline"
            onClick={async () => {
              const dataUrl = await generatePng();
              try {
                await copyImageToClipboard(dataUrl);
                toast.success(t('artifacts.svg.copySuccess'));
              } catch (e) {
                toast.error(t('artifacts.svg.copyFail', { error: e }));
              }
            }}
          >
            <CopyIcon data-icon="inline-start" />
          </Button>
        </SimpleTooltip>
      </div>
    </div>
  );
};

export default SVGRenderer;
