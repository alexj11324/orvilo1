export interface IslandChangeDesc {
  readonly empty: boolean;
  mapPos: (position: number, association?: number) => number;
}
export interface IslandRange {
  readonly anchor: number;
  readonly assoc: number;
  readonly from: number;
  readonly head: number;
  map: (changes: IslandChangeDesc, association?: number) => IslandRange;
  readonly to: number;
}
export interface IslandSelection {
  readonly constructor: {
    range: (anchor: number, head: number) => IslandRange;
    cursor: (position: number, association?: number) => IslandRange;
    create: (ranges: readonly IslandRange[], mainIndex: number) => IslandSelection;
  };
  readonly main: IslandRange;
  readonly mainIndex: number;
  readonly ranges: readonly IslandRange[];
}
export interface IslandTransaction {
  readonly changes: IslandChangeDesc;
  readonly constructor: { addToHistory: { of: (value: boolean) => unknown } };
}
export interface ProfessionalCodeInstance {
  blur: () => void;
  destroy: () => void;
  focus: () => void;
  getConfig: (value: string) => { doc: string; extensions: unknown[] };
  getHistory: () => unknown;
  getSelection: () => string;
  getValue: () => string;
  historyRedoDepth: () => number;
  historyUndoDepth: () => number;
  off: (name: string, handler: (instance: ProfessionalCodeInstance, event?: Event) => void) => void;
  on: (name: string, handler: (instance: ProfessionalCodeInstance, event?: Event) => void) => void;
  readonly optionHelper: {
    mode2Extension: (mode: string) => readonly unknown[];
    theme: { reconfigure: (extension: unknown) => unknown };
  };
  readonly options: { mode: string };
  refresh: () => void;
  setOption: (name: string, value: unknown) => void;
  setSelectionToEnd: () => void;
  setValue: (value: string) => void;
  readonly view: {
    readonly constructor: {
      theme: (spec: unknown, options: { dark: boolean }) => unknown;
    };
    readonly contentDOM: HTMLElement;
    readonly dom: HTMLElement;
    setState: (state: unknown) => void;
    readonly state: {
      readonly constructor: {
        allowMultipleSelections: { of: (value: boolean) => unknown };
        create: (config: { doc: string; extensions: unknown[] }) => unknown;
      };
      readonly doc: { lineAt: (position: number) => { from: number; number: number } };
      readonly readOnly: boolean;
      readonly selection: IslandSelection;
      update: (spec: {
        changes: { from: number; to: number; insert: string };
        selection?: unknown;
        userEvent?: string;
        annotations?: readonly unknown[];
      }) => IslandTransaction;
    };
    dispatch: (transaction: IslandTransaction | { effects: unknown }) => void;
  };
}
export interface ProfessionalCodeOptions {
  autoCloseBrackets?: boolean;
  foldGutter?: boolean;
  indentWithTabs: boolean;
  lineNumbers: boolean;
  lineWrapping?: boolean;
  matchBrackets?: boolean;
  mode: string;
  readOnly: boolean;
  styleActiveLine?: boolean;
  tabSize: number;
  theme: string;
  useHistory?: boolean;
  value: string;
}
export type ProfessionalCodeConstructor = (
  host: HTMLElement,
  options: ProfessionalCodeOptions,
) => ProfessionalCodeInstance;

let pending: Promise<ProfessionalCodeConstructor> | undefined;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
function isInstance(value: unknown): value is ProfessionalCodeInstance {
  if (!isObject(value) || !isObject(value.view) || !isObject(value.optionHelper)) return false;
  return [
    'getValue',
    'setValue',
    'getHistory',
    'historyUndoDepth',
    'historyRedoDepth',
    'getSelection',
    'getConfig',
    'refresh',
    'setSelectionToEnd',
    'setOption',
    'focus',
    'blur',
    'destroy',
    'on',
    'off',
  ].every((key) => typeof value[key] === 'function');
}

/** Locally bundled pinned professional kernel; never load a remote CDN script. */
export function loadProfessionalCodeKernel(): Promise<ProfessionalCodeConstructor> {
  if (pending) return pending;
  pending = (async () => {
    if (typeof window === 'undefined') throw new Error('Code blocks require a browser host');
    const previous = Object.getOwnPropertyDescriptor(window, 'CodeMirror');
    await import('@lobehub/codemirror');
    const namespace: unknown = Reflect.get(window, 'CodeMirror');
    if (!isObject(namespace) || typeof namespace.default !== 'function') {
      throw new Error('Pinned professional CodeMirror did not expose its constructor');
    }
    const constructor = namespace.default;
    // Preserve the retained SDK's global owner rather than replacing it permanently.
    if (Reflect.get(window, 'CodeMirror') === namespace) {
      if (previous) Object.defineProperty(window, 'CodeMirror', previous);
      else Reflect.deleteProperty(window, 'CodeMirror');
    }
    return (host: HTMLElement, options: ProfessionalCodeOptions) => {
      const instance: unknown = Reflect.apply(constructor, undefined, [host, options]);
      if (!isInstance(instance)) throw new Error('Professional code-block API mismatch');
      return instance;
    };
  })().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
