import type { ThemeRegistration } from 'shiki';

/** Full grammar scope coverage, with syntax colors mapped to DESIGN semantic roles. */
export const lobeSyntaxTheme: ThemeRegistration = {
  displayName: 'Lobe Theme',
  name: 'lobe-theme',
  semanticHighlighting: true,
  colors: { 'editor.background': 'var(--card)' },
  tokenColors: [
    { settings: { foreground: 'var(--foreground)' } },
    {
      scope: 'string',
      settings: { foreground: 'var(--success-text)' },
    },
    {
      scope: 'punctuation, constant.other.symbol',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'constant.character.escape, text.html constant.character.entity.named',
      settings: { foreground: 'var(--foreground)' },
    },
    {
      scope: 'constant.language.boolean',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'constant.numeric',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope:
        'variable, variable.parameter, support.variable, variable.language, support.constant, meta.definition.variable entity.name.function, meta.function-call.arguments',
      settings: { foreground: 'var(--foreground)' },
    },
    {
      scope: 'keyword.other',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'keyword, modifier, variable.language.this, support.type.object, constant.language',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'entity.name.function, support.function',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'storage.type, storage.modifier, storage.control',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'support.module, support.node',
      settings: {
        fontStyle: 'italic',
        foreground: 'var(--destructive-text)',
      },
    },
    {
      scope: 'support.type, constant.other.key',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'entity.name.type, entity.other.inherited-class, entity.other',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'comment',
      settings: {
        fontStyle: 'italic',
        foreground: 'var(--foreground-tertiary)',
      },
    },
    {
      scope: 'comment punctuation.definition.comment, string.quoted.docstring',
      settings: {
        fontStyle: 'italic',
        foreground: 'var(--foreground-tertiary)',
      },
    },
    {
      scope: 'punctuation',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'entity.name, entity.name.type.class, support.type, support.class, meta.use',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'variable.object.property, meta.field.declaration entity.name.function',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'meta.definition.method entity.name.function',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'meta.function entity.name.function',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope:
        'template.expression.begin, template.expression.end, punctuation.definition.template-expression.begin, punctuation.definition.template-expression.end',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'meta.embedded, source.groovy.embedded, meta.template.expression',
      settings: { foreground: 'var(--foreground)' },
    },
    {
      scope: 'entity.name.tag.yaml',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope:
        'meta.object-literal.key, meta.object-literal.key string, support.type.property-name.json',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'constant.language.json',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'entity.other.attribute-name.class',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'entity.other.attribute-name.id',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'source.css entity.name.tag',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'support.type.property-name.css',
      settings: { foreground: 'var(--muted-foreground)' },
    },
    {
      scope: 'meta.tag, punctuation.definition.tag',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'entity.name.tag',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'entity.other.attribute-name',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'punctuation.definition.entity.html',
      settings: { foreground: 'var(--foreground)' },
    },
    {
      scope: 'markup.heading',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'text.html.markdown meta.link.inline, meta.link.reference',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'text.html.markdown beginning.punctuation.definition.list',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'markup.italic',
      settings: {
        fontStyle: 'italic',
        foreground: 'var(--destructive-text)',
      },
    },
    {
      scope: 'markup.bold',
      settings: {
        fontStyle: 'bold',
        foreground: 'var(--destructive-text)',
      },
    },
    {
      scope: 'markup.bold markup.italic, markup.italic markup.bold',
      settings: {
        fontStyle: 'italic bold',
        foreground: 'var(--destructive-text)',
      },
    },
    {
      scope: 'markup.fenced_code.block.markdown punctuation.definition.markdown',
      settings: { foreground: 'var(--success-text)' },
    },
    {
      scope: 'markup.inline.raw.string.markdown',
      settings: { foreground: 'var(--success-text)' },
    },
    {
      scope: 'keyword.other.definition.ini',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'entity.name.section.group-title.ini',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'source.cs meta.class.identifier storage.type',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'source.cs meta.method.identifier entity.name.function',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'source.cs meta.method-call meta.method, source.cs entity.name.function',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'source.cs storage.type',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'source.cs meta.method.return-type',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'source.cs meta.preprocessor',
      settings: { foreground: 'var(--foreground-tertiary)' },
    },
    {
      scope: 'source.cs entity.name.type.namespace',
      settings: { foreground: 'var(--foreground)' },
    },
    {
      scope: 'meta.jsx.children, SXNested',
      settings: { foreground: 'var(--foreground)' },
    },
    {
      scope: 'support.class.component',
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: 'source.cpp meta.block variable.other',
      settings: { foreground: 'var(--foreground)' },
    },
    {
      scope: 'source.python meta.member.access.python',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'source.python meta.function-call.python, meta.function-call.arguments',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'meta.block',
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: 'entity.name.function.call',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: 'source.php support.other.namespace, source.php meta.use support.class',
      settings: { foreground: 'var(--foreground)' },
    },
    {
      scope: 'constant.keyword',
      settings: {
        fontStyle: 'italic',
        foreground: 'var(--info-text)',
      },
    },
    {
      scope: 'entity.name.function',
      settings: { foreground: 'var(--info-text)' },
    },
    {
      settings: {
        background: '#212121',
        foreground: 'var(--foreground)',
      },
    },
    {
      scope: ['constant.other.placeholder'],
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: ['markup.deleted'],
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: ['markup.inserted'],
      settings: { foreground: 'var(--success-text)' },
    },
    {
      scope: ['markup.underline'],
      settings: { fontStyle: 'underline' },
    },
    {
      scope: ['keyword.control'],
      settings: {
        fontStyle: 'italic',
        foreground: 'var(--info-text)',
      },
    },
    {
      scope: ['variable.parameter'],
      settings: { fontStyle: 'italic' },
    },
    {
      scope: ['variable.parameter.function.language.special.self.python'],
      settings: {
        fontStyle: 'italic',
        foreground: 'var(--destructive-text)',
      },
    },
    {
      scope: ['constant.character.format.placeholder.other.python'],
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: ['markup.quote'],
      settings: {
        fontStyle: 'italic',
        foreground: 'var(--info-text)',
      },
    },
    {
      scope: ['punctuation.definition.quote'],
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: ['meta.structure.dictionary.json support.type.property-name.json'],
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: [
        'meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json support.type.property-name.json',
      ],
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: [
        'meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json support.type.property-name.json',
      ],
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: [
        'meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json support.type.property-name.json',
      ],
      settings: { foreground: 'var(--destructive-text)' },
    },
    {
      scope: [
        'meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json support.type.property-name.json',
      ],
      settings: { foreground: 'var(--warning-text)' },
    },
    {
      scope: [
        'meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json support.type.property-name.json',
      ],
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: [
        'meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json support.type.property-name.json',
      ],
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: [
        'meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json support.type.property-name.json',
      ],
      settings: { foreground: 'var(--info-text)' },
    },
    {
      scope: [
        'meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json meta.structure.dictionary.value.json meta.structure.dictionary.json support.type.property-name.json',
      ],
      settings: { foreground: 'var(--success-text)' },
    },
  ],
  type: 'dark' as const,
};
