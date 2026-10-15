'use client';

import isEqual from 'fast-deep-equal';
import { type ReactNode } from 'react';
import { createFormControl } from 'react-hook-form';
import { z } from 'zod';

export type NamePath = string | number | Array<string | number>;
type Values = Record<string, any>;
type PartialValues<T> = { [K in keyof T]?: T[K] extends object ? PartialValues<T[K]> : T[K] };

export interface RuleObject {
  defaultField?: RuleObject;
  enum?: any[];
  fields?: Record<string, RuleObject | RuleObject[]>;
  len?: number;
  max?: number;
  message?: ReactNode;
  min?: number;
  pattern?: RegExp;
  required?: boolean;
  transform?: (value: any) => any;
  type?:
    | 'array'
    | 'boolean'
    | 'date'
    | 'email'
    | 'enum'
    | 'float'
    | 'hex'
    | 'integer'
    | 'method'
    | 'number'
    | 'object'
    | 'regexp'
    | 'string'
    | 'tel'
    | 'url';
  validateTrigger?: string | string[];
  validator?: (rule: RuleObject, value: any, callback: (error?: string | Error) => void) => any;
  warningOnly?: boolean;
  whitespace?: boolean;
}

export type Rule = RuleObject | ((form: FormInstance) => RuleObject);

export interface FieldData {
  errors?: ReactNode[];
  name: NamePath;
  touched?: boolean;
  validating?: boolean;
  value?: any;
  warnings?: ReactNode[];
}

export interface FieldMeta {
  errors: ReactNode[];
  name: Array<string | number>;
  touched: boolean;
  validated: boolean;
  validating: boolean;
  warnings: ReactNode[];
}

export interface ValidateOptions {
  dirty?: boolean;
  recursive?: boolean;
  validateOnly?: boolean;
}

export interface ValidationFailure<T = Values> {
  errorFields: Array<{ errors: ReactNode[]; name: Array<string | number> }>;
  outOfDate: boolean;
  values: T;
}

// A local instance is nominal, not an arbitrary structurally compatible legacy engine.
// The enumerable symbol survives the public Object.assign imperative-ref handle.
const localFormInstanceBrand: unique symbol = Symbol('GroupForm.localFormInstance');

export interface FormInstance<T = any> {
  focusField: (name: NamePath) => void;
  getFieldError: (name: NamePath) => ReactNode[];
  getFieldInstance: (name: NamePath) => any;
  getFieldsError: (names?: NamePath[]) => Array<Pick<FieldMeta, 'name' | 'errors' | 'warnings'>>;
  getFieldsValue: (
    names?: NamePath[] | true | { filter?: (meta: FieldMeta) => boolean; strict?: boolean },
    filter?: (meta: FieldMeta) => boolean,
  ) => T;
  getFieldValue: (name: NamePath) => any;
  getFieldWarning: (name: NamePath) => ReactNode[];
  isFieldsTouched: (names?: NamePath[] | boolean, all?: boolean) => boolean;
  isFieldsValidating: (names?: NamePath[]) => boolean;
  isFieldTouched: (name: NamePath) => boolean;
  isFieldValidating: (name: NamePath) => boolean;
  readonly [localFormInstanceBrand]: FormEngine<T>;
  resetFields: (names?: NamePath[]) => void;
  scrollToField: (
    name: NamePath,
    options?: boolean | (ScrollIntoViewOptions & { focus?: boolean }),
  ) => void;
  setFields: (fields: FieldData[]) => void;
  setFieldsValue: (values: PartialValues<T>) => void;
  setFieldValue: (name: NamePath, value: any) => void;
  submit: () => void;
  validateFields: (names?: NamePath[] | ValidateOptions, options?: ValidateOptions) => Promise<T>;
}

export interface FieldRegistration {
  dependencies?: NamePath[];
  fieldId?: string;
  initialValue?: any;
  isList?: boolean;
  label?: ReactNode;
  messageVariables?: Record<string, string>;
  preserve?: boolean;
  rules?: Rule[];
  validateFirst?: boolean | 'parallel';
}

interface Entry {
  configurations: Map<symbol, () => FieldRegistration>;
  meta: FieldMeta;
  node?: any;
  resetVersion: number;
  sequence: number;
}

export interface FormCallbacks {
  onFieldsChange?: (changed: FieldData[], all: FieldData[]) => void;
  onFinish?: (values: any) => any;
  onFinishFailed?: (error: ValidationFailure) => void;
  onValuesChange?: (changed: Values, values: Values) => void;
  providerChange?: (fields: FieldData[]) => void;
  providerFinish?: (values: Values) => void;
}

export interface ValidationMessages {
  invalid: (label: string) => string;
  required: (label: string) => string;
}

export const toPath = (name: NamePath): Array<string | number> =>
  Array.isArray(name) ? name : [name];
const keyOf = (name: NamePath) => JSON.stringify(toPath(name));
const rhfKey = (name: NamePath) =>
  `field_${keyOf(name)
    .split('')
    .map((c) => c.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')}`;
const contains = (parent: NamePath, child: NamePath) => {
  const a = toPath(parent);
  const b = toPath(child);
  return a.length <= b.length && a.every((part, index) => part === b[index]);
};
const plain = (value: any): value is Values =>
  value !== null &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const cloneValues = <T>(value: T): T =>
  Array.isArray(value)
    ? (value.map(cloneValues) as T)
    : plain(value)
      ? (Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, cloneValues(child)]),
        ) as T)
      : value;
export const getAt = (value: any, name: NamePath): any =>
  toPath(name).reduce(
    (v, part) => (v !== null && v !== undefined && Object.hasOwn(v, part) ? v[part] : undefined),
    value,
  );
const setAt = (source: Values, name: NamePath, value: any): Values => {
  const path = toPath(name);
  const result = cloneValues(source);
  let parent: any = result;
  path.forEach((part, index) => {
    const last = index === path.length - 1;
    const current = Object.hasOwn(parent, part) ? parent[part] : undefined;
    const child = last
      ? cloneValues(value)
      : Array.isArray(current) || plain(current)
        ? current
        : typeof path[index + 1] === 'number'
          ? []
          : {};
    Object.defineProperty(parent, part, {
      configurable: true,
      enumerable: true,
      value: child,
      writable: true,
    });
    parent = child;
  });
  return result;
};
const mergeValues = (target: Values, source: Values): Values => {
  let result = cloneValues(target);
  for (const [key, value] of Object.entries(source)) {
    result = setAt(
      result,
      [key],
      plain(value) && plain(result[key]) ? mergeValues(result[key], value) : value,
    );
  }
  return result;
};
const empty = (value: any) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);
const emptyMeta = (name: NamePath): FieldMeta => ({
  errors: [],
  name: toPath(name),
  touched: false,
  validated: false,
  validating: false,
  warnings: [],
});

// Validation transforms are confined to the rule. Stored and submitted values remain raw.
const invalidBuiltin = (rule: RuleObject, value: any) =>
  !z
    .any()
    .superRefine((v, context) => {
      let invalid = false;
      switch (rule.type) {
        case 'array': {
          invalid = !Array.isArray(v);
          break;
        }
        case 'boolean': {
          invalid = typeof v !== 'boolean';
          break;
        }
        case 'date': {
          invalid = !(v instanceof Date) || Number.isNaN(v.valueOf());
          break;
        }
        case 'email': {
          invalid = !z.string().email().safeParse(v).success;
          break;
        }
        case 'enum': {
          invalid = !rule.enum?.includes(v);
          break;
        }
        case 'float':
        case 'number': {
          invalid = typeof v !== 'number' || !Number.isFinite(v);
          break;
        }
        case 'hex': {
          invalid = typeof v !== 'string' || !/^(?:0x)?[\da-f]+$/i.test(v);
          break;
        }
        case 'integer': {
          invalid = !Number.isInteger(v);
          break;
        }
        case 'method': {
          invalid = typeof v !== 'function';
          break;
        }
        case 'object': {
          invalid = !plain(v);
          break;
        }
        case 'regexp': {
          invalid = !(v instanceof RegExp);
          break;
        }
        case 'string': {
          invalid = typeof v !== 'string';
          break;
        }
        case 'tel': {
          invalid = typeof v !== 'string' || !/^[+\d][\d\s()-]*$/.test(v);
          break;
        }
        case 'url': {
          invalid = !z.string().url().safeParse(v).success;
          break;
        }
      }
      if (rule.enum && !rule.enum.includes(v)) invalid = true;
      if (rule.whitespace && typeof v === 'string' && !v.trim()) invalid = true;
      if (rule.pattern) {
        const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
        if (!pattern.test(String(v))) invalid = true;
      }
      const length =
        typeof v === 'number'
          ? v
          : typeof v === 'string'
            ? Array.from(v).length
            : Array.isArray(v)
              ? v.length
              : undefined;
      if (
        length !== undefined &&
        ((rule.len !== undefined && length !== rule.len) ||
          (rule.min !== undefined && length < rule.min) ||
          (rule.max !== undefined && length > rule.max))
      )
        invalid = true;
      if (invalid) context.addIssue({ code: 'custom', message: 'invalid' });
    })
    .safeParse(value).success;

const callValidator = (rule: RuleObject, value: any): Promise<void> =>
  new Promise((resolve, reject) => {
    let usesPromise = false;
    const done = (error?: string | Error) => {
      void Promise.resolve().then(() => {
        if (!usesPromise) {
          if (error) reject(error);
          else resolve();
        }
      });
    };
    try {
      const result = rule.validator?.(rule, value, done);
      usesPromise = !!result && typeof result.then === 'function';
      if (usesPromise) result.then(resolve, reject);
      else if ((rule.validator?.length ?? 0) < 3) resolve();
    } catch (error) {
      reject(error);
    }
  });

export class FormEngine<T = any> {
  readonly form: FormInstance<T>;
  private readonly rhf = createFormControl<Values>({
    criteriaMode: 'all',
    shouldUnregister: false,
  });
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly nodes = new Map<string, any>();
  private values: Values = {};
  private initialValues: Values = {};
  private initialized = false;
  private version = 0;
  private valueVersion = 0;
  private validationSequence = 0;
  private callbacks: FormCallbacks = {};
  private messages: ValidationMessages = {
    invalid: (label) => `${label} is invalid`,
    required: (label) => `${label} is required`,
  };
  private validationMessages: Record<string, any> = {};
  preserve = true;

  constructor() {
    // Public subscribe activates RHF's store before any fields mount. No private control hooks.
    this.rhf.subscribe({ callback: () => {}, formState: { values: true } });
    this.form = {
      [localFormInstanceBrand]: this,
      focusField: (name) => this.fieldNode(name)?.focus?.(),
      getFieldError: (name) => this.meta(name).errors,
      getFieldInstance: (name) => this.nodes.get(keyOf(name)),
      getFieldValue: (name) => getAt(this.values, name),
      getFieldWarning: (name) => this.meta(name).warnings,
      getFieldsError: (names) =>
        (names ? names.map(this.meta) : [...this.entries.values()].map((entry) => entry.meta)).map(
          (meta) => ({ errors: meta.errors, name: meta.name, warnings: meta.warnings }),
        ),
      getFieldsValue: (names, filter) => this.getValues(names, filter) as T,
      isFieldTouched: (name) =>
        this.selectedEntries([name], true).some((entry) => entry.meta.touched),
      isFieldValidating: (name) => this.meta(name).validating,
      isFieldsTouched: (names, all) => {
        if (Array.isArray(names)) {
          const touched = names.map((name) =>
            this.selectedEntries([name], true).some((entry) => entry.meta.touched),
          );
          return all ? touched.every(Boolean) : touched.some(Boolean);
        }
        const list = this.selectedEntries();
        return names
          ? list.every(
              (entry) =>
                entry.meta.touched ||
                [...entry.configurations.values()].some((get) => get().isList),
            )
          : list.some((entry) => entry.meta.touched);
      },
      isFieldsValidating: (names) =>
        this.selectedEntries(names).some((entry) => entry.meta.validating),
      resetFields: (names) => this.reset(names),
      scrollToField: (name, options) => {
        const node = this.fieldNode(name);
        node?.scrollIntoView?.(
          options === undefined || typeof options === 'boolean'
            ? options
            : { block: 'nearest', ...options },
        );
        if (typeof options === 'object' && options.focus) node?.focus?.();
      },
      setFieldValue: (name, value) => this.setOne(name, value, false),
      setFields: (fields) => this.setFields(fields),
      setFieldsValue: (values) => this.setMany(values as Values),
      submit: () => {
        void this.submit();
      },
      validateFields: (names, options) =>
        this.validate(
          Array.isArray(names) ? names : undefined,
          Array.isArray(names) ? options : (names ?? options),
        ),
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  meta = (name: NamePath) => this.entries.get(keyOf(name))?.meta ?? emptyMeta(name);
  resetVersion = (name: NamePath) => this.entries.get(keyOf(name))?.resetVersion ?? 0;
  hasField = (name: NamePath) => this.entries.has(keyOf(name));
  clear() {
    this.values = {};
    this.initialized = false;
    this.valueVersion++;
    this.rhf.reset({});
    this.emit();
  }

  configure(
    callbacks: FormCallbacks,
    messages: ValidationMessages,
    validationMessages?: Record<string, any>,
    preserve = true,
  ) {
    this.callbacks = callbacks;
    this.messages = messages;
    this.validationMessages = validationMessages ?? {};
    this.preserve = preserve;
  }

  initialize(initialValues: Values = {}) {
    this.initialValues = cloneValues(initialValues);
    if (this.initialized) return;
    this.values = mergeValues(this.initialValues, this.values);
    this.initialized = true;
  }

  register(name: NamePath, token: symbol, configuration: () => FieldRegistration) {
    const key = keyOf(name);
    const config = configuration();
    const entry = this.entries.get(key) ?? {
      configurations: new Map(),
      meta: emptyMeta(name),
      resetVersion: 0,
      sequence: 0,
    };
    entry.configurations.set(token, configuration);
    this.entries.set(key, entry);
    if (getAt(this.values, name) === undefined && config.initialValue !== undefined)
      this.values = setAt(this.values, name, config.initialValue);
    this.registerRHF(entry);
    this.rhf.setValue(rhfKey(name), getAt(this.values, name));
    this.emit();
    return () => {
      entry.configurations.delete(token);
      if (entry.configurations.size) return;
      entry.sequence++;
      this.valueVersion++;
      this.entries.delete(key);
      this.nodes.delete(key);
      this.rhf.unregister(rhfKey(name), { keepValue: true });
      if (!(configuration().preserve ?? this.preserve)) {
        this.values = setAt(this.values, name, getAt(this.initialValues, name));
        this.valueVersion++;
      }
      this.emit();
    };
  }

  attach(name: NamePath, node: any) {
    if (node) this.nodes.set(keyOf(name), node);
    else this.nodes.delete(keyOf(name));
  }

  change(name: NamePath, value: any) {
    this.setOne(name, value, true);
    for (const entry of this.entries.values()) {
      if (!entry.meta.touched && !entry.meta.validated) continue;
      if (
        [...entry.configurations.values()].some((get) =>
          get().dependencies?.some(
            (dependency) => contains(dependency, name) || contains(name, dependency),
          ),
        )
      ) {
        void this.validate([entry.meta.name]).catch(() => {});
      }
    }
  }

  async validate(names?: NamePath[], options: ValidateOptions = {}, trigger?: string): Promise<T> {
    const sequence = ++this.validationSequence;
    const valueVersion = this.valueVersion;
    const entries = this.selectedEntries(names, options.recursive).filter(
      (entry) =>
        [...entry.configurations.values()].some((get) => get().rules?.length) &&
        (!options.dirty || entry.meta.touched || entry.meta.validated),
    );
    const results = await Promise.all(
      entries.map(async (entry) => {
        const run = ++entry.sequence;
        let errors: ReactNode[] = [];
        let warnings: ReactNode[] = [];
        if (!options.validateOnly) {
          entry.meta = { ...entry.meta, validating: true };
          this.notifyFields([entry]);
          this.emit();
        }
        this.registerRHF(entry, async () => {
          const result = await this.validateRules(entry, trigger);
          errors = result.errors;
          warnings = result.warnings;
          return errors.length ? String(errors[0] ?? '') : true;
        });
        try {
          await this.rhf.trigger(rhfKey(entry.meta.name));
        } catch (failure) {
          errors = [
            failure instanceof Error
              ? failure.message
              : this.messages.invalid(entry.meta.name.join('.')),
          ];
        }
        if (run === entry.sequence && !options.validateOnly) {
          entry.meta = { ...entry.meta, errors, validated: true, validating: false, warnings };
          this.notifyFields([entry]);
          this.emit();
        }
        return { errors, name: entry.meta.name };
      }),
    );
    const errorFields = results.filter((result) => result.errors.length);
    const outOfDate = sequence !== this.validationSequence || valueVersion !== this.valueVersion;
    const values = this.getValues(names) as T;
    if (errorFields.length || outOfDate)
      throw { errorFields, outOfDate, values } satisfies ValidationFailure<T>;
    return values;
  }

  validateTrigger(name: NamePath, trigger: string) {
    void this.validate([name], {}, trigger).catch(() => {});
  }

  private emit() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
  private fieldNode(name: NamePath) {
    const instance = this.nodes.get(keyOf(name));
    const node = instance?.nativeElement ?? instance?.input ?? instance;
    if (node?.scrollIntoView || node?.focus) return node;
    const id = [...(this.entries.get(keyOf(name))?.configurations.values() ?? [])]
      .map((get) => get().fieldId)
      .find(Boolean);
    return typeof document === 'undefined' || !id ? undefined : document.getElementById(id);
  }
  private selectedEntries(names?: NamePath[], recursive = false) {
    return [...this.entries.values()].filter(
      (entry) =>
        !names ||
        names.some((name) =>
          recursive ? contains(name, entry.meta.name) : keyOf(name) === keyOf(entry.meta.name),
        ),
    );
  }
  private getValues(
    names?: NamePath[] | true | { filter?: (meta: FieldMeta) => boolean; strict?: boolean },
    filter?: (meta: FieldMeta) => boolean,
  ) {
    if (names === true && !filter) return cloneValues(this.values);
    const predicate = typeof names === 'object' && !Array.isArray(names) ? names.filter : filter;
    const candidates = [...this.entries.values()];
    const isList = (entry: Entry) => [...entry.configurations.values()].some((get) => get().isList);
    const lists = candidates.filter(
      (entry) =>
        isList(entry) &&
        (!Array.isArray(names) || names.some((name) => keyOf(name) === keyOf(entry.meta.name))),
    );
    const paths = Array.isArray(names)
      ? names.filter(
          (name) =>
            !lists.some((entry) => keyOf(entry.meta.name) === keyOf(name)) &&
            (!predicate || predicate(this.meta(name))),
        )
      : candidates
          .filter((entry) => !isList(entry) && (!predicate || predicate(entry.meta)))
          .map((entry) => entry.meta.name);
    let result = paths.reduce(
      (result, path) => setAt(result, path, getAt(this.values, path)),
      {} as Values,
    );
    for (const entry of lists)
      if (!getAt(result, entry.meta.name)) result = setAt(result, entry.meta.name, []);
    return result;
  }
  private notifyFields(entries: Entry[]) {
    const data = (entry: Entry): FieldData => ({
      ...entry.meta,
      value: getAt(this.values, entry.meta.name),
    });
    const changed = entries.map(data);
    this.callbacks.providerChange?.(changed);
    this.callbacks.onFieldsChange?.(changed, [...this.entries.values()].map(data));
  }
  private registerRHF(entry: Entry, validator?: () => Promise<string | true>) {
    this.rhf.register(rhfKey(entry.meta.name), {
      validate:
        validator ??
        (async () => {
          const result = await this.validateRules(entry);
          return result.errors.length ? String(result.errors[0] ?? '') : true;
        }),
    });
  }
  private setOne(name: NamePath, value: any, user: boolean) {
    const previous = getAt(this.values, name);
    this.values = setAt(this.values, name, value);
    this.valueVersion++;
    const affected = [...this.entries.values()].filter(
      (entry) => contains(name, entry.meta.name) || contains(entry.meta.name, name),
    );
    for (const entry of affected) {
      entry.sequence++;
      entry.meta = {
        ...entry.meta,
        errors: [],
        touched: user || entry.meta.touched,
        validating: false,
        warnings: [],
      };
      this.rhf.setValue(rhfKey(entry.meta.name), getAt(this.values, entry.meta.name), {
        shouldDirty: user,
        shouldTouch: user,
      });
      this.rhf.clearErrors(rhfKey(entry.meta.name));
    }
    this.rhf.setValue(rhfKey(name), value, { shouldDirty: user, shouldTouch: user });
    this.rhf.clearErrors(rhfKey(name));
    this.emit();
    if (user && previous !== value) {
      this.callbacks.onValuesChange?.(setAt({}, name, value), this.getValues());
      if (affected.length) this.notifyFields(affected);
    }
  }
  private setMany(values: Values) {
    const previous = this.values;
    this.values = mergeValues(this.values, values);
    this.valueVersion++;
    for (const entry of this.entries.values()) {
      if (!Object.hasOwn(values, entry.meta.name[0])) continue;
      if (isEqual(getAt(previous, entry.meta.name), getAt(this.values, entry.meta.name))) continue;
      entry.sequence++;
      entry.meta = { ...entry.meta, errors: [], touched: true, validating: false, warnings: [] };
      this.rhf.setValue(rhfKey(entry.meta.name), getAt(this.values, entry.meta.name));
      this.rhf.clearErrors(rhfKey(entry.meta.name));
    }
    this.emit();
  }
  private setFields(fields: FieldData[]) {
    for (const data of fields) {
      if (Object.hasOwn(data, 'value')) this.setOne(data.name, data.value, false);
      const entry = this.entries.get(keyOf(data.name));
      if (entry)
        entry.meta = {
          ...entry.meta,
          ...(Object.hasOwn(data, 'errors') ? { errors: data.errors ?? [] } : {}),
          ...(Object.hasOwn(data, 'warnings') ? { warnings: data.warnings ?? [] } : {}),
          ...(data.touched !== undefined ? { touched: data.touched } : {}),
          ...(data.validating !== undefined ? { validating: data.validating } : {}),
          name: toPath(data.name),
        };
    }
    this.emit();
  }
  private reset(names?: NamePath[]) {
    if (!names) this.values = cloneValues(this.initialValues);
    else
      for (const name of names)
        this.values = setAt(this.values, name, getAt(this.initialValues, name));
    for (const entry of this.entries.values()) {
      if (names && !names.some((name) => contains(name, entry.meta.name))) continue;
      const fieldInitial = [...entry.configurations.values()]
        .map((get) => get().initialValue)
        .find((value) => value !== undefined);
      if (getAt(this.values, entry.meta.name) === undefined && fieldInitial !== undefined)
        this.values = setAt(this.values, entry.meta.name, fieldInitial);
      entry.sequence++;
      entry.resetVersion++;
      entry.meta = emptyMeta(entry.meta.name);
      this.rhf.setValue(rhfKey(entry.meta.name), getAt(this.values, entry.meta.name));
      this.rhf.clearErrors(rhfKey(entry.meta.name));
    }
    this.valueVersion++;
    this.emit();
  }
  private message(
    rule: RuleObject,
    registration: FieldRegistration,
    required: boolean,
    name: NamePath,
  ): ReactNode {
    if (rule.message !== undefined) return rule.message;
    const label =
      registration.messageVariables?.label ??
      (typeof registration.label === 'string' ? registration.label : toPath(name).join('.'));
    const template = required
      ? this.validationMessages.required
      : (this.validationMessages.types?.[rule.type ?? 'string'] ?? this.validationMessages.default);
    const variables: Record<string, string> = {
      name: toPath(name).join('.'),
      label,
      ...registration.messageVariables,
    };
    return typeof template === 'string'
      ? template.replaceAll(
          /\$\{(\w+)\}/g,
          (_, key: string) => variables[key] ?? String(rule[key as keyof RuleObject] ?? ''),
        )
      : required
        ? this.messages.required(label)
        : this.messages.invalid(label);
  }
  private async validateRules(entry: Entry, trigger?: string) {
    const errors: ReactNode[] = [];
    const warnings: ReactNode[] = [];
    const raw = cloneValues(getAt(this.values, entry.meta.name));
    for (const get of entry.configurations.values()) {
      const registration = get();
      const rules = (registration.rules ?? [])
        .map((rule) => (typeof rule === 'function' ? rule(this.form) : rule))
        .filter(
          (rule) =>
            !trigger || !rule.validateTrigger || [rule.validateTrigger].flat().includes(trigger),
        )
        .sort((a, b) => Number(!!a.warningOnly) - Number(!!b.warningOnly));
      const validateRule = async (
        rule: RuleObject,
        input: any,
      ): Promise<ReactNode[] | undefined> => {
        try {
          const value = rule.transform ? rule.transform(input) : input;
          // A custom validator owns its rule, including optional/required handling.
          if (rule.validator) await callValidator(rule, value);
          else {
            const required = rule.required === true && empty(value);
            const present = !empty(value) || Array.isArray(value);
            if (required || (present && invalidBuiltin(rule, value)))
              return [this.message(rule, registration, required, entry.meta.name)];
          }
          const nested: ReactNode[] = [];
          if (rule.defaultField && Array.isArray(value)) {
            for (const child of value)
              nested.push(...((await validateRule(rule.defaultField, child)) ?? []));
          }
          if (rule.fields && value !== null && typeof value === 'object') {
            for (const [key, children] of Object.entries(rule.fields)) {
              for (const child of [children].flat())
                nested.push(...((await validateRule(child, value[key])) ?? []));
            }
          }
          return nested.length ? nested : undefined;
        } catch (failure) {
          const fallback = this.message(rule, registration, false, entry.meta.name);
          return rule.message !== undefined
            ? [rule.message]
            : [
                failure instanceof Error
                  ? failure.message
                  : typeof failure === 'string'
                    ? failure
                    : fallback,
              ];
        }
      };
      const collect = (rule: RuleObject, result: ReactNode[] | undefined) => {
        if (result) (rule.warningOnly ? warnings : errors).push(...result);
      };
      if (registration.validateFirst === true) {
        for (const rule of rules) {
          const result = await validateRule(rule, raw);
          collect(rule, result);
          if (result) break;
        }
      } else if (registration.validateFirst === 'parallel') {
        const result = await new Promise<{ rule: RuleObject; errors: ReactNode[] } | undefined>(
          (resolve) => {
            let remaining = rules.length;
            if (!remaining) resolve(undefined);
            for (const rule of rules)
              void validateRule(rule, raw).then((result) => {
                if (result) resolve({ errors: result, rule });
                if (--remaining === 0) resolve(undefined);
              });
          },
        );
        if (result) collect(result.rule, result.errors);
      } else {
        const results = await Promise.all(rules.map((rule) => validateRule(rule, raw)));
        results.forEach((result, index) => collect(rules[index], result));
      }
    }
    return { errors, warnings };
  }
  private async submit() {
    let values: T;
    try {
      values = await this.validate();
    } catch (failure) {
      this.callbacks.onFinishFailed?.(failure as ValidationFailure);
      return;
    }
    this.callbacks.providerFinish?.(values as Values);
    await this.callbacks.onFinish?.(values);
  }
}

export const createLocalForm = <T>() => new FormEngine<T>();
export const engineOf = <T>(form: FormInstance<T>): FormEngine<T> => {
  const engine = form?.[localFormInstanceBrand];
  if (!(engine instanceof FormEngine))
    throw new Error('GroupForm requires a local instance created by GroupForm.useForm.');
  return engine;
};
