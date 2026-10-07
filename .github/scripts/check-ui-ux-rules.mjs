import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skill = (name, reference) =>
  `.agents/skills/${name}/${reference ? `references/${reference}.md` : 'SKILL.md'}`;

// Deliberately bounded active policy: upstream examples and historical archives are not owners.
export const POLICY_FILES = [
  'DESIGN.md',
  'DESIGN.dark.md',
  'AGENTS.md',
  skill('react'),
  skill('ux'),
  ...['read', 'feedback', 'act'].map((name) => skill('ux', name)),
  skill('linear-design'),
  skill('linear-ui-parity'),
  ...['implementation-pitfalls', 'discovery'].map((name) => skill('linear-ui-parity', name)),
  skill('clone-website-orvilo', 'orvilo-contract'),
  skill('deep-review', 'dimensions/code-style'),
];

const ownerRoutes = new Map([
  ['DESIGN.md', [skill('react'), skill('ux'), skill('design-system')]],
  ['DESIGN.dark.md', ['DESIGN.md']],
  ['AGENTS.md', ['DESIGN.md', skill('ux'), skill('design-system')]],
  [skill('react'), ['DESIGN.md', skill('ux'), skill('design-system')]],
  [skill('ux'), ['DESIGN.md', skill('react'), skill('design-system')]],
  [skill('linear-design'), ['DESIGN.md', skill('react'), skill('design-system')]],
  [skill('linear-ui-parity'), ['DESIGN.md', skill('linear-design')]],
]);

const retiredMandates = [
  [
    'legacy component priority',
    /@lobehub\/ui\/base-ui[^\n]*(?:first choice|first, then)|reach for[^\n]*@lobehub\/ui\/base-ui[^\n]*first|When base-ui has the component, use it/gi,
  ],
  [
    'categorical 13px ban',
    /there is no 13px token|round to 12 or 14|(?:never use|ban all|no) 13px(?: text| sizes| fonts)/gi,
  ],
  [
    'categorical off-scale rounding',
    /Off-scale spacing values[^\n]*are drift[^\n]*round to the nearest scale step/gi,
  ],
  [
    'Linear reference promoted to token owner',
    /map to the nearest Linear token|must be checked against these tokens before shipping|linear-design[^\n]*owns the token values|linear-design[^\n]*owns (?:approved )?Orvilo (?:tokens|token values|visual values)/gi,
  ],
  [
    'legacy UX layout mandate',
    /Active row uses[^\n]*Block|Spacing\/padding expressed as[^\n]*Flexbox|row through[^\n]*Block variant|spacing through[^\n]*Flexbox/gi,
  ],
];

function markdownLinks(text) {
  return [...text.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)];
}

function localTarget(file, href) {
  if (/^(?:[a-z]+:|#|\/)/i.test(href)) return;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), href.split('#')[0]));
}

function isOwnerLink(target) {
  return /(?:^|\/)DESIGN(?:\.dark)?\.md$|^\.agents\/skills\/(?:react|ux|design-system)\//.test(
    target,
  );
}

// Keep offsets for file/line diagnostics; fenced code and historical quotations are evidence.
function activeProse(text) {
  let fence;
  return text
    .split('\n')
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1][0];
        else if (marker[1][0] === fence) fence = undefined;
        return ' '.repeat(line.length);
      }
      return fence || /^\s*>/.test(line) ? ' '.repeat(line.length) : line;
    })
    .join('\n');
}

export async function checkUIUXRules(root) {
  const failures = [];
  const report = (file, text, index, condition) => {
    failures.push({ file, line: text.slice(0, index).split('\n').length, condition });
  };
  for (const file of POLICY_FILES) {
    let text;
    try {
      text = await readFile(path.join(root, file), 'utf8');
    } catch {
      failures.push({ file, line: 1, condition: 'active policy file is missing or unreadable' });
      continue;
    }
    const links = markdownLinks(text);
    const targets = links.map((match) => localTarget(file, match[1]));
    for (const owner of ownerRoutes.get(file) ?? []) {
      if (!targets.includes(owner)) report(file, text, 0, `missing owner routing link to ${owner}`);
    }
    for (const [index, match] of links.entries()) {
      const target = targets[index];
      if (!target || !isOwnerLink(target)) continue;
      try {
        await access(path.join(root, target));
      } catch {
        report(file, text, match.index, `broken owner link: ${match[1]}`);
      }
    }
    const prose = activeProse(text);
    for (const [condition, pattern] of retiredMandates) {
      for (const match of prose.matchAll(pattern)) report(file, text, match.index, condition);
    }
    if (file === 'DESIGN.dark.md') {
      const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
      if (!frontmatter) report(file, text, 0, 'dark companion must declare color-only frontmatter');
      else {
        for (const match of frontmatter[1].matchAll(
          /^(themeable|typography|type|spacing|radius|controls|elevation):/gm,
        )) {
          report(
            file,
            text,
            frontmatter.index + text.indexOf(frontmatter[1]) + match.index,
            `duplicate shared table: ${match[1]} belongs in DESIGN.md`,
          );
        }
      }
    }
  }
  try {
    const lock = JSON.parse(await readFile(path.join(root, 'skills-lock.json'), 'utf8'));
    const selected = lock.skills?.['design-system'];
    if (
      selected?.source !== 'nextlevelbuilder/ui-ux-pro-max-skill' ||
      selected?.sourceType !== 'github' ||
      selected?.skillPath !== '.claude/skills/design-system/SKILL.md'
    ) {
      failures.push({
        file: 'skills-lock.json',
        line: 1,
        condition: 'design-system must select the installed nextlevelbuilder GitHub skill',
      });
    }
  } catch {
    failures.push({
      file: 'skills-lock.json',
      line: 1,
      condition: 'skill selection lock is missing or invalid JSON',
    });
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url));
  const failures = await checkUIUXRules(root);
  for (const { file, line, condition } of failures) console.error(`${file}:${line}: ${condition}`);
  if (failures.length) process.exitCode = 1;
  else
    console.log(
      'UI/UX rule guard passed (bounded ownership, links, tables, and retired mandates).',
    );
}
