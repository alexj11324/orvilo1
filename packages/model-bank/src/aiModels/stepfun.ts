import type { AIChatModelCard } from '../types/aiModel';

// https://platform.stepfun.com/docs/pricing/details

const stepfunChatModels: AIChatModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true,
      video: true,
    },
    contextWindowTokens: 256_000,
    description:
      'The flagship multimodal reasoning model from StepFun. Building on the high-speed reasoning and tool-calling capabilities of step-3.5-flash, it adds native multimodal input support, enabling direct understanding of images and video content without relying on visual MCPs or additional vision models. The model supports three reasoning levels (low / medium / high), making it a fast and reliable choice for agent workflows, coding tasks, and multimodal applications.',
    displayName: 'Step 3.7 Flash',
    enabled: true,
    family: 'step',
    generation: 'step-3.7',
    id: 'step-3.7-flash',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.27, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 1.35, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8.1, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      extendParams: ['reasoningEffort'],
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
    },
    contextWindowTokens: 256_000,
    description:
      'Built on Step 3.5 Flash and optimized for high-frequency agent scenarios, it further improves token efficiency and inference speed while retaining flagship-level reasoning and tool-calling capabilities. It also supports switching to a low-reasoning mode to reduce resource consumption. Additionally, targeted optimizations have been made to enhance compatibility with coding tasks and agent frameworks.',
    displayName: 'Step 3.5 Flash 2603',
    family: 'step',
    generation: 'step-3.5',
    id: 'step-3.5-flash-2603',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.14, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.7, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2.1, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      extendParams: ['step3_5ReasoningEffort'],
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
    },
    contextWindowTokens: 256_000,
    description:
      'Stepfun’s flagship language reasoning model.This model has top-notch reasoning capabilities and fast and reliable execution capabilities.Able to decompose and plan complex tasks, call tools quickly and reliably to perform tasks, and be competent in various complex tasks such as logical reasoning, mathematics, software engineering, and in-depth research.',
    displayName: 'Step 3.5 Flash',
    family: 'step',
    generation: 'step-3.5',
    id: 'step-3.5-flash',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.14, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.7, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2.1, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      reasoning: true,
      vision: true,
    },
    contextWindowTokens: 64_000,
    description:
      'This model has strong visual perception and complex reasoning, accurately handling cross-domain knowledge understanding, math-vision cross analysis, and a wide range of everyday visual analysis tasks.',
    displayName: 'Step 3',
    family: 'step',
    generation: 'step-3',
    id: 'step-3',
    pricing: {
      currency: 'CNY',
      units: [
        {
          name: 'textInput_cacheRead',
          strategy: 'tiered',
          tiers: [
            { rate: 0.3, upTo: 4_000 },
            { rate: 0.8, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textInput',
          strategy: 'tiered',
          tiers: [
            { rate: 1.5, upTo: 4_000 },
            { rate: 4, upTo: 'infinity' },
          ],
          unit: 'millionTokens',
        },
        {
          name: 'textOutput',
          strategy: 'tiered',
          tiers: [
            { rate: 4, upTo: 4_000 },
            { rate: 8, upTo: 'infinity' }, // Still differs from documentation
          ],
          unit: 'millionTokens',
        },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      reasoning: true,
      vision: true,
    },
    contextWindowTokens: 100_000,
    description:
      'A reasoning model with strong image understanding that can process images and text, then generate text after deep reasoning. It excels at visual reasoning and delivers top-tier math, coding, and text reasoning, with a 100K context window.',
    displayName: 'Step R1 V Mini',
    family: 'step',
    id: 'step-r1-v-mini',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
    },
    contextWindowTokens: 8000,
    description: 'Small model suited for lightweight tasks.',
    displayName: 'Step 1 8K',
    family: 'step',
    generation: 'step-1',
    id: 'step-1-8k',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
    },
    contextWindowTokens: 32_000,
    description: 'Supports mid-length conversations for a wide range of scenarios.',
    displayName: 'Step 1 32K',
    family: 'step',
    generation: 'step-1',
    id: 'step-1-32k',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 70, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
    },
    contextWindowTokens: 256_000,
    description: 'Extra-long context handling, ideal for long-document analysis.',
    displayName: 'Step 1 256K',
    family: 'step',
    generation: 'step-1',
    id: 'step-1-256k',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 19, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 95, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 300, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
    },
    contextWindowTokens: 8000,
    description:
      'Built on the next-generation in-house MFA attention architecture, delivering Step-1-like results at much lower cost while achieving higher throughput and faster latency. Handles general tasks with strong coding ability.',
    displayName: 'Step 2 Mini',
    family: 'step',
    generation: 'step-2',
    id: 'step-2-mini',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    releasedAt: '2025-01-14',
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
    },
    contextWindowTokens: 16_000,
    description: 'Supports large-context interactions for complex dialogues.',
    displayName: 'Step 2 16K',
    family: 'step',
    generation: 'step-2',
    id: 'step-2-16k',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 7.6, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 38, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 120, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
    },
    contextWindowTokens: 16_000,
    description:
      'Experimental Step-2 build with the latest features and rolling updates. Not recommended for production.',
    displayName: 'Step 2 16K Exp',
    family: 'step',
    generation: 'step-2',
    id: 'step-2-16k-exp',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 7.6, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 38, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 120, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    releasedAt: '2025-01-15',
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      vision: true,
    },
    contextWindowTokens: 8000,
    description: 'Small vision model for basic image-and-text tasks.',
    displayName: 'Step 1V 8K',
    family: 'step',
    generation: 'step-1',
    id: 'step-1v-8k',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      vision: true,
    },
    contextWindowTokens: 32_000,
    description: 'Supports vision inputs for richer multimodal interaction.',
    displayName: 'Step 1V 32K',
    family: 'step',
    generation: 'step-1',
    id: 'step-1v-32k',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 32_000,
    description:
      'Strong image understanding with better visual performance than the Step-1V series.',
    displayName: 'Step 1o Vision 32K',
    family: 'step',
    generation: 'step-1',
    id: 'step-1o-vision-32k',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    releasedAt: '2025-01-22',
    type: 'chat',
  },
  {
    abilities: {
      video: true,
      vision: true,
    },
    contextWindowTokens: 32_000,
    description:
      'Strong image understanding, outperforming 1o in math and coding. Smaller than 1o with faster output.',
    displayName: 'Step 1o Turbo Vision',
    family: 'step',
    generation: 'step-1',
    id: 'step-1o-turbo-vision',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    releasedAt: '2025-02-14',
    type: 'chat',
  },
];

export const allModels = [...stepfunChatModels];

export default allModels;
