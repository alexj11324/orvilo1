import type { AIChatModelCard } from '../types/aiModel';

// https://platform.sensenova.cn/docs

const sensenovaChatModels: AIChatModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true,
    },
    contextWindowTokens: 262_144,
    description:
      'A lightweight multimodal agent model designed for real-world workflows, supporting both text-based conversations and image understanding. Lightweight and efficient, balancing performance, cost, and deployability. Native multimodal architecture with support for image understanding, including OCR and chart interpretation. Enhanced for office and productivity scenarios, with stable support for complex long-chain tasks. Improved token efficiency, enabling better cost control for complex workloads. Context length of 256K tokens (maximum input: 252K, maximum output: 64K)',
    displayName: 'SenseNova 6.7 Flash Lite',
    enabled: true,
    family: 'sensenova',
    id: 'sensenova-6.7-flash-lite',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    releasedAt: '2026-05-08',
    settings: {
      extendParams: ['gpt5_1ReasoningEffort'],
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
    },
    contextWindowTokens: 262_144,
    description:
      'A high-performance conversational model from DeepSeek, supporting both reasoning and non-reasoning modes, with a 256K-token context window and up to 64K output tokens. Built-in capabilities include JSON Output and Tool Calls.',
    displayName: 'DeepSeek V4 Flash',
    family: 'deepseek',
    generation: 'deepseek-v4',
    id: 'deepseek-v4-flash',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      extendParams: ['gpt5_1ReasoningEffort'],
    },
    type: 'chat',
  },
];

export const allModels = [...sensenovaChatModels];

export default allModels;
