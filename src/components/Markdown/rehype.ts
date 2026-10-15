import { defaultRehypePlugins, type StreamdownProps } from 'streamdown';

/** Attributes consumed by the existing domain renderers. No event/style wildcard. */
const tagAttributes: Record<string, string[]> = {
  'think': [],
  'orviloThinking': [],
  'orviloArtifact': ['identifier', 'type', 'title', 'language'],
  'orviloAgents': ['identifier', 'title', 'description', 'avatar', 'backgroundColor'],
  'localFile': ['name', 'path', 'isDirectory'],
  'mention': ['id', 'name'],
  'skill': ['label', 'name'],
  'tool': ['label', 'name'],
  'task': [],
  'user_feedback': [],
  'image-search-ref': ['imageIndex', 'originalText'],
  'orviloLocalFileLink': ['linkHref', 'linkLabel'],
  'orviloLink': ['linkHref', 'linkLabel', 'linkKind', 'linkDomain'],
  'collapsible-section': ['title'],
  'Callout': ['type'],
  'Card': ['title', 'desc', 'href', 'image', 'tag'],
  'Cards': [],
  'FileTree': [],
  'Image': ['src', 'alt', 'width', 'height'],
  'Steps': [],
  'Tab': [],
  'Tabs': ['items', 'defaultIndex'],
  'Video': ['src', 'poster', 'controls', 'muted', 'loop'],
};

export const allowedMarkdownTags = (tags: string[]) =>
  Object.fromEntries(
    tags.map((tag) => [tag, [...(Object.hasOwn(tagAttributes, tag) ? tagAttributes[tag] : [])]]),
  );

interface SanitizeSchema {
  [key: string]: unknown;
  attributes?: Record<string, unknown[]>;
  tagNames?: string[];
}

/** Clone the installed sanitizer's schema; never relax its URL protocol/ancestor rules. */
export function nativeRehypePipeline({
  allowHtml,
  allowedTags = {},
  ahead = [],
  domain = [],
  after = [],
}: {
  allowHtml: boolean;
  allowedTags?: StreamdownProps['allowedTags'];
  ahead?: NonNullable<StreamdownProps['rehypePlugins']>;
  domain?: NonNullable<StreamdownProps['rehypePlugins']>;
  after?: NonNullable<StreamdownProps['rehypePlugins']>;
}): NonNullable<StreamdownProps['rehypePlugins']> {
  // This pair is the actual sanitizer exported by the installed engine, not a copy.
  const [sanitize, schema] = defaultRehypePlugins.sanitize as [
    (options: SanitizeSchema) => void,
    SanitizeSchema,
  ];
  const custom: Record<string, string[]> = Object.create(null);
  for (const [tag, attributes] of Object.entries(allowedTags)) {
    custom[tag] = attributes.filter(
      (attribute) => !/^on/i.test(attribute) && attribute !== 'style',
    );
  }
  const extended = {
    ...schema,
    tagNames: [...(schema.tagNames ?? []), ...Object.keys(custom)],
    attributes: { ...schema.attributes, ...custom },
  };
  return [
    ...ahead,
    ...domain,
    ...(allowHtml ? [defaultRehypePlugins.raw] : []),
    [sanitize, extended],
    defaultRehypePlugins.harden,
    ...after,
  ];
}
