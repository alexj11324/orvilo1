import type { OpenAIChatMessage } from '@orvilo/types';

export const LANG_DETECT_PROMPT_VERSION = 'v1';

export const LANG_DETECT_JSON_SCHEMA = {
  name: 'lang_detect',
  schema: {
    additionalProperties: false,
    properties: {
      locale: { description: 'The detected BCP-47 locale code, e.g. en-US', type: 'string' },
    },
    required: ['locale'],
    type: 'object' as const,
  },
  strict: true,
};

export const chainLangDetect = (content: string): { messages: OpenAIChatMessage[] } => ({
  messages: [
    {
      content:
        '你是一名精通全世界语言的语言专家，你需要识别用户输入的内容，以一个 JSON 对象 {"locale": "国际标准 locale"} 进行输出',
      role: 'system',
    },
    {
      content: '{你好}',
      role: 'user',
    },
    {
      content: '{"locale": "zh-CN"}',
      role: 'assistant',
    },
    {
      content: '{hello}',
      role: 'user',
    },
    {
      content: '{"locale": "en-US"}',
      role: 'assistant',
    },
    {
      content: `{${content}}`,
      role: 'user',
    },
  ],
});
