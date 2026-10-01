import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { scoreRecall } from './score.mjs';

const corpus = JSON.parse(await readFile(new URL('./recall-corpus.json', import.meta.url)));
const complete = corpus.queries.map((query) => ({ ids: query.relevant, queryId: query.id }));

test('reports complete reference labels without claiming integration', () => {
  assert.deepEqual(scoreRecall(corpus, complete), {
    duplicate: 0,
    falseRecall: 0,
    missing: 0,
    recall: 1,
  });
});

test('counts foreign, stale, revoked and unrelated retrieval as false recall', () => {
  const observed = complete.map((row) =>
    row.queryId === 'en-recall'
      ? {
          ...row,
          ids: [
            'foreign-experience',
            'stale-experience',
            'revoked-preference',
            'unrelated-experience',
            'en-experience',
          ],
        }
      : row,
  );
  assert.equal(scoreRecall(corpus, observed).falseRecall, 4);
  assert.equal(scoreRecall(corpus, observed).recall, 0.75);
});

test('missing queries and duplicate results remain visible', () => {
  const result = scoreRecall(corpus, [
    { queryId: 'zh-recall', ids: ['zh-experience', 'zh-experience'] },
  ]);
  assert.equal(result.missing, 3);
  assert.equal(result.duplicate, 1);
  assert.equal(result.recall, 0.25);
});
