import type { AIChatModelCard } from '../types/aiModel';

const giteeaiChatModels: AIChatModelCard[] = [
  {
    abilities: {
      reasoning: true,
    },
    contextWindowTokens: 32_000,
    description:
      'A DeepSeek-R1 distilled model based on Qwen2.5-Math-1.5B. Reinforcement learning and cold-start data optimize reasoning performance, setting new multi-task benchmarks for open models.',
    displayName: 'DeepSeek R1 Distill Qwen 1.5B',
    enabled: true,
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'DeepSeek-R1-Distill-Qwen-1.5B',
    type: 'chat',
  },
  {
    abilities: {
      reasoning: true,
    },
    contextWindowTokens: 32_000,
    description:
      'A DeepSeek-R1 distilled model based on Qwen2.5-Math-7B. Reinforcement learning and cold-start data optimize reasoning performance, setting new multi-task benchmarks for open models.',
    displayName: 'DeepSeek R1 Distill Qwen 7B',
    enabled: true,
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'DeepSeek-R1-Distill-Qwen-7B',
    type: 'chat',
  },
  {
    abilities: {
      reasoning: true,
    },
    contextWindowTokens: 32_000,
    description:
      'A DeepSeek-R1 distilled model based on Qwen2.5-14B. Reinforcement learning and cold-start data optimize reasoning performance, setting new multi-task benchmarks for open models.',
    displayName: 'DeepSeek R1 Distill Qwen 14B',
    enabled: true,
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'DeepSeek-R1-Distill-Qwen-14B',
    type: 'chat',
  },
  {
    abilities: {
      reasoning: true,
    },
    contextWindowTokens: 32_000,
    description:
      'The DeepSeek-R1 series improves reasoning performance with reinforcement learning and cold-start data, setting new multi-task benchmarks for open models and surpassing OpenAI o1-mini.',
    displayName: 'DeepSeek R1 Distill Qwen 32B',
    enabled: true,
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'DeepSeek-R1-Distill-Qwen-32B',
    type: 'chat',
  },
  {
    abilities: {
      reasoning: true,
    },
    contextWindowTokens: 32_000,
    description:
      'QwQ-32B-Preview is an innovative NLP model that efficiently handles complex dialogue generation and context understanding.',
    displayName: 'QwQ 32B Preview',
    enabled: true,
    family: 'qwen',
    generation: 'qwq',
    id: 'QwQ-32B-Preview',
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
    },
    contextWindowTokens: 16_000,
    description:
      'Qwen2.5-72B-Instruct supports 16k context and generates long text beyond 8K. It supports function calling and seamless external system integration, greatly improving flexibility and extensibility. The model has significantly more knowledge and much stronger coding and math capabilities, with support for 29+ languages.',
    displayName: 'Qwen2.5 72B Instruct',
    enabled: true,
    family: 'qwen',
    generation: 'qwen2.5',
    id: 'Qwen2.5-72B-Instruct',
    type: 'chat',
  },
  {
    contextWindowTokens: 32_000,
    description:
      'Qwen2.5-32B-Instruct is a 32B-parameter LLM with balanced performance, optimized for Chinese and multilingual scenarios, supporting intelligent Q&A and content generation.',
    displayName: 'Qwen2.5 32B Instruct',
    enabled: true,
    family: 'qwen',
    generation: 'qwen2.5',
    id: 'Qwen2.5-32B-Instruct',
    type: 'chat',
  },
  {
    contextWindowTokens: 24_000,
    description:
      'Qwen2.5-14B-Instruct is a 14B-parameter LLM with strong performance, optimized for Chinese and multilingual scenarios, supporting intelligent Q&A and content generation.',
    displayName: 'Qwen2.5 14B Instruct',
    enabled: true,
    family: 'qwen',
    generation: 'qwen2.5',
    id: 'Qwen2.5-14B-Instruct',
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
    },
    contextWindowTokens: 32_000,
    description:
      'Qwen2.5-7B-Instruct is a 7B-parameter LLM that supports function calling and seamless external system integration, greatly improving flexibility and extensibility. It is optimized for Chinese and multilingual scenarios, supporting intelligent Q&A and content generation.',
    displayName: 'Qwen2.5 7B Instruct',
    enabled: true,
    family: 'qwen',
    generation: 'qwen2.5',
    id: 'Qwen2.5-7B-Instruct',
    type: 'chat',
  },
  {
    contextWindowTokens: 32_000,
    description:
      'Qwen2 is the latest Qwen series, supporting a 128k context window. Compared with today’s best open models, Qwen2-72B significantly surpasses leading models in natural language understanding, knowledge, code, math, and multilingual capabilities.',
    displayName: 'Qwen2 72B Instruct',
    family: 'qwen',
    generation: 'qwen2',
    id: 'Qwen2-72B-Instruct',
    type: 'chat',
  },
  {
    contextWindowTokens: 24_000,
    description:
      'Qwen2 is the latest Qwen series, surpassing the best open models of similar size and even larger models. Qwen2 7B shows significant advantages on multiple benchmarks, especially in code and Chinese understanding.',
    displayName: 'Qwen2 7B Instruct',
    family: 'qwen',
    generation: 'qwen2',
    id: 'Qwen2-7B-Instruct',
    type: 'chat',
  },
  {
    contextWindowTokens: 32_000,
    description:
      'Qwen2.5-Coder-32B-Instruct is an LLM designed for code generation, code understanding, and efficient development workflows. With a leading 32B parameter size, it meets diverse programming needs.',
    displayName: 'Qwen2.5 Coder 32B Instruct',
    enabled: true,
    family: 'qwen',
    generation: 'qwen2.5',
    id: 'Qwen2.5-Coder-32B-Instruct',
    type: 'chat',
  },
  {
    contextWindowTokens: 24_000,
    description:
      'Qwen2.5-Coder-14B-Instruct is a large-scale pre-trained coding instruction model with strong code understanding and generation. It efficiently handles a wide range of programming tasks, ideal for smart coding, automated script generation, and programming Q&A.',
    displayName: 'Qwen2.5 Coder 14B Instruct',
    enabled: true,
    family: 'qwen',
    generation: 'qwen2.5',
    id: 'Qwen2.5-Coder-14B-Instruct',
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 32_000,
    description:
      'Qwen2-VL-72B is a powerful vision-language model supporting multimodal image-text processing, accurately recognizing image content and generating relevant descriptions or answers.',
    displayName: 'Qwen2 VL 72B',
    enabled: true,
    family: 'qwen',
    generation: 'qwen2',
    id: 'Qwen2-VL-72B',
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 32_000,
    description:
      'InternVL2.5-26B is a powerful vision-language model supporting multimodal image-text processing, accurately recognizing image content and generating relevant descriptions or answers.',
    displayName: 'InternVL2.5 26B',
    enabled: true,
    family: 'internvl',
    id: 'InternVL2.5-26B',
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 32_000,
    description:
      'InternVL2-8B is a powerful vision-language model supporting multimodal image-text processing, accurately recognizing image content and generating relevant descriptions or answers.',
    displayName: 'InternVL2 8B',
    enabled: true,
    family: 'internvl',
    id: 'InternVL2-8B',
    type: 'chat',
  },
  {
    contextWindowTokens: 32_000,
    description:
      'GLM-4-9B-Chat performs strongly across semantics, math, reasoning, code, and knowledge. It also supports web browsing, code execution, custom tool calling, and long-text reasoning, with support for 26 languages including Japanese, Korean, and German.',
    displayName: 'GLM4 9B Chat',
    enabled: true,
    family: 'glm',
    generation: 'glm-4',
    id: 'glm-4-9b-chat',
    type: 'chat',
  },
  {
    contextWindowTokens: 4000,
    description:
      'Yi-1.5-34B retains the series’ strong general language abilities while using incremental training on 500B high-quality tokens to significantly improve math logic and coding.',
    displayName: 'Yi 34B Chat',
    enabled: true,
    family: 'yi',
    id: 'Yi-34B-Chat',
    knowledgeCutoff: '2023-06',
    type: 'chat',
  },
  /*
    // not compatible with OpenAI SDK
  {
    description:
      'Code Raccoon is a software intelligent R&D assistant built on SenseTime LLMs, covering requirements analysis, architecture design, coding, and testing. It meets needs like coding and programming learning, supports 90+ mainstream languages (Python, Java, JavaScript, C++, Go, SQL, etc.) and major IDEs such as VS Code and IntelliJ IDEA. In practice, it can boost developer productivity by over 50%.',
    displayName: 'code raccoon v1',
    enabled: true,
    id: 'code-raccoon-v1',
    type: 'chat',
  },
*/
  {
    contextWindowTokens: 8000,
    description:
      'DeepSeek Coder 33B is a code language model trained on 2T tokens (87% code, 13% Chinese/English text). It introduces a 16K context window and fill-in-the-middle tasks, providing project-level code completion and snippet infilling.',
    displayName: 'DeepSeek Coder 33B Instruct',
    enabled: true,
    family: 'deepseek',
    generation: 'deepseek-coder',
    id: 'deepseek-coder-33B-instruct',
    type: 'chat',
  },
  {
    contextWindowTokens: 32_000,
    description:
      'CodeGeeX4-ALL-9B is a multilingual code generation model supporting code completion and generation, code interpreter, web search, function calling, and repo-level code Q&A, covering a wide range of software development scenarios. It is a top-tier code model under 10B parameters.',
    displayName: 'CodeGeeX4 All 9B',
    enabled: true,
    family: 'codegeex',
    id: 'codegeex4-all-9b',
    type: 'chat',
  },
];

export const allModels = [...giteeaiChatModels];

export default allModels;
