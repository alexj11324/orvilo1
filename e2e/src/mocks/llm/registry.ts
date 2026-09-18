/**
 * Shared state for the E2E LLM mock.
 *
 * The response registry lives in two places that must stay consistent:
 *  - the cucumber worker processes (`LLMMockManager`, driving the browser-side
 *    fetch interceptor for any residual client-side `/webapi/chat/*` calls)
 *  - the standalone mock LLM server (`scripts/mockServices.ts`), which serves
 *    the server-side agent runtime's OpenAI-compatible `chat/completions`
 *    calls (`DEEPSEEK_PROXY_URL` points at it in E2E).
 *
 * With `E2E_PARALLEL` > 1 several cucumber workers share one mock server, so
 * state is partitioned by `CUCUMBER_WORKER_ID`: each worker owns
 * `orvilo-e2e-llm-state.<id>.json` (its custom responses only — it can clear
 * them without wiping a sibling's), plus one global `orvilo-e2e-llm-config.json`
 * for stream timing (last write wins; prompts are unique per scenario so
 * response keys never collide across workers). The server merges all state
 * files on every request — no read-modify-write races between workers.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface MockLLMTimingConfig {
  defaultResponse: string;
  enabled: boolean;
  responseDelay: number;
  streamChunkSize: number;
  streamDelay: number;
}

/** One worker's response registry. */
export interface MockLLMWorkerState {
  customResponseFragments: Record<string, string>;
  customResponses: Record<string, string>;
}

/** Merged view consumed by the standalone server. */
export interface MockLLMState {
  config: MockLLMTimingConfig;
  workers: Record<string, MockLLMWorkerState>;
}

export interface MockLLMChatMessage {
  /** Plain string or OpenAI content-parts array. */
  content: string | Array<{ text?: string; type?: string }>;
  role: string;
}

/** Flatten OpenAI string-or-parts `content` into a matchable string. */
const contentToText = (content: MockLLMChatMessage['content']): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === 'text' || part?.type === undefined)
      .map((part) => part?.text ?? '')
      .join('');
  }
  return '';
};

const STATE_FILE_PREFIX = 'orvilo-e2e-llm-state.';
const CONFIG_FILE = 'orvilo-e2e-llm-config.json';

/** Overridable for unit tests; defaults to the shared OS temp dir. */
export const MOCK_LLM_STATE_DIR = process.env.E2E_MOCK_STATE_DIR || os.tmpdir();
export const MOCK_LLM_CONFIG_FILE = path.join(MOCK_LLM_STATE_DIR, CONFIG_FILE);

/** This worker's private state file (cucumber sets CUCUMBER_WORKER_ID). */
export const MOCK_LLM_WORKER_ID = process.env.CUCUMBER_WORKER_ID ?? '0';
export const MOCK_LLM_STATE_FILE = path.join(
  MOCK_LLM_STATE_DIR,
  `${STATE_FILE_PREFIX}${MOCK_LLM_WORKER_ID}.json`,
);

export const MOCK_LLM_PORT = Number(process.env.E2E_MOCK_LLM_PORT || 3406);

const writeJsonAtomic = (file: string, data: unknown): void => {
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch (error) {
    console.warn('   ⚠️ Failed to persist E2E LLM mock state:', error);
  }
};

/** Persist this worker's response registry (customResponses + fragments). */
export const persistMockLLMResponses = (state: MockLLMWorkerState): void => {
  writeJsonAtomic(MOCK_LLM_STATE_FILE, state);
};

/** Persist the shared stream-timing config (global, last write wins). */
export const persistMockLLMConfig = (config: MockLLMTimingConfig): void => {
  writeJsonAtomic(MOCK_LLM_CONFIG_FILE, config);
};

/** Remove this worker's state file — called from BeforeAll for a clean slate. */
export const clearMockLLMWorkerState = (): void => {
  try {
    fs.unlinkSync(MOCK_LLM_STATE_FILE);
  } catch {}
};

/**
 * Remove every mock-state file — called once by the mock-services entry point
 * at boot so responses from a previous run never leak into this one.
 */
export const clearAllMockLLMState = (): void => {
  try {
    for (const file of fs.readdirSync(MOCK_LLM_STATE_DIR)) {
      if ((file.startsWith(STATE_FILE_PREFIX) && file.endsWith('.json')) || file === CONFIG_FILE) {
        try {
          fs.unlinkSync(path.join(MOCK_LLM_STATE_DIR, file));
        } catch {}
      }
    }
  } catch {}
};

const readJson = <T>(file: string): T | undefined => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

/** Merge every worker state file plus the shared timing config. */
export const readMockLLMState = (): MockLLMState | undefined => {
  const workers: MockLLMState['workers'] = {};
  try {
    for (const file of fs.readdirSync(MOCK_LLM_STATE_DIR)) {
      if (!file.startsWith(STATE_FILE_PREFIX) || !file.endsWith('.json')) continue;
      const workerId = file.slice(STATE_FILE_PREFIX.length, -'.json'.length);
      const state = readJson<MockLLMWorkerState>(path.join(MOCK_LLM_STATE_DIR, file));
      if (state) workers[workerId] = state;
    }
  } catch {
    return undefined;
  }

  const config = readJson<MockLLMTimingConfig>(MOCK_LLM_CONFIG_FILE);
  if (!config && Object.keys(workers).length === 0) return undefined;
  return { config: config ?? DEFAULT_MOCK_LLM_CONFIG, workers };
};

export const DEFAULT_MOCK_LLM_CONFIG: MockLLMTimingConfig = {
  defaultResponse: 'Hello! I am a mock AI assistant. How can I help you today?',
  enabled: true,
  responseDelay: 100,
  streamChunkSize: 10,
  streamDelay: 20,
};

/**
 * Resolve the canned reply for a chat request — the same matching rules the
 * in-page fetch interceptor uses: exact last-user-message match first, then
 * fragment containment, then the default response. Searches every worker's
 * registry; prompt strings are unique per scenario so order is irrelevant.
 */
export const resolveMockResponse = (
  messages: MockLLMChatMessage[],
  state: MockLLMState,
): string => {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (lastUserMessage) {
    const key = contentToText(lastUserMessage.content).toLowerCase().trim();

    for (const worker of Object.values(state.workers)) {
      const exact = worker.customResponses[key];
      if (exact !== undefined) return exact;
    }

    for (const worker of Object.values(state.workers)) {
      for (const [fragment, response] of Object.entries(worker.customResponseFragments)) {
        if (key.includes(fragment)) return response;
      }
    }
  }

  return state.config.defaultResponse;
};
