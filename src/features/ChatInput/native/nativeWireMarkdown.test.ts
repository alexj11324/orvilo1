import { createHeadlessEditor } from '@orvilo/editor-runtime/headless';
import { getFixedT } from 'i18next';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';

import { nativeChatEmbedPlugins } from './embedPlugins';
import { INSERT_REFER_TOPIC_COMMAND } from './ReferTopicPlugin';

function make() {
  const editor = createHeadlessEditor({
    additionalPlugins: nativeChatEmbedPlugins(getFixedT('en', 'editor')),
  });
  editor.kernel.getLexicalEditor()?.setEditable(true);
  return editor;
}
const literal =
  '<!--orvilo-native-raw-0--> ordinary <refer_topic name="literal" id="not-a-node" />\n汉字 & notes';
function addPlain(editor: ReturnType<typeof make>) {
  editor.kernel.getLexicalEditor()?.update(
    () => {
      $getRoot().append($createParagraphNode().append($createTextNode(literal)));
    },
    { discrete: true },
  );
}

describe('structured native raw wire serializer', () => {
  it('preserves multiple real Unicode tags and ordinary similar text without marker collision', () => {
    const editor = make();
    const ordinary = make();
    try {
      addPlain(ordinary);
      addPlain(editor);
      const baseline = String(ordinary.kernel.getDocument('markdown')).trim();
      const lexical = editor.kernel.getLexicalEditor();
      if (!lexical) throw new Error('Native kernel missing');
      lexical.update(
        () => {
          const paragraph = $createParagraphNode();
          $getRoot().append(paragraph);
          paragraph.selectEnd();
          lexical.dispatchCommand(INSERT_REFER_TOPIC_COMMAND, {
            topicId: 'topic<&"',
            topicTitle: '引用 & "quoted"',
          });
          lexical.dispatchCommand(INSERT_REFER_TOPIC_COMMAND, {
            topicId: '第二个',
            topicTitle: '多行\n内容',
          });
        },
        { discrete: true },
      );
      const markdown = String(editor.kernel.getDocument('markdown'));
      expect(markdown).toContain(baseline);
      expect(markdown).toContain(
        '<refer_topic name="引用 &amp; &quot;quoted&quot;" id="topic&lt;&amp;&quot;" />',
      );
      expect(markdown).toContain('<refer_topic name="多行\n内容" id="第二个" />');
      expect(markdown).not.toContain('<!--orvilo-native-raw-1-');
      const restored = make();
      try {
        restored.kernel.setDocument('litexml', editor.kernel.getDocument('litexml'), {
          keepId: true,
        });
        expect(String(restored.kernel.getDocument('markdown'))).toContain(
          'id="topic&lt;&amp;&quot;"',
        );
      } finally {
        restored.destroy();
      }
    } finally {
      editor.destroy();
      ordinary.destroy();
    }
  });
});
