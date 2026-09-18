import type { OrviloRuntimeAI } from '../BaseAI';

export interface RuntimeItem {
  id: string;
  models?: string[] | (() => Promise<string[]>);
  runtime: OrviloRuntimeAI;
}

export type {
  CreateRouterRuntimeOptions,
  RouteAttemptResult,
  UniformRuntime,
} from './createRuntime';
export { createRouterRuntime } from './createRuntime';
