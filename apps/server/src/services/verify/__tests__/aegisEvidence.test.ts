// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  appendAegisDeliverableEvidence,
  evaluateAegisEvidenceRequirement,
  extractAegisOperationMetadata,
  parseAegisCloseout,
} from '../aegisEvidence';

const closeout = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    confidence: 'A',
    evidence: [{ action: 'edited foo.ts', covered: 'goal', result: 'passed' }],
    goalClosure: 'done',
    schema: 'orvilo.aegis-closeout.v0',
    summary: 'shipped',
    ...overrides,
  });

const enabledMetadata = (artifacts: { content: string; path: string }[] = []) => ({
  aegis: { artifacts, collectedAt: '2026-10-02T00:00:00Z', enabled: true },
});

describe('extractAegisOperationMetadata', () => {
  it('returns undefined for missing or malformed metadata', () => {
    expect(extractAegisOperationMetadata(undefined)).toBeUndefined();
    expect(extractAegisOperationMetadata(null)).toBeUndefined();
    expect(extractAegisOperationMetadata({})).toBeUndefined();
    expect(extractAegisOperationMetadata({ aegis: 'nope' })).toBeUndefined();
  });

  it('reads enabled + artifacts and drops malformed files', () => {
    const meta = extractAegisOperationMetadata(
      enabledMetadata([{ content: '{}', path: '.aegis/closeout.json' }, { content: 'x' } as never]),
    );
    expect(meta?.enabled).toBe(true);
    expect(meta?.artifacts).toEqual([{ content: '{}', path: '.aegis/closeout.json' }]);
  });
});

describe('parseAegisCloseout', () => {
  it('parses a well-formed closeout', () => {
    const parsed = parseAegisCloseout(closeout());
    expect(parsed?.confidence).toBe('A');
    expect(parsed?.goalClosure).toBe('done');
  });

  it('rejects invalid JSON, non-objects, and foreign schemas', () => {
    expect(parseAegisCloseout('not json')).toBeUndefined();
    expect(parseAegisCloseout('[1]')).toBeUndefined();
    expect(parseAegisCloseout(JSON.stringify({ schema: 'other.v1' }))).toBeUndefined();
  });

  it('tolerates a forward closeout schema version', () => {
    expect(parseAegisCloseout(closeout({ schema: 'orvilo.aegis-closeout.v9' }))).toBeDefined();
  });
});

describe('evaluateAegisEvidenceRequirement', () => {
  it('returns not-enabled without the opt-in marker', () => {
    expect(evaluateAegisEvidenceRequirement(undefined)).toBe('not-enabled');
    expect(evaluateAegisEvidenceRequirement({})).toBe('not-enabled');
    expect(evaluateAegisEvidenceRequirement({ aegis: { enabled: false } })).toBe('not-enabled');
    expect(evaluateAegisEvidenceRequirement({ aegis: { enabled: true } })).toBe('requires-review');
  });

  it('requires review when the run produced no artifacts at all', () => {
    expect(evaluateAegisEvidenceRequirement(enabledMetadata())).toBe('requires-review');
  });

  it('requires review on a missing/unparseable closeout', () => {
    expect(
      evaluateAegisEvidenceRequirement(
        enabledMetadata([{ content: 'not json', path: '.aegis/closeout.json' }]),
      ),
    ).toBe('requires-review');
    expect(
      evaluateAegisEvidenceRequirement(
        enabledMetadata([{ content: '{}', path: 'docs/aegis/drift.json' }]),
      ),
    ).toBe('requires-review');
  });

  it('requires review on confidence C or a non-done goalClosure', () => {
    expect(
      evaluateAegisEvidenceRequirement(
        enabledMetadata([{ content: closeout({ confidence: 'C' }), path: '.aegis/closeout.json' }]),
      ),
    ).toBe('requires-review');
    expect(
      evaluateAegisEvidenceRequirement(
        enabledMetadata([
          { content: closeout({ goalClosure: 'blocked' }), path: '.aegis/closeout.json' },
        ]),
      ),
    ).toBe('requires-review');
  });

  it('is satisfied on a well-formed closeout at confidence A or B', () => {
    for (const confidence of ['A', 'B']) {
      expect(
        evaluateAegisEvidenceRequirement(
          enabledMetadata([
            { content: closeout({ confidence }), path: '.aegis/closeout.json' },
            { content: '{}', path: '.aegis/drift.json' },
          ]),
        ),
      ).toBe('satisfied');
    }
  });
});

describe('appendAegisDeliverableEvidence', () => {
  it('passes the deliverable through when aegis is not enabled', () => {
    expect(appendAegisDeliverableEvidence('delivered', undefined)).toBe('delivered');
    expect(appendAegisDeliverableEvidence('delivered', { aegis: { enabled: false } })).toBe(
      'delivered',
    );
    expect(appendAegisDeliverableEvidence('delivered', enabledMetadata())).toBe('delivered');
  });

  it('appends a marked-missing block when enabled with no closeout', () => {
    const out = appendAegisDeliverableEvidence(
      'delivered',
      enabledMetadata([{ content: '{}', path: '.aegis/drift.json' }]),
    );
    expect(out).toContain('# Aegis method-pack evidence');
    expect(out).toContain('No usable `.aegis/closeout.json` was produced');
    expect(out).toContain('.aegis/drift.json');
  });

  it('inlines the closeout summary and remaining reports', () => {
    const out = appendAegisDeliverableEvidence(
      'delivered',
      enabledMetadata([
        { content: closeout({ summary: 'did the thing' }), path: '.aegis/closeout.json' },
        { content: '{"retire":[]}', path: 'docs/aegis/retirement.json' },
      ]),
    );
    expect(out).toContain('confidence: A');
    expect(out).toContain('goalClosure: done');
    expect(out).toContain('summary: did the thing');
    expect(out).toContain('docs/aegis/retirement.json');
    expect(out.startsWith('delivered')).toBe(true);
  });
});
