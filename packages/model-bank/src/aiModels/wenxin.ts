import type { AIChatModelCard } from '../types/aiModel';

// https://cloud.baidu.com/doc/qianfan/s/rmh4stp0j

const wenxinChatModels: AIChatModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
    },
    contextWindowTokens: 131_072,
    description:
      'ERNIE 5.1 is the latest model in the ERNIE series, featuring comprehensive upgrades to its foundational capabilities. It demonstrates significant improvements in areas such as agents, knowledge processing, reasoning, and deep search. This release adopts a decoupled fully asynchronous reinforcement learning architecture, specifically designed to address key challenges in the evolution of large models toward autonomous agent decision-making, including training–inference numerical discrepancies, low utilization of heterogeneous computing resources, and global issues caused by long-tail effects. In addition, large-scale agent post-training techniques are employed to further enhance the model’s capabilities and generalization performance. Through a three-stage collaborative framework involving environment, expert, and fusion processes, the approach not only ensures training efficiency but also significantly improves the model’s stability and performance on complex tasks.',
    displayName: 'ERNIE 5.1',
    enabled: true,
    family: 'ernie',
    generation: 'ernie-5.1',
    id: 'ernie-5.1',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 4,
              '[0.032, 0.128]': 6,
            },
            pricingParams: ['textInput'],
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 18,
              '[0.032, 0.128]': 22,
            },
            pricingParams: ['textInput'],
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
      ],
    },
    releasedAt: '2026-05-09',
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      video: true,
      vision: true,
    },
    contextWindowTokens: 131_072,
    description:
      'ERNIE 5.0, the new-generation model in the ERNIE series, is a natively multimodal large model. It adopts a unified multimodal modeling approach, jointly modeling text, images, audio, and video to deliver comprehensive multimodal capabilities. Its foundational abilities have been significantly upgraded, achieving strong performance on benchmark evaluations. It particularly excels in multimodal understanding, instruction following, creative writing, factual accuracy, agent planning, and tool utilization.',
    displayName: 'ERNIE 5.0',
    enabled: true,
    family: 'ernie',
    generation: 'ernie-5.0',
    id: 'ernie-5.0',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, 0.128]': 10,
            },
            pricingParams: ['textInput'],
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 24,
              '[0.032, 0.128]': 40,
            },
            pricingParams: ['textInput'],
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
      ],
    },
    releasedAt: '2026-03-05',
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      video: true,
      vision: true,
    },
    contextWindowTokens: 131_072,
    description:
      'Wenxin 5.0 Thinking is a native full-modal flagship model with unified text, image, audio, and video modeling. It delivers broad capability upgrades for complex QA, creation, and agent scenarios.',
    displayName: 'ERNIE 5.0 Thinking',
    family: 'ernie',
    generation: 'ernie-5.0',
    id: 'ernie-5.0-thinking-latest',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, 0.128]': 10,
            },
            pricingParams: ['textInput'],
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 24,
              '[0.032, 0.128]': 40,
            },
            pricingParams: ['textInput'],
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
      ],
    },
    releasedAt: '2025-11-12',
    settings: {
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      video: true,
      vision: true,
    },
    contextWindowTokens: 131_072,
    description:
      'Wenxin 5.0 Thinking Preview is a native full-modal flagship model with unified text, image, audio, and video modeling. It delivers broad capability upgrades for complex QA, creation, and agent scenarios.',
    displayName: 'ERNIE 5.0 Thinking Preview',
    family: 'ernie',
    generation: 'ernie-5.0',
    id: 'ernie-5.0-thinking-preview',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, 0.128]': 10,
            },
            pricingParams: ['textInput'],
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 24,
              '[0.032, 0.128]': 40,
            },
            pricingParams: ['textInput'],
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
      ],
    },
    releasedAt: '2025-11-12',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken'],
      searchImpl: 'params',
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      search: true,
    },
    contextWindowTokens: 131_072,
    description:
      'ERNIE 4.5 Turbo 20260402 is a high-performance general model with search augmentation and tool calling for QA, coding, and agent scenarios.',
    displayName: 'ERNIE 4.5 Turbo 20260402',
    enabled: true,
    family: 'ernie',
    generation: 'ernie-4.5',
    id: 'ernie-4.5-turbo-20260402',
    maxOutput: 12_288,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3.2, strategy: 'fixed', unit: 'millionTokens' },
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
    contextWindowTokens: 131_072,
    description:
      'ERNIE 4.5 Turbo 128K is a high-performance general model with search augmentation and tool calling for QA, coding, and agent scenarios.',
    displayName: 'ERNIE 4.5 Turbo 128K',
    family: 'ernie',
    generation: 'ernie-4.5',
    id: 'ernie-4.5-turbo-128k',
    maxOutput: 12_288,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3.2, strategy: 'fixed', unit: 'millionTokens' },
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
    contextWindowTokens: 32_768,
    description:
      'ERNIE 4.5 Turbo 32K is a mid-length context version for QA, knowledge base retrieval, and multi-turn dialogue.',
    displayName: 'ERNIE 4.5 Turbo 32K',
    family: 'ernie',
    generation: 'ernie-4.5',
    id: 'ernie-4.5-turbo-32k',
    maxOutput: 12_288,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3.2, strategy: 'fixed', unit: 'millionTokens' },
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
    contextWindowTokens: 131_072,
    description:
      'Latest ERNIE 4.5 Turbo with optimized overall performance, ideal as the primary production model.',
    displayName: 'ERNIE 4.5 Turbo Latest',
    family: 'ernie',
    generation: 'ernie-4.5',
    id: 'ernie-4.5-turbo-latest',
    maxOutput: 12_288,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3.2, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    contextWindowTokens: 8192,
    description:
      'ERNIE Character Fiction 8K is a persona model for novels and plot creation, suited for long-form story generation.',
    displayName: 'ERNIE Character Fiction 8K',
    family: 'ernie',
    id: 'ernie-char-fiction-8k',
    maxOutput: 2048,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    contextWindowTokens: 8192,
    description:
      'ERNIE Character Fiction 8K Preview is a character and plot creation model preview for feature evaluation and testing.',
    displayName: 'ERNIE Character Fiction 8K Preview',
    family: 'ernie',
    id: 'ernie-char-fiction-8k-preview',
    maxOutput: 2048,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    contextWindowTokens: 8192,
    description:
      'ERNIE Novel 8K is built for long-form novels and IP plots with multi-character narratives.',
    displayName: 'ERNIE Novel 8K',
    family: 'ernie',
    id: 'ernie-novel-8k',
    maxOutput: 2048,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 40, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 120, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    contextWindowTokens: 32_768,
    description:
      'Qianfan 8B is a mid-size general model balancing cost and quality for text generation and QA.',
    displayName: 'Qianfan 8B',
    family: 'qianfan',
    id: 'qianfan-8b',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    contextWindowTokens: 32_768,
    description:
      'Qianfan 70B is a large Chinese model for high-quality generation and complex reasoning.',
    displayName: 'Qianfan 70B',
    family: 'qianfan',
    id: 'qianfan-70b',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3.2, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    contextWindowTokens: 32_768,
    description:
      'Qianfan Agent Intent 32K targets intent recognition and agent orchestration with long context support.',
    displayName: 'Qianfan Agent Intent 32K',
    family: 'qianfan',
    id: 'qianfan-agent-intent-32k',
    maxOutput: 4096,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1.2, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    contextWindowTokens: 8192,
    description:
      'Qianfan Agent Lite 8K is a lightweight agent model for low-cost multi-turn dialogue and workflows.',
    displayName: 'Qianfan Agent Lite 8K',
    family: 'qianfan',
    id: 'qianfan-agent-lite-8k',
    maxOutput: 2048,
    type: 'chat',
  },
  {
    abilities: {
      video: true,
      vision: true,
    },
    contextWindowTokens: 131_072,
    description:
      'ERNIE 4.5 Turbo VL is a mature multimodal model for production image-text understanding and recognition.',
    displayName: 'ERNIE 4.5 Turbo VL',
    family: 'ernie',
    generation: 'ernie-4.5',
    id: 'ernie-4.5-turbo-vl',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 9, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      video: true,
      vision: true,
    },
    contextWindowTokens: 32_768,
    description:
      'ERNIE 4.5 Turbo VL 32K is a mid-long multimodal version for combined long-doc and image understanding.',
    displayName: 'ERNIE 4.5 Turbo VL 32K',
    family: 'ernie',
    generation: 'ernie-4.5',
    id: 'ernie-4.5-turbo-vl-32k',
    maxOutput: 12_288,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 9, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      video: true,
      vision: true,
    },
    contextWindowTokens: 131_072,
    description:
      'ERNIE 4.5 Turbo VL Latest is the newest multimodal version with improved image-text understanding and reasoning.',
    displayName: 'ERNIE 4.5 Turbo VL Latest',
    family: 'ernie',
    generation: 'ernie-4.5',
    id: 'ernie-4.5-turbo-vl-latest',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 9, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 8192,
    description: 'ERNIE 4.5 8K Preview is an 8K context preview model for evaluating ERNIE 4.5.',
    displayName: 'ERNIE 4.5 8K Preview',
    family: 'ernie',
    generation: 'ernie-4.5',
    id: 'ernie-4.5-8k-preview',
    maxOutput: 2048,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 16, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
    },
    contextWindowTokens: 65_536,
    description: 'ERNIE X1.1 is a thinking-model preview for evaluation and testing.',
    displayName: 'ERNIE X1.1',
    enabled: true,
    family: 'ernie',
    generation: 'ernie-x1',
    id: 'ernie-x1.1',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
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
      reasoning: true,
      search: true,
    },
    contextWindowTokens: 65_536,
    description: 'ERNIE X1.1 Preview is a thinking-model preview for evaluation and testing.',
    displayName: 'ERNIE X1.1 Preview',
    family: 'ernie',
    generation: 'ernie-x1',
    id: 'ernie-x1.1-preview',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
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
    contextWindowTokens: 32_768,
    description:
      'Qianfan Composition is a multimodal creation model for mixed image-text understanding and generation.',
    displayName: 'Qianfan Composition',
    family: 'qianfan',
    id: 'qianfan-composition',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 7.5, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 131_072,
    description:
      'Qianfan MultiPicOCR is a multi-image OCR model for text detection and recognition across images.',
    displayName: 'Qianfan MultiPicOCR',
    family: 'qianfan',
    id: 'qianfan-multipicocr',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 7.5, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 131_072,
    description:
      'Qianfan QI VL is a multimodal QA model for accurate retrieval and QA in complex image-text scenarios.',
    displayName: 'Qianfan QI VL',
    family: 'qianfan',
    id: 'qianfan-qi-vl',
    maxOutput: 131_072,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4.5, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 4096,
    description:
      'Qianfan EngCard VL is a multimodal recognition model focused on English scenarios.',
    displayName: 'Qianfan EngCard VL',
    family: 'qianfan',
    id: 'qianfan-engcard-vl',
    maxOutput: 4000,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 4096,
    description:
      'Qianfan SinglePicOCR is a single-image OCR model with high-accuracy character recognition.',
    displayName: 'Qianfan SinglePicOCR',
    family: 'qianfan',
    id: 'qianfan-singlepicocr',
    maxOutput: 4096,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 32_768,
    description:
      'InternVL3 38B is a large open-source multimodal model for high-accuracy image-text understanding.',
    displayName: 'InternVL3 38B',
    family: 'internvl',
    id: 'internvl3-38b',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 24, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 32_768,
    description: 'InternVL3 14B is a mid-size multimodal model balancing performance and cost.',
    displayName: 'InternVL3 14B',
    family: 'internvl',
    id: 'internvl3-14b',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 12, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 32_768,
    description:
      'InternVL3 1B is a lightweight multimodal model for resource-constrained deployment.',
    displayName: 'InternVL3 1B',
    family: 'internvl',
    id: 'internvl3-1b',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1.2, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 32_768,
    description:
      'InternVL2.5 38B MPO is a multimodal pretrained model for complex image-text reasoning.',
    displayName: 'InternVL2.5 38B MPO',
    family: 'internvl',
    id: 'internvl2.5-38b-mpo',
    maxOutput: 4096,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 24, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 65_536,
    description:
      'GLM-4.5V is a multimodal vision-language model for general image understanding and QA.',
    displayName: 'GLM-4.5V',
    family: 'glm',
    generation: 'glm-4.5',
    id: 'glm-4.5v',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 2,
              '[0.032, 0.064]': 4,
            },
            pricingParams: ['textInput'],
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, 0.064]': 12,
            },
            pricingParams: ['textInput'],
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens',
        },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 4096,
    description:
      'DeepSeek VL2 is a multimodal model for image-text understanding and fine-grained visual QA.',
    displayName: 'DeepSeek VL2',
    family: 'deepseek',
    id: 'deepseek-vl2',
    maxOutput: 2048,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.99, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.99, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      vision: true,
    },
    contextWindowTokens: 4096,
    description:
      'DeepSeek VL2 Small is a lightweight multimodal version for resource-constrained and high-concurrency use.',
    displayName: 'DeepSeek VL2 Small',
    family: 'deepseek',
    id: 'deepseek-vl2-small',
    maxOutput: 2048,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
    },
    contextWindowTokens: 144_000,
    description:
      'DeepSeek V3.2 Think is a full deep-thinking model with stronger long-chain reasoning.',
    displayName: 'DeepSeek V3.2 Think',
    family: 'deepseek',
    generation: 'deepseek-v3.2',
    id: 'deepseek-v3.2-think',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
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
      reasoning: true,
    },
    contextWindowTokens: 32_768,
    description:
      'DeepSeek R1 Distill Qianfan 70B is an R1 distill based on Qianfan-70B with strong value.',
    displayName: 'DeepSeek R1 Distill Qianfan 70B',
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'deepseek-r1-distill-qianfan-70b',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
    },
    contextWindowTokens: 32_768,
    description:
      'DeepSeek R1 Distill Qianfan 8B is an R1 distill based on Qianfan-8B for small and mid-sized apps.',
    displayName: 'DeepSeek R1 Distill Qianfan 8B',
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'deepseek-r1-distill-qianfan-8b',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
    },
    contextWindowTokens: 32_768,
    description: 'DeepSeek R1 Distill Qianfan Llama 70B is an R1 distill based on Llama-70B.',
    displayName: 'DeepSeek R1 Distill Qianfan Llama 70B',
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'deepseek-r1-distill-qianfan-llama-70b',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
    },
    contextWindowTokens: 32_768,
    description: 'DeepSeek R1 Distill Llama 70B combines R1 reasoning with the Llama ecosystem.',
    displayName: 'DeepSeek R1 Distill Llama 70B',
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'deepseek-r1-distill-llama-70b',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
    },
    contextWindowTokens: 32_768,
    description:
      'DeepSeek R1 Distill Qwen 7B is a lightweight distill model for edge and private enterprise environments.',
    displayName: 'DeepSeek R1 Distill Qwen 7B',
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'deepseek-r1-distill-qwen-7b',
    maxOutput: 8192,
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
    },
    contextWindowTokens: 32_768,
    description:
      'DeepSeek R1 Distill Qwen 1.5B is an ultra-light distill model for very low-resource environments.',
    displayName: 'DeepSeek R1 Distill Qwen 1.5B',
    family: 'deepseek',
    generation: 'deepseek-r1-distill',
    id: 'deepseek-r1-distill-qwen-1.5b',
    maxOutput: 8192,
    type: 'chat',
  },
  {
    abilities: {
      functionCall: true,
    },
    contextWindowTokens: 131_072,
    description:
      'Kimi K2 Instruct is Kimi’s official reasoning model with long context for code, QA, and more.',
    displayName: 'Kimi K2 Instruct',
    family: 'kimi',
    generation: 'kimi-k2',
    id: 'kimi-k2-instruct',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 16, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    type: 'chat',
  },
  {
    contextWindowTokens: 32_768,
    description: 'Qwen3 30B A3B is a mid-large general model balancing cost and quality.',
    displayName: 'Qwen3 30B A3B',
    family: 'qwen',
    generation: 'qwen3',
    id: 'qwen3-30b-a3b',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
      ],
    },
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken'],
    },
    type: 'chat',
  },
];

export const allModels = [...wenxinChatModels];

export default allModels;
