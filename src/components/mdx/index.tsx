import { type FC } from 'react';
import Markdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  markdownElements,
  MarkdownTypography,
  type MarkdownTypographyProps,
} from '@/components/Markdown';

import CodeBlock from './CodeBlock';
import Image from './Image';
import Link from './Link';

export const Typography = ({
  mobile,
  style,
  ...rest
}: { mobile?: boolean } & MarkdownTypographyProps) => (
  <MarkdownTypography
    fontSize={14}
    headerMultiple={mobile ? 0.2 : 0.4}
    style={{ width: '100%', ...style }}
    {...rest}
  />
);

const { inlineCode: _inlineCode, ...elements } = markdownElements;

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
  remarkPlugins: extraRemarkPlugins,
}) => {
  const components: Components = {
    ...(elements as Components),
    a: Link as Components['a'],
    img: Image as Components['img'],
    pre: CodeBlock as Components['pre'],
    ...extraComponents,
  };

  return (
    <Typography mobile={mobile}>
      <Markdown components={components} remarkPlugins={[remarkGfm, ...(extraRemarkPlugins ?? [])]}>
        {source}
      </Markdown>
    </Typography>
  );
};
