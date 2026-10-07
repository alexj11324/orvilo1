/** @vitest-environment node */
import type { IPlugin } from '@lobehub/editor';
import {
  createHeadlessEditor,
  DEFAULT_HEADLESS_EDITOR_PLUGINS,
  LinkPlugin,
  moment,
} from '@lobehub/editor';
import { afterEach, describe, expect, it } from 'vitest';

import { DESCRIPTION_REFERENCE_SCHEMA } from '@/libs/editor/descriptionReference';

import { insertDescriptionReference, normalizeDescriptionReferenceLinks } from './actions';
import { createDescriptionReferenceSchemaRules } from './schemaRules';

const origin = 'https://orvilo.example';
const editors: ReturnType<typeof createHeadlessEditor>[] = [];
const createEditor = () => {
  const schemaRules = createDescriptionReferenceSchemaRules(origin);
  const plugins = DEFAULT_HEADLESS_EDITOR_PLUGINS.map((plugin): IPlugin =>
    Array.isArray(plugin) && plugin[0] === LinkPlugin ? [LinkPlugin, { schemaRules }] : plugin,
  );
  const editor = createHeadlessEditor({ plugins });
  editors.push(editor);
  return editor;
};

const paragraphChildren = (editor: ReturnType<typeof createEditor>) =>
  editor
    .export()
    .editorData.root.children.flatMap((node) =>
      'children' in node && Array.isArray(node.children) ? node.children : [],
    );

afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe('real description editor reference roundtrip', () => {
  it('normalizes typed links, strips private previews and reloads JSON and markdown', async () => {
    const editor = createEditor();
    editor.hydrateMarkdown(
      `Before [Private saved title](https://github.com/acme/widgets/pull/7) ` +
        `[Issue preview](${origin}/task/T-7) [Website](https://example.com) after`,
    );
    normalizeDescriptionReferenceLinks(editor.kernel, origin);
    await moment();
    const snapshot = editor.export();
    const nodes = paragraphChildren(editor);
    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'schema-link',
          schemaType: DESCRIPTION_REFERENCE_SCHEMA,
          title: 'gh:github.com:acme:widgets:7',
          payload: {
            id: 'gh:github.com:acme:widgets:7',
            kind: 'pull-request',
            url: 'https://github.com/acme/widgets/pull/7',
          },
        }),
        expect.objectContaining({
          type: 'schema-link',
          payload: { id: 'T-7', kind: 'issue', url: `${origin}/task/T-7` },
        }),
        expect.objectContaining({ type: 'link', url: 'https://example.com' }),
      ]),
    );
    expect(JSON.stringify(snapshot)).not.toContain('Private saved title');
    expect(JSON.stringify(snapshot)).not.toContain('Issue preview');
    expect(snapshot.markdown).toContain('https://github.com/acme/widgets/pull/7');
    expect(snapshot.markdown).toContain(`${origin}/task/T-7`);
    const reloaded = createEditor();
    reloaded.hydrateEditorData(snapshot.editorData, { keepId: true });
    await moment();
    expect(paragraphChildren(reloaded)).toEqual(nodes);
    const fromMarkdown = createEditor();
    fromMarkdown.hydrateMarkdown(snapshot.markdown);
    normalizeDescriptionReferenceLinks(fromMarkdown.kernel, origin);
    await moment();
    expect(paragraphChildren(fromMarkdown)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schemaType: DESCRIPTION_REFERENCE_SCHEMA, title: 'T-7' }),
      ]),
    );
  });

  it('rejects insertion into a read-only editor without changing the saved description', async () => {
    const editor = createEditor();
    editor.hydrateMarkdown('Description');
    await moment();
    const before = editor.export();
    editor.kernel.getLexicalEditor()!.setEditable(false);
    expect(insertDescriptionReference(editor.kernel, `${origin}/task/T-7`, origin)).toBe(false);
    expect(insertDescriptionReference(editor.kernel, 'javascript:alert(1)', origin)).toBe(false);
    expect(editor.export()).toEqual(before);
  });

  it('canonicalizes entire imported schema nodes before markdown/export can open a different URL', async () => {
    const editor = createEditor();
    const payload = {
      id: 'gh:github.com:acme:widgets:7',
      kind: 'pull-request',
      url: 'https://github.com/acme/widgets/pull/7',
    };
    editor.hydrate({
      type: 'json',
      content: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'paragraph',
              version: 1,
              format: '',
              indent: 0,
              direction: null,
              children: [
                {
                  type: 'schema-link',
                  version: 1,
                  schemaType: DESCRIPTION_REFERENCE_SCHEMA,
                  payload: { ...payload, title: 'Private payload snapshot' },
                  url: 'javascript:alert(1)',
                  title: 'Private top-level snapshot',
                },
              ],
            },
          ],
        },
      },
    });
    normalizeDescriptionReferenceLinks(editor.kernel, origin);
    await moment();
    const snapshot = editor.export();
    expect(paragraphChildren(editor)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'schema-link', url: '', title: '', payload: null }),
      ]),
    );
    expect(JSON.stringify(snapshot)).not.toContain('javascript:');
    expect(JSON.stringify(snapshot)).not.toContain('Private');
  });
});
