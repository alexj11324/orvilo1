import type { ChatStreamPayload } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { chainLangDetect } from '../langDetect';

// 描述测试块
describe('chainLangDetect', () => {
  // 测试用例：验证函数返回的结构
  it('should return a payload with the correct structure and embedded user content', () => {
    // 用户输入的内容
    const userContent = 'Hola';

    // 预期的返回值结构
    const expectedPayload: Partial<ChatStreamPayload> = {
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
          content: `{${userContent}}`,
          role: 'user',
        },
      ],
    };

    // 执行函数并获取结果
    const result = chainLangDetect(userContent);

    // 断言结果是否符合预期
    expect(result).toEqual(expectedPayload);
  });
});
