import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSchema, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';

import { DETAIL_QUERY, GRAPHQL_DOCUMENTS } from './queries';

const SCHEMA_FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__',
  'github-schema.graphql',
);

// sha256 of https://docs.github.com/public/fpt/schema.docs.graphql as
// committed — if the fixture is swapped, update this hash with it.
const SCHEMA_FIXTURE_SHA256 = '8ecdb21a5c3affdeaa0e55bd9174536aa6c69cbb61f20ec796085aa1509c95df';

describe('GitHub GraphQL schema contract', () => {
  it('pins the committed schema fixture by hash', () => {
    const sdl = readFileSync(SCHEMA_FIXTURE_PATH, 'utf8');
    const digest = createHash('sha256').update(sdl).digest('hex');
    expect(digest).toBe(SCHEMA_FIXTURE_SHA256);
  });

  const schema = buildSchema(readFileSync(SCHEMA_FIXTURE_PATH, 'utf8'), {
    assumeValidSDL: true,
  });

  it.each(GRAPHQL_DOCUMENTS.map((entry) => [entry.name, entry.document] as const))(
    'document %s validates against the real GitHub schema',
    (_name, document) => {
      const errors = validate(schema, parse(document));
      expect(errors.map((error) => error.message)).toEqual([]);
    },
  );

  it('requests thread direction on the thread, not the comment (RV01 regression)', () => {
    expect(DETAIL_QUERY).toMatch(/reviewThreads[^]*diffSide/);
    expect(DETAIL_QUERY).toMatch(/reviewThreads[^]*startDiffSide/);
    // PullRequestReviewComment has no `side` field — asserting the field set on
    // the comments connection keeps the original bug from being reintroduced.
    const commentsBlock = DETAIL_QUERY.match(
      /comments\(first: 10\) \{([^}]|\}[^s])*nodes \{([^}]*)\}/,
    );
    expect(commentsBlock?.[2]).toBeTruthy();
    expect(commentsBlock?.[2]).not.toMatch(/\bside\b/);
  });
});
