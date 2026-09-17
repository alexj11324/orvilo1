import { ARTIFACT_THINKING_TAG_REGEX } from '@orvilo/const';

const ARTIFACT_TAG_REGEX_GLOBAL =
  /<orviloArtifact\b[^>]*>(?<content>[\S\s]*?)(?:<\/orviloArtifact>|$)/g;

// Match only the `orviloAgents` tag itself (self-closing `/>` or a bare opening
// `>`), never the content that follows it. The card is built purely from the
// tag's attributes (the rehype plugin renders it with no children), so there is
// nothing to capture inside. A previous `>([\S\s]*?)(?:<\/orviloAgents>|$)` form
// fell back to `$` when a model omitted the self-closing slash and emitted
// `<orviloAgents ...>`; with no `</orviloAgents>` to anchor on, it swallowed the
// rest of the message and stripped its newlines, collapsing all trailing
// block-level Markdown (headings, tables, `---`) into one paragraph.
const AGENTS_TAG_REGEX_GLOBAL = /<orviloAgents\b[^>]*>/g;

/**
 * Replace all line breaks in the matched `orviloArtifact` tag with an empty string
 */
export const processWithArtifact = (input: string = '') => {
  // First remove outer fenced code block if it exists
  /* eslint-disable regexp/no-super-linear-backtracking */
  let output = input.replace(
    /^([\s\S]*?)\s*```[^\n]*\n((?:<orviloThinking>[\s\S]*?<\/orviloThinking>[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*)?<orviloArtifact[\s\S]*?<\/orviloArtifact>\s*)\n```\s*([\s\S]*)$/,
    (_, before = '', content, after = '') => {
      return [before.trim(), content.trim(), after.trim()].filter(Boolean).join('\n\n');
    },
  );
  /* eslint-enable regexp/no-super-linear-backtracking */

  const thinkMatch = ARTIFACT_THINKING_TAG_REGEX.exec(output);

  // If the input contains the `orviloThinking` tag, replace all line breaks with an empty string
  if (thinkMatch) {
    output = output.replace(ARTIFACT_THINKING_TAG_REGEX, (match) =>
      match.replaceAll(/\r?\n|\r/g, ''),
    );
  }

  // Add empty line between orviloThinking and orviloArtifact if they are adjacent
  // Support both cases: with line break (e.g. from other models) and without (e.g. from Gemini)
  output = output.replace(/(<\/orviloThinking>)(?:\r?\n)?(<orviloArtifact)/, '$1\n\n$2');

  // Remove fenced code block between orviloArtifact and HTML content
  output = output.replace(
    /(<orviloArtifact[^>]*>)\s*```[^\n]*\n([\s\S]*?)(```\n)?(<\/orviloArtifact>)/,
    (_, start, content, __, end) => {
      if (content.trim().startsWith('<!DOCTYPE html') || content.trim().startsWith('<html')) {
        return start + content.trim() + end;
      }
      return start + content + (__ || '') + end;
    },
  );

  // Keep existing code blocks that are not part of orviloArtifact
  output = output.replace(
    /^([\s\S]*?)(<orviloThinking>[\s\S]*?<\/orviloThinking>[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*<orviloArtifact[\s\S]*?<\/orviloArtifact>)([\s\S]*)$/,
    (_, before, content, after) => {
      return [before.trim(), content.trim(), after.trim()].filter(Boolean).join('\n\n');
    },
  );

  // If the input contains `orviloArtifact` tags, replace all line breaks with an empty string
  // Use global regex to handle multiple artifacts in the same message
  // Keep artifact markup as one raw HTML segment for the rehype artifact plugin. Preserving
  // script block newlines here can make Markdown parse script text outside the custom tag.
  output = output.replaceAll(ARTIFACT_TAG_REGEX_GLOBAL, (match) =>
    match.replaceAll(/\r?\n|\r/g, ''),
  );

  // if not match, check if it's start with <orviloArtifact but not closed
  const regex = /<orviloArtifact\b(?:(?!\/?>)[\s\S])*$/;
  if (regex.test(output)) {
    output = output.replace(regex, '<orviloArtifact>');
  }

  // Strip newlines inside the orviloAgents tag so attributes spread across lines
  // stay a single contiguous raw HTML node for the rehype agents plugin.
  output = output.replaceAll(AGENTS_TAG_REGEX_GLOBAL, (match) => match.replaceAll(/\r?\n|\r/g, ''));

  return output;
};

// Preprocessing function: ensure two newlines before and after think tags
export const normalizeThinkTags = (input: string) => {
  return (
    input
      // Ensure two newlines before and after <think> tags
      .replaceAll(/([^\n])\s*<think>/g, '$1\n\n<think>')
      .replaceAll(/<think>\s*([^\n])/g, '<think>\n\n$1')
      // Ensure two newlines before and after </think> tags
      .replaceAll(/([^\n])\s*<\/think>/g, '$1\n\n</think>')
      .replaceAll(/<\/think>\s*([^\n])/g, '</think>\n\n$1')
      // Remove excess newlines that may have been introduced
      .replaceAll(/\n{3,}/g, '\n\n')
  );
};
