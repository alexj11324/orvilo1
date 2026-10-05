/**
 * `@orvilo/device-prime-host` — the shared device-side Prime host.
 *
 * Used by every device surface that can launch Prime (CLI `connect` daemon
 * today; Desktop's `HeterogeneousAgentImpl` once it routes own-agent device
 * plans). Verifies the shipped runner artifact against the descriptor's pin,
 * spawns it under the device's own process supervision, drives the existing
 * NDJSON harness protocol, bridges `broker.infer` to the control-side
 * `/prime-broker` surface under the bound credential, and enforces the
 * bounded side-effect lease.
 */
export type { BrokerBridgeOptions, PrimeDeviceHostLog } from './brokerBridge';
export { createBrokerReverseHandler } from './brokerBridge';
export type {
  PrimeDeviceRun,
  PrimeDeviceRunActivation,
  PrimeDeviceRunOptions,
} from './primeDeviceRun';
export { openPrimeDeviceRun } from './primeDeviceRun';
