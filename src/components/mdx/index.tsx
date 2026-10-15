import { type FC, useMemo } from 'react';
import { type Components, type Options } from 'react-markdown';

import {
  allowedMarkdownTags,
  Markdown,
  Typography as NativeTypography,
  type TypographyProps,
} from '@/components/Markdown';
import { markdownComponentAdapters } from '@/components/Markdown/componentAdapters';
import { mdxElements } from '@/components/Markdown/mdxElements';

import CodeBlock from './CodeBlock';
import Image from './Image';
import Link from './Link';

export const Typography = ({
  mobile,
  className,
  ...props
}: { mobile?: boolean } & TypographyProps) => (
  <NativeTypography
    {...props}
    className={className ? `w-full ${className}` : 'w-full'}
    data-mdx-layout={mobile ? 'mobile' : 'document'}
  />
);

interface CustomMDXProps {
  components?: Components;
  mobile?: boolean;
  remarkPlugins?: Options['remarkPlugins'];
  source: string;
}

export const CustomMDX: FC<CustomMDXProps> = ({
  mobile,
  source,
  components: extraComponents,
  remarkPlugins,
}) => {
  // Both engines pass the same intrinsic props + HAST node to these actual owners.
  const components = useMemo(
    () =>
      markdownComponentAdapters({
        ...mdxElements,
        a: Link,
        img: Image,
        pre: CodeBlock,
        ...extraComponents,
      }),
    [extraComponents],
  );
  return (
    <Typography mobile={mobile}>
      <Markdown
        components={components}
        enableStream={false}
        remarkPlugins={remarkPlugins ?? undefined}
        allowedTags={allowedMarkdownTags([
          ...Object.keys(mdxElements),
          ...Object.keys(extraComponents ?? {}),
        ])}
      >
        {source}
      </Markdown>
    </Typography>
  );
};
