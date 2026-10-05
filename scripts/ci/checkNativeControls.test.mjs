import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scanSource } from './checkNativeControls.mjs';

const guard = path.resolve(import.meta.dirname, 'checkNativeControls.mjs');
const ROOT = path.resolve(import.meta.dirname, '../..');

const withFixtureDir = (files, fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'orvilo-controls-gate-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(path.join(dir, name), source);
    }
    return fn(dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
};

const runGate = (dir) => {
  try {
    return {
      code: 0,
      out: execFileSync(process.execPath, [guard, '--scan-dir', dir], {
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    };
  } catch (error) {
    return { code: error.status, out: String(error.stderr ?? error.stdout) };
  }
};

test('flags the #403-era Settings→Agents markup (lobehub controls + raw button)', () => {
  const source = `
import { Flexbox, TooltipGroup } from '@lobehub/ui';
import { Button, Segmented, Select, Text } from '@lobehub/ui/base-ui';

export const Card = () => (
  <Flexbox horizontal>
    <Text>Provider</Text>
    <Select options={[]} />
    <Segmented options={[]} />
    <Button size="small" type="text">Retry</Button>
    <TooltipGroup>
      <button type="button"><span>x</span></button>
    </TooltipGroup>
  </Flexbox>
);`;
  const violations = scanSource('src/features/Settings/agents/Card.tsx', source);
  assert.deepEqual(violations.map((v) => v.rule).sort(), [
    'lobehub-form-control',
    'native-control',
  ]);
  assert.ok(
    violations.find((v) => v.rule === 'lobehub-form-control').detail.includes('Button'),
    'names the banned imports',
  );
});

test('flags every native form tag and ad-hoc select styling', () => {
  const source = `
export const Form = () => (
  <div>
    <select className="appearance-none form-select"><option /></select>
    <input type="text" />
    <textarea rows={3} />
    <button type="submit">Save</button>
  </div>
);`;
  const violations = scanSource('src/features/x/F.tsx', source);
  assert.equal(violations.filter((v) => v.rule === 'native-control').length, 4);
  assert.ok(violations.some((v) => v.rule === 'adhoc-select-style'));
});

test('ignores hidden inputs, comments, and tests', () => {
  const source = `
export const Form = () => (
  <form method="post">
    <input name="xsrf" type="hidden" value={x} />
    <input name="code" type={"hidden"} value={y} />
    {/* <button>mentioned in a comment</button> */}
    // <select>in a line comment</select>
  </form>
);`;
  assert.equal(scanSource('src/features/x/F.tsx', source).length, 0);
});

test('does not flag design-system or capitalized components', () => {
  const source = `
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export const Form = () => (
  <div>
    <Select><Button /></Select>
    <Input />
    <InputField />
    <MySelectThing />
  </div>
);`;
  assert.equal(scanSource('src/features/x/F.tsx', source).length, 0);
});

test('CLI fails on the bad fixture and passes on a clean one', () => {
  const bad = `export const X = () => <select><option /></select>;`;
  const good = `export const X = () => <div>ok</div>;`;
  withFixtureDir({ 'Bad.tsx': bad, 'Good.tsx': good }, (dir) => {
    const result = runGate(dir);
    assert.equal(result.code, 1);
    assert.match(result.out, /Bad\.tsx:1 \[native-control\]/);
    assert.doesNotMatch(result.out, /Good\.tsx/);
  });
});

test('the rebuilt HeterogeneousAgentStatusCard passes the gate', () => {
  const result = runGate(path.join(ROOT, 'src/routes/(main)/agent/profile/features/ProfileEditor'));
  assert.equal(result.code, 0, result.out);
});
