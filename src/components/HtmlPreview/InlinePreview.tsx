import type { ComponentProps, CSSProperties } from 'react';
import { memo, useMemo } from 'react';

import { WebPreview, WebPreviewBody } from '@/components/ai-elements/web-preview';

import { applyHtmlPreviewBaseUrl } from './applyBaseUrl';
import { HtmlPreview } from './NativePreview';

const hideHtmlPreviewActions = () => null;

interface InlineHtmlPreviewProps {
  animated?: boolean;
  baseUrl?: string;
  className?: string;
  content: string;
  height?: CSSProperties['height'];
  previewProps?: Omit<ComponentProps<typeof HtmlPreview>, 'children'>;
  streaming?: boolean;
  style?: CSSProperties;
  width?: CSSProperties['width'];
}

const InlineHtmlPreview = memo<InlineHtmlPreviewProps>(
  ({
    animated,
    streaming,
    baseUrl,
    className,
    content,
    previewProps,
    height = '100%',
    style,
    width = '100%',
  }) => {
    const previewContent = useMemo(
      () => applyHtmlPreviewBaseUrl(content, baseUrl),
      [baseUrl, content],
    );

    return (
      <WebPreview className="min-h-0 border-0 rounded-none" style={{ height, width, ...style }}>
        <WebPreviewBody>
          <HtmlPreview
            {...previewProps}
            actionsRender={hideHtmlPreviewActions}
            animated={animated}
            className={className}
            copyable={false}
            downloadable={false}
            shadow={false}
            streaming={streaming}
            style={{ height, minHeight: 0, overflow: 'hidden', width, ...style }}
            variant={'borderless'}
            styles={{
              content: { height: '100%' },
              iframe: { height: '100%' },
            }}
          >
            {previewContent}
          </HtmlPreview>
        </WebPreviewBody>
      </WebPreview>
    );
  },
);

InlineHtmlPreview.displayName = 'InlineHtmlPreview';

export default InlineHtmlPreview;
