import { CalculatorManifest } from '@orvilo/builtin-tool-calculator';
import { CalculatorExecutionRuntime } from '@orvilo/builtin-tool-calculator/executionRuntime';

import { type ServerRuntimeRegistration } from './types';

/**
 * Calculator Server Runtime
 * Pre-instantiated runtime (no per-request context needed)
 */
const runtime = new CalculatorExecutionRuntime();

export const calculatorRuntime: ServerRuntimeRegistration = {
  factory: () => runtime,
  identifier: CalculatorManifest.identifier,
};
