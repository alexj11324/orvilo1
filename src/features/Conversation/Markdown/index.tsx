import { memo, useMemo } from 'react';

import { Markdown, type MarkdownProps } from '@/components/Markdown';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

export type MarkdownMessageProps = MarkdownProps;

/** Chat message Markdown: applies the user's font size, code theme and Mermaid theme. */
const MarkdownMessage = memo<MarkdownMessageProps>(({ children, componentProps, ...rest }) => {
  const { highlighterTheme, mermaidTheme, fontSize } = useUserStore(
    userGeneralSettingsSelectors.config,
  );
  const resolvedComponentProps = useMemo(
    () => ({
      ...componentProps,
      highlight: { theme: highlighterTheme, ...componentProps?.highlight },
      mermaid: { fullFeatured: false, theme: mermaidTheme, ...componentProps?.mermaid },
    }),
    [componentProps, highlighterTheme, mermaidTheme],
  );

  return (
    <Markdown
      fontSize={fontSize}
      marginMultiple={2}
      variant="chat"
      {...rest}
      componentProps={resolvedComponentProps}
    >
      {children}
    </Markdown>
  );
});

export default MarkdownMessage;
