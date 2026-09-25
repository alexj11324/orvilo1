import type { Page } from '@playwright/test';

/**
 * ARIA inventory: the roles and accessible names a region exposes, flattened
 * from Playwright's `locator.ariaSnapshot()` YAML so two surfaces can be
 * compared control by control. Locally it diffs a reference app against
 * Orvilo ("which buttons does the reference rail have that ours lacks?");
 * in CI it only records Orvilo's own baseline. No third-party snapshot is
 * checked into this repository.
 */

export interface AriaNode {
  /** Nesting level in the snapshot, 0 for top-level entries. */
  depth: number;
  /** Accessible name, or the inline text of a `role: text` entry; '' if none. */
  name: string;
  role: string;
}

const unquoteSingle = (value: string) => value.replaceAll("''", "'");

/**
 * Split a YAML key that Playwright may have single-quoted (it does so when the
 * key contains `:` or other YAML-significant characters) from what follows.
 */
const splitKey = (content: string): { key: string; rest: string } => {
  if (!content.startsWith("'")) return { key: content, rest: '' };
  let index = 1;
  while (index < content.length) {
    if (content[index] === "'") {
      if (content[index + 1] === "'") {
        index += 2;
        continue;
      }
      return { key: unquoteSingle(content.slice(1, index)), rest: content.slice(index + 1) };
    }
    index += 1;
  }
  return { key: unquoteSingle(content.slice(1)), rest: '' };
};

const parseQuotedName = (source: string): { name: string; rest: string } | undefined => {
  const match = /^"((?:[^"\\]|\\.)*)"/.exec(source);
  if (!match) return undefined;
  let name = match[1];
  try {
    name = JSON.parse(`"${match[1]}"`) as string;
  } catch {
    // Keep the raw text if Playwright escaped something JSON does not.
  }
  return { name, rest: source.slice(match[0].length) };
};

const parseScalar = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) return parseQuotedName(trimmed)?.name ?? trimmed;
  if (trimmed.startsWith("'")) return splitKey(trimmed).key;
  return trimmed;
};

/**
 * One entry per `- role "name" [attrs]` line. Property lines (`- /url: …`,
 * `- /placeholder: …`) and block-scalar continuations carry no role and are
 * skipped. Regex names (`/pattern/`) are kept as written.
 */
export const parseAriaInventory = (yaml: string): AriaNode[] => {
  const nodes: AriaNode[] = [];
  for (const line of yaml.split('\n')) {
    const match = /^( *)- (.*)$/.exec(line);
    if (!match) continue;
    const depth = Math.floor(match[1].length / 2);
    const { key, rest: afterQuotedKey } = splitKey(match[2].trimEnd());
    const content = key + afterQuotedKey;
    if (content.startsWith('/')) continue;

    const roleMatch = /^([a-z][\w-]*)/i.exec(content);
    if (!roleMatch) continue;
    const role = roleMatch[1];
    let rest = content.slice(role.length).trimStart();
    let name = '';

    const quoted = parseQuotedName(rest);
    if (quoted) {
      name = quoted.name;
      rest = quoted.rest;
    } else if (rest.startsWith('/')) {
      const regex = /^\/(?:[^/\\]|\\.)*\//.exec(rest);
      if (regex) {
        name = regex[0];
        rest = rest.slice(regex[0].length);
      }
    }
    // Attributes such as [level=2] or [disabled] do not take part in pairing.
    rest = rest.replace(/^(\s*\[[^\]]*\])*/, '').trim();
    // `role: inline text` — the text is the node's only content, so it names it.
    if (!name && rest.startsWith(':')) {
      const inline = rest.slice(1).trim();
      if (inline && inline !== '|' && inline !== '>') name = parseScalar(inline);
    }
    nodes.push({ depth, name, role });
  }
  return nodes;
};

export interface AriaDiffOptions {
  /**
   * Names that mean the same control on both sides, keyed by either side's
   * normalized name, e.g. `{ 'add label': 'labels' }`. Applied after
   * normalization.
   */
  aliases?: Record<string, string>;
  /** Roles to leave out of the comparison (e.g. `generic`, `text`). */
  ignoreRoles?: string[];
}

export interface AriaDiff {
  /** Candidate entries with no counterpart in the reference. */
  extra: AriaNode[];
  /** Reference entries with no counterpart in the candidate. */
  missing: AriaNode[];
}

export const normalizeAriaName = (name: string, aliases: Record<string, string> = {}) => {
  const normalized = name.toLowerCase().replaceAll(/\s+/g, ' ').trim();
  const aliasTable = new Map(
    Object.entries(aliases).map(([from, to]) => [
      normalizeAriaName(from),
      to.toLowerCase().replaceAll(/\s+/g, ' ').trim(),
    ]),
  );
  return aliasTable.get(normalized) ?? normalized;
};

/**
 * Pair entries by role and normalized name, as a multiset: two "Remove"
 * buttons in the reference need two in the candidate. Depth is ignored —
 * the two apps nest their wrappers differently, and a control that moved one
 * level is still present.
 */
export const diffAriaInventory = (
  reference: AriaNode[],
  candidate: AriaNode[],
  { aliases = {}, ignoreRoles = [] }: AriaDiffOptions = {},
): AriaDiff => {
  const ignored = new Set(ignoreRoles);
  const keyOf = (node: AriaNode) => `${node.role}\u0000${normalizeAriaName(node.name, aliases)}`;
  const available = new Map<string, number>();
  for (const node of candidate) {
    if (ignored.has(node.role)) continue;
    available.set(keyOf(node), (available.get(keyOf(node)) ?? 0) + 1);
  }

  const missing: AriaNode[] = [];
  const matched = new Map<string, number>();
  for (const node of reference) {
    if (ignored.has(node.role)) continue;
    const key = keyOf(node);
    const left = available.get(key) ?? 0;
    if (left > 0) {
      available.set(key, left - 1);
      matched.set(key, (matched.get(key) ?? 0) + 1);
    } else {
      missing.push(node);
    }
  }

  const extra: AriaNode[] = [];
  for (const node of candidate) {
    if (ignored.has(node.role)) continue;
    const key = keyOf(node);
    const consumed = matched.get(key) ?? 0;
    if (consumed > 0) matched.set(key, consumed - 1);
    else extra.push(node);
  }
  return { extra, missing };
};

export const formatAriaDiff = ({ extra, missing }: AriaDiff): string => {
  const show = (node: AriaNode) => `${'  '.repeat(node.depth)}${node.role} "${node.name}"`;
  return [
    `missing in candidate (${missing.length}):`,
    ...missing.map((node) => `  - ${show(node)}`),
    `extra in candidate (${extra.length}):`,
    ...extra.map((node) => `  + ${show(node)}`),
  ].join('\n');
};

/** Snapshot `selector`'s ARIA tree (first match) and flatten it. */
export const captureAriaInventory = async (
  page: Page,
  selector: string,
): Promise<{ inventory: AriaNode[]; yaml: string }> => {
  const yaml = await page.locator(selector).first().ariaSnapshot();
  return { inventory: parseAriaInventory(yaml), yaml };
};
