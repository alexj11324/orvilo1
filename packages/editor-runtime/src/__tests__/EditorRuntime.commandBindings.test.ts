import { createHeadlessEditor } from '@lobehub/editor/headless';
import {
  LITEXML_APPLY_COMMAND,
  LITEXML_MODIFY_COMMAND,
  LITEXML_MODIFY_WITH_RESULTS_COMMAND,
} from '@lobehub/editor/litexml-commands';
import { COMMAND_PRIORITY_EDITOR, type CommandPayloadType, createCommand } from 'lexical';
import { describe, expect, it, vi } from 'vitest';

import { EditorRuntime } from '../EditorRuntime';

// Keep real SDK listeners: LiteXML handlers mutate then return false to allow
// propagation. A mocked dispatch would conceal this actual backend contract.
describe('EditorRuntime command backend binding', () => {
  it('persists a real SDK replacement despite a false dispatch result', async () => {
    const headless = createHeadlessEditor();
    try {
      headless.hydrateMarkdown('Original text');
      const runtime = new EditorRuntime();
      runtime.setEditor(headless.kernel);
      const dispatch = vi.spyOn(headless.kernel, 'dispatchCommand');
      const after = vi.fn();
      runtime.setAfterMutateHandler(after);
      const result = await runtime.replaceText({ searchText: 'Original', newText: 'Updated' });
      expect(dispatch).toHaveReturnedWith(false);
      expect(result.replacementCount).toBe(1);
      expect(headless.export().markdown).toContain('Updated text');
      expect(headless.export().markdown).not.toContain('Original text');
      expect(after).toHaveBeenCalledTimes(1);
    } finally {
      headless.destroy();
    }
  });
  it('persists a real SDK node modification using backend-confirmed results', async () => {
    const headless = createHeadlessEditor();
    try {
      headless.hydrateMarkdown('Original text');
      const xml = headless.export({ litexml: true }).litexml;
      const id = xml?.match(/<p id="([^"]+)"/u)?.[1];
      if (!id) throw new Error('Fixture paragraph must have a stable LiteXML ID');
      const runtime = new EditorRuntime();
      runtime.setEditor(headless.kernel);
      const after = vi.fn();
      runtime.setAfterMutateHandler(after);
      const result = await runtime.modifyNodes({
        operations: [{ action: 'modify', litexml: `<p id="${id}">Updated paragraph</p>` }],
      });
      expect(result.successCount).toBe(1);
      expect(headless.export().markdown).toContain('Updated paragraph');
      expect(headless.export().markdown).not.toContain('Original text');
      expect(after).toHaveBeenCalledTimes(1);
    } finally {
      headless.destroy();
    }
  });
  it('uses explicit command objects with real forwarding listeners for both mutation APIs', async () => {
    const headless = createHeadlessEditor();
    const releases: Array<() => void> = [];
    try {
      headless.hydrateMarkdown('Original text');
      const lexical = headless.kernel.getLexicalEditor();
      if (!lexical) throw new Error('Real headless editor must expose its Lexical instance');
      const apply =
        createCommand<CommandPayloadType<typeof LITEXML_APPLY_COMMAND>>('test-explicit-apply');
      const modify =
        createCommand<CommandPayloadType<typeof LITEXML_MODIFY_COMMAND>>('test-explicit-modify');
      releases.push(
        lexical.registerCommand(
          apply,
          (payload) => {
            headless.kernel.dispatchCommand(LITEXML_APPLY_COMMAND, payload);
            return false;
          },
          COMMAND_PRIORITY_EDITOR,
        ),
      );
      releases.push(
        lexical.registerCommand(
          modify,
          (payload) => {
            headless.kernel.dispatchCommand(LITEXML_MODIFY_COMMAND, payload);
            return false;
          },
          COMMAND_PRIORITY_EDITOR,
        ),
      );
      const runtime = new EditorRuntime();
      const modifyWithResults =
        createCommand<CommandPayloadType<typeof LITEXML_MODIFY_WITH_RESULTS_COMMAND>>(
          'test-explicit-results',
        );
      releases.push(
        lexical.registerCommand(
          modifyWithResults,
          (payload) => {
            headless.kernel.dispatchCommand(LITEXML_MODIFY_WITH_RESULTS_COMMAND, payload);
            return false;
          },
          COMMAND_PRIORITY_EDITOR,
        ),
      );
      runtime.setEditor(headless.kernel, { apply, modify, modifyWithResults });
      const after = vi.fn();
      runtime.setAfterMutateHandler(after);
      const replaced = await runtime.replaceText({ searchText: 'Original', newText: 'Replaced' });
      expect(replaced.replacementCount).toBe(1);
      expect(headless.export().markdown).toContain('Replaced text');
      const id = headless.export({ litexml: true }).litexml?.match(/<p id="([^"]+)"/u)?.[1];
      if (!id) throw new Error('Fixture paragraph must retain its LiteXML ID');
      const modified = await runtime.modifyNodes({
        operations: [{ action: 'modify', litexml: `<p id="${id}">Explicit binding applied</p>` }],
      });
      expect(modified.successCount).toBe(1);
      expect(headless.export().markdown).toContain('Explicit binding applied');
      expect(headless.export().markdown).not.toContain('Replaced text');
      expect(after).toHaveBeenCalledTimes(2);
    } finally {
      for (const release of releases) release();
      headless.destroy();
    }
  });
});
