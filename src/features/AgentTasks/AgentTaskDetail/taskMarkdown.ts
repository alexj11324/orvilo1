/**
 * Markdown builders for the task clipboard actions. Titles are user text, so
 * they are never interpolated raw: a title such as `x](javascript:alert(1)) [y`
 * would otherwise close the link early and smuggle in its own destination.
 */

/** Neutralise the characters that can end or restart a link label, on one line. */
export const escapeMarkdownText = (text: string) =>
  text
    .replaceAll(/\s*[\n\r]\s*/g, ' ')
    .replaceAll(/[[\\\]]/g, String.raw`\$&`)
    .trim();

/** Percent-encode what could terminate a `(destination)` — parens, angle brackets, whitespace. */
const encodeMarkdownUrl = (url: string) =>
  url.replaceAll(
    /[\s()<>]/g,
    (char) => `%${char.codePointAt(0)!.toString(16).toUpperCase().padStart(2, '0')}`,
  );

/** `url` must be app-built (origin + route); only the label carries user text. */
export const markdownLink = (text: string, url: string) =>
  `[${escapeMarkdownText(text)}](${encodeMarkdownUrl(url)})`;

/**
 * The whole issue as a pasteable document: heading, description, source link.
 * An empty description drops out instead of leaving a blank block. The
 * description is the author's own Markdown and is carried through verbatim.
 */
export const taskMarkdownDocument = (input: {
  identifier: string;
  instruction?: string | null;
  title: string;
  url: string;
}) =>
  [
    `# ${escapeMarkdownText(`${input.identifier}: ${input.title}`)}`,
    input.instruction?.trim(),
    encodeMarkdownUrl(input.url),
  ]
    .filter(Boolean)
    .join('\n\n');
