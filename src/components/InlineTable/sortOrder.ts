export type InlineTableSortOrder = 'ascend' | 'descend' | null | undefined;

/**
 * antd-style's `cx` throws on `null` (`'styles' in null`), so conditional classes
 * must receive a real boolean, never the raw nullable `sortOrder`.
 */
export const sortIconActiveClass = (order: InlineTableSortOrder): 'active' | false =>
  order === 'ascend' || order === 'descend' ? 'active' : false;
