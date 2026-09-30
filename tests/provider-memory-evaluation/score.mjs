import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function scoreRecall(corpus, observations) {
  let relevant = 0;
  let retrievedRelevant = 0;
  let falseRecall = 0;
  let duplicate = 0;
  let missing = 0;
  for (const query of corpus.queries) {
    relevant += query.relevant.length;
    const result = observations.find((row) => row.queryId === query.id);
    if (!result) {
      missing += 1;
      continue;
    }
    const ids = result.ids.slice(0, corpus.topK);
    const unique = new Set(ids);
    duplicate += ids.length - unique.size;
    retrievedRelevant += query.relevant.filter((id) => unique.has(id)).length;
    falseRecall += ids.filter((id) => !query.relevant.includes(id)).length;
  }
  return { duplicate, falseRecall, missing, recall: relevant ? retrievedRelevant / relevant : 1 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const corpus = JSON.parse(await readFile(new URL('./recall-corpus.json', import.meta.url)));
  const observations = JSON.parse(await readFile(process.argv[2], 'utf8'));
  process.stdout.write(`${JSON.stringify(scoreRecall(corpus, observations), null, 2)}\n`);
}
