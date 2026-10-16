import { escapeXmlAttr, escapeXmlContent } from '../search/xmlEscape';

export interface OfficialToolResultItem {
  author?: string;
  description?: string;
  enabled?: boolean;
  identifier: string;
  installed?: boolean;
  name: string;
  status?: 'connected' | 'error' | 'pending_auth';
  type: 'builtin' | 'composio';
}

/**
 * Convert official tools search results to compact XML format for token efficiency
 *
 * @example
 * ```typescript
 * const tools = [
 *   { identifier: "web-browsing", name: "Web Browsing", type: "builtin", enabled: true }
 * ];
 * const xml = officialToolsResultsPrompt(tools);
 * // Output:
 * // <officialTools>
 * //   <tool id="web-browsing" name="Web Browsing" type="builtin" enabled="true" />
 * // </officialTools>
 * ```
 */
export const officialToolsResultsPrompt = (tools: OfficialToolResultItem[]): string => {
  if (tools.length === 0) return '<officialTools />';

  const items = tools
    .map((tool) => {
      const attrs: string[] = [
        `id="${escapeXmlAttr(tool.identifier)}"`,
        `name="${escapeXmlAttr(tool.name)}"`,
        `type="${escapeXmlAttr(tool.type)}"`,
      ];

      if (tool.enabled) attrs.push('enabled="true"');
      if (tool.installed) attrs.push('installed="true"');
      if (tool.status) attrs.push(`status="${escapeXmlAttr(tool.status)}"`);
      if (tool.author) attrs.push(`author="${escapeXmlAttr(tool.author)}"`);

      const attrString = attrs.join(' ');
      const content = tool.description ? escapeXmlContent(tool.description) : '';

      return content ? `  <tool ${attrString}>${content}</tool>` : `  <tool ${attrString} />`;
    })
    .join('\n');

  return `<officialTools>\n${items}\n</officialTools>`;
};
