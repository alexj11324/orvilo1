import { z } from 'zod';

/**
 * Minimal JSON Schema → ZodRawShape converter for the `orvilo_cc` extra-tool
 * surface. Builtin manifests declare `parameters` as ordinary JSON Schema;
 * `McpServer.registerTool` only accepts a `ZodRawShape`, which the SDK turns
 * back into JSON Schema for `tools/list`. Converting the common subset keeps
 * the advertised wire schema faithful to the manifest — required fields,
 * arrays, nested objects, enums, primitives and descriptions survive; shapes
 * outside the subset degrade to `z.any()` (the server-side runtime still
 * validates arguments, so the MCP schema is descriptive, not a trust
 * boundary).
 */

type JsonSchema = {
  additionalProperties?: boolean | JsonSchema;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  maxItems?: number;
  minItems?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string | string[];
};

const describe = (schema: z.ZodTypeAny, node: JsonSchema): z.ZodTypeAny =>
  node.description ? schema.describe(node.description) : schema;

const toZod = (node: JsonSchema | boolean | undefined): z.ZodTypeAny => {
  if (!node || typeof node === 'boolean') return z.any();

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const values = node.enum;
    if (values.every((v) => typeof v === 'string')) {
      return describe(z.enum(values as [string, ...string[]]), node);
    }
    const literals = values.map((v) => z.literal(v as string | number | boolean | null));
    return describe(
      literals.length === 1
        ? literals[0]
        : z.union(literals as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]),
      node,
    );
  }

  const type = Array.isArray(node.type) ? node.type.find((t) => t !== 'null') : node.type;

  switch (type) {
    case 'array': {
      let schema = z.array(toZod(node.items));
      if (typeof node.minItems === 'number') schema = schema.min(node.minItems);
      if (typeof node.maxItems === 'number') schema = schema.max(node.maxItems);
      return describe(schema, node);
    }
    case 'boolean': {
      return describe(z.boolean(), node);
    }
    case 'integer':
    case 'number': {
      return describe(z.number(), node);
    }
    case 'object':
    case undefined: {
      // `type` missing but `properties` present is still an object schema.
      if (!node.properties && type !== 'object') return z.any();
      let schema = z.object(toRawShape(node));
      if (node.additionalProperties && typeof node.additionalProperties === 'object') {
        schema = schema.catchall(toZod(node.additionalProperties));
      }
      return describe(schema, node);
    }
    case 'string': {
      return describe(z.string(), node);
    }
    default: {
      return describe(z.any(), node);
    }
  }
};

/**
 * Convert a manifest `parameters` object schema into the `ZodRawShape`
 * `registerTool` expects: `{properties}` → shape entries, `required` decides
 * optionality. Non-object roots return an empty shape.
 */
export const jsonSchemaToZodRawShape = (schema: JsonSchema | undefined): z.ZodRawShape => {
  if (!schema || typeof schema !== 'object') return {};
  return toRawShape(schema);
};

const toRawShape = (node: JsonSchema): z.ZodRawShape => {
  const required = new Set(node.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const zod = toZod(child);
    shape[key] = required.has(key) ? zod : zod.optional();
  }
  return shape;
};
