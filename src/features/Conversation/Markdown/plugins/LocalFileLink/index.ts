import { type FC } from 'react';

import { type MarkdownElement, type MarkdownElementProps } from '../type';
import { ORVILO_LOCAL_FILE_LINK_TAG } from './parse';
import { rehypeLocalFileLink } from './rehypePlugin';
import Render from './Render';

const LocalFileLinkElement: MarkdownElement = {
  Component: Render as FC<MarkdownElementProps>,
  rehypePlugin: rehypeLocalFileLink,
  scope: 'all',
  tag: ORVILO_LOCAL_FILE_LINK_TAG,
};

export default LocalFileLinkElement;
