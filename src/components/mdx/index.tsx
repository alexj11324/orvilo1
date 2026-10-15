import { type FC } from 'react';
import { type Components, type Options } from 'react-markdown';

import {
  allowedMarkdownTags,
  Markdown,
  type MarkdownProps,
  Typography as NativeTypography,
  type TypographyProps,
} from '@/components/Markdown';
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
  const components = {
    ...mdxElements,
    a: Link,
    img: Image,
    pre: CodeBlock,
    ...extraComponents,
  } as unknown as NonNullable<MarkdownProps['components']>;
  return (
    <Typography mobile={mobile}>
      <Markdown
        components={components}
        enableStream={false}
        remarkPlugins={remarkPlugins}
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
