import { OrviloAi21AI } from './providers/ai21';
import { Orvilo302AI } from './providers/ai302';
import { OrviloAi360AI } from './providers/ai360';
import { OrviloAiHubMixAI } from './providers/aihubmix';
import { OrviloAkashChatAI } from './providers/akashchat';
import { OrviloAntGroupAI } from './providers/antgroup';
import { OrviloAnthropicAI } from './providers/anthropic';
import { OrviloAzureAI } from './providers/azureai';
import { OrviloAzureOpenAI } from './providers/azureOpenai';
import { OrviloBaichuanAI } from './providers/baichuan';
import { OrviloBailianCodingPlanAI } from './providers/bailianCodingPlan';
import { OrviloBedrockAI } from './providers/bedrock';
import { OrviloBflAI } from './providers/bfl';
import { OrviloCerebrasAI } from './providers/cerebras';
import { OrviloGPTAI } from './providers/chatGPT';
import { OrviloCloudflareAI } from './providers/cloudflare';
import { OrviloCohereAI } from './providers/cohere';
import { OrviloCometAPIAI } from './providers/cometapi';
import { OrviloComfyUI } from './providers/comfyui';
import { OrviloDeepSeekAI } from './providers/deepseek';
import { OrviloFalAI } from './providers/fal';
import { OrviloFireworksAI } from './providers/fireworksai';
import { OrviloGiteeAI } from './providers/giteeai';
import { OrviloGithubAI } from './providers/github';
import { OrviloGithubCopilotAI } from './providers/githubCopilot';
import { OrviloGLMCodingPlanAI } from './providers/glmCodingPlan';
import { OrviloGoogleAI } from './providers/google';
import { OrviloGroq } from './providers/groq';
import { OrviloHigressAI } from './providers/higress';
import { OrviloHuggingFaceAI } from './providers/huggingface';
import { OrviloHunyuanAI } from './providers/hunyuan';
import { OrviloInfiniAI } from './providers/infiniai';
import { OrviloInternLMAI } from './providers/internlm';
import { OrviloJinaAI } from './providers/jina';
import { OrviloKimiCodingPlanAI } from './providers/kimiCodingPlan';
import { OrviloLMStudioAI } from './providers/lmstudio';
import { OrviloLongCatAI } from './providers/longcat';
import { OrviloMetaAI } from './providers/meta';
import { OrviloMinimaxAI } from './providers/minimax';
import { OrviloMinimaxCodingPlanAI } from './providers/minimaxCodingPlan';
import { OrviloMistralAI } from './providers/mistral';
import { OrviloModelScopeAI } from './providers/modelscope';
import { OrviloMoonshotAI } from './providers/moonshot';
import { OrviloNebiusAI } from './providers/nebius';
import { OrviloNewAPIAI } from './providers/newapi';
import { OrviloNovitaAI } from './providers/novita';
import { OrviloNvidiaAI } from './providers/nvidia';
import { OrviloOllamaAI } from './providers/ollama';
import { OrviloOllamaCloudAI } from './providers/ollamacloud';
import { OrviloOpenAI } from './providers/openai';
import { OrviloOpenCodeCodingPlanAI } from './providers/opencodeCodingPlan';
import { OrviloOpenCodeZenAI } from './providers/opencodeZen';
import { OrviloOpenRouterAI } from './providers/openrouter';
import { OrviloAI } from './providers/orvilo';
import { OrviloPerplexityAI } from './providers/perplexity';
import { OrviloPPIOAI } from './providers/ppio';
import { OrviloQiniuAI } from './providers/qiniu';
import { OrviloQwenAI } from './providers/qwen';
import { OrviloReplicateAI } from './providers/replicate';
import { OrviloSambaNovaAI } from './providers/sambanova';
import { OrviloSearch1API } from './providers/search1api';
import { OrviloSenseNovaAI } from './providers/sensenova';
import { OrviloSiliconCloudAI } from './providers/siliconcloud';
import { OrviloSparkAI } from './providers/spark';
import { OrviloStepfunAI } from './providers/stepfun';
import { OrviloStraicoAI } from './providers/straico';
import { OrviloStreamLakeAI } from './providers/streamlake';
import { OrviloSuperGrokAI } from './providers/superGrok';
import { OrviloTaichuAI } from './providers/taichu';
import { OrviloTencentCloudAI } from './providers/tencentcloud';
import { OrviloTogetherAI } from './providers/togetherai';
import { OrviloUnslothAI } from './providers/unsloth';
import { OrviloUpstageAI } from './providers/upstage';
import { OrviloV0AI } from './providers/v0';
import { OrviloVercelAIGatewayAI } from './providers/vercelaigateway';
import { OrviloVLLMAI } from './providers/vllm';
import { OrviloVolcengineAI } from './providers/volcengine';
import { OrviloVolcengineCodingPlanAI } from './providers/volcengineCodingPlan';
import { OrviloWenxinAI } from './providers/wenxin';
import { OrviloXAI } from './providers/xai';
import { OrviloXiaomiMiMoAI } from './providers/xiaomimimo';
import { OrviloXinferenceAI } from './providers/xinference';
import { OrviloZenMuxAI } from './providers/zenmux';
import { OrviloZeroOneAI } from './providers/zeroone';
import { OrviloZhipuAI } from './providers/zhipu';

export const providerRuntimeMap = {
  ai21: OrviloAi21AI,
  ai302: Orvilo302AI,
  ai360: OrviloAi360AI,
  aihubmix: OrviloAiHubMixAI,
  akashchat: OrviloAkashChatAI,
  antgroup: OrviloAntGroupAI,
  anthropic: OrviloAnthropicAI,
  bailiancodingplan: OrviloBailianCodingPlanAI,
  azure: OrviloAzureOpenAI,
  azureai: OrviloAzureAI,
  baichuan: OrviloBaichuanAI,
  bedrock: OrviloBedrockAI,
  bfl: OrviloBflAI,
  cerebras: OrviloCerebrasAI,
  chatgpt: OrviloGPTAI,
  cloudflare: OrviloCloudflareAI,
  cohere: OrviloCohereAI,
  cometapi: OrviloCometAPIAI,
  comfyui: OrviloComfyUI,
  deepseek: OrviloDeepSeekAI,
  fal: OrviloFalAI,
  fireworksai: OrviloFireworksAI,
  giteeai: OrviloGiteeAI,
  github: OrviloGithubAI,
  githubcopilot: OrviloGithubCopilotAI,
  google: OrviloGoogleAI,
  glmcodingplan: OrviloGLMCodingPlanAI,
  groq: OrviloGroq,
  higress: OrviloHigressAI,
  huggingface: OrviloHuggingFaceAI,
  hunyuan: OrviloHunyuanAI,
  infiniai: OrviloInfiniAI,
  internlm: OrviloInternLMAI,
  jina: OrviloJinaAI,
  kimicodingplan: OrviloKimiCodingPlanAI,
  lmstudio: OrviloLMStudioAI,
  orvilo: OrviloAI,
  longcat: OrviloLongCatAI,
  meta: OrviloMetaAI,
  minimax: OrviloMinimaxAI,
  minimaxcodingplan: OrviloMinimaxCodingPlanAI,
  mistral: OrviloMistralAI,
  modelscope: OrviloModelScopeAI,
  moonshot: OrviloMoonshotAI,
  nebius: OrviloNebiusAI,
  newapi: OrviloNewAPIAI,
  novita: OrviloNovitaAI,
  nvidia: OrviloNvidiaAI,
  ollama: OrviloOllamaAI,
  ollamacloud: OrviloOllamaCloudAI,
  opencodecodingplan: OrviloOpenCodeCodingPlanAI,
  opencodezen: OrviloOpenCodeZenAI,
  openai: OrviloOpenAI,
  openrouter: OrviloOpenRouterAI,
  perplexity: OrviloPerplexityAI,
  ppio: OrviloPPIOAI,
  qiniu: OrviloQiniuAI,
  qwen: OrviloQwenAI,
  replicate: OrviloReplicateAI,
  router: OrviloNewAPIAI,
  sambanova: OrviloSambaNovaAI,
  search1api: OrviloSearch1API,
  sensenova: OrviloSenseNovaAI,
  siliconcloud: OrviloSiliconCloudAI,
  spark: OrviloSparkAI,
  stepfun: OrviloStepfunAI,
  straico: OrviloStraicoAI,
  streamlake: OrviloStreamLakeAI,
  supergrok: OrviloSuperGrokAI,
  taichu: OrviloTaichuAI,
  tencentcloud: OrviloTencentCloudAI,
  togetherai: OrviloTogetherAI,
  unsloth: OrviloUnslothAI,
  upstage: OrviloUpstageAI,
  v0: OrviloV0AI,
  vercelaigateway: OrviloVercelAIGatewayAI,
  vllm: OrviloVLLMAI,
  volcengine: OrviloVolcengineAI,
  volcenginecodingplan: OrviloVolcengineCodingPlanAI,
  wenxin: OrviloWenxinAI,
  xai: OrviloXAI,
  xiaomimimo: OrviloXiaomiMiMoAI,
  xinference: OrviloXinferenceAI,
  zenmux: OrviloZenMuxAI,
  zeroone: OrviloZeroOneAI,
  zhipu: OrviloZhipuAI,
};
