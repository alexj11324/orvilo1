/**
 * Escape all XML special characters (safe for both attributes and content)
 * Includes: & < > " '
 */
export const escapeXml = (text: string | undefined | null): string => {
  if (!text) return '';
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
};

/**
 * Escape special characters for XML attributes
 * Includes: & " < >
 */
export const escapeXmlAttr = (text: string | undefined | null): string => {
  if (!text) return '';
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
};

/**
 * Escape special characters for XML content
 * Includes: & < >
 */
export const escapeXmlContent = (text: string | undefined | null): string => {
  if (!text) return '';
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
};

/**
 * Inverse of {@link escapeXml} for text read back out of an attribute we wrote
 * ourselves. `&amp;` goes last so `&amp;lt;` decodes to `&lt;`, not `<`.
 */
export const unescapeXml = (text: string | undefined | null): string => {
  if (!text) return '';
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
};
