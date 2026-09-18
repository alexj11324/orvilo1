import { type FC } from 'react';

import { type MarkdownElement, type MarkdownElementProps } from '../type';
import { ORVILO_LINK_TAG } from './parse';
import { rehypeOrviloLink } from './rehypePlugin';
import Render from './Render';

const LinkElement: MarkdownElement = {
  Component: Render as FC<MarkdownElementProps>,
  rehypePlugin: rehypeOrviloLink,
  scope: 'all',
  tag: ORVILO_LINK_TAG,
};

export default LinkElement;
