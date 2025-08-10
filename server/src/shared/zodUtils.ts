import { z } from "zod";
import { Logger } from "shared/logger.js";

/**
 * A utility function to recursively examine a Zod schema and print its structure
 * Provides detailed information about schema types, descriptions, and nested structures
 */
export function printZodSchema(
  schema: z.ZodTypeAny,
  name = "Schema",
  level = 0
): void {
  const indent = "  ".repeat(level);
  const typeName = schema._def.typeName;
  const description = "description" in schema ? schema.description : undefined;

  Logger.Story.log(
    `${indent}${name} (${typeName})${description ? `: ${description}` : ""}`
  );

  // Handle different schema types
  if (typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    Logger.Story.log(`${indent}Properties:`);
    Object.entries(shape).forEach(([key, fieldSchema]) => {
      printZodSchema(fieldSchema as z.ZodTypeAny, key, level + 1);
    });
  } else if (typeName === "ZodArray") {
    const elementSchema = (schema as z.ZodArray<z.ZodTypeAny>).element;
    Logger.Story.log(`${indent}Element Type:`);
    printZodSchema(elementSchema, "element", level + 1);
  } else if (typeName === "ZodUnion") {
    const options = (schema._def as { options: z.ZodTypeAny[] }).options;
    Logger.Story.log(`${indent}Union Options:`);
    options.forEach((option: z.ZodTypeAny, index: number) => {
      printZodSchema(option, `option_${index}`, level + 1);
    });
  } else if (typeName === "ZodEnum") {
    const values = (schema._def as { values: unknown }).values;
    Logger.Story.log(`${indent}Enum Values: ${JSON.stringify(values)}`);
  } else if (typeName === "ZodRecord") {
    Logger.Story.log(`${indent}Record:`);
    const { keyType: keySchema, valueType: valueSchema } = schema._def as {
      keyType: z.ZodTypeAny;
      valueType: z.ZodTypeAny;
    };
    printZodSchema(keySchema, "key", level + 1);
    printZodSchema(valueSchema, "value", level + 1);
  } else if (typeName === "ZodTuple") {
    const items = (schema._def as { items: z.ZodTypeAny[] }).items;
    Logger.Story.log(`${indent}Tuple Items:`);
    items.forEach((item: z.ZodTypeAny, index: number) => {
      printZodSchema(item, `item_${index}`, level + 1);
    });
  } else if (typeName === "ZodIntersection") {
    Logger.Story.log(`${indent}Intersection:`);
    const { left, right } = schema._def as {
      left: z.ZodTypeAny;
      right: z.ZodTypeAny;
    };
    printZodSchema(left, "left", level + 1);
    printZodSchema(right, "right", level + 1);
  }
}

type SchemaStructure = {
  typeName: string;
  description?: string;
  properties?: Record<string, SchemaStructure>;
  items?: SchemaStructure | SchemaStructure[];
  options?: SchemaStructure[];
  values?: unknown;
  keyType?: SchemaStructure;
  valueType?: SchemaStructure;
  left?: SchemaStructure;
  right?: SchemaStructure;
};

/**
 * A simpler utility that returns a structured representation of a Zod schema
 * Useful for detailed logging with JSON.stringify
 */
export function getZodSchemaStructure(schema: z.ZodTypeAny): SchemaStructure {
  const typeName = schema._def.typeName;
  const result: SchemaStructure = {
    typeName,
    ...(schema.description ? { description: schema.description } : {}),
  };

  // Handle different schema types
  if (typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    result.properties = {} as Record<string, SchemaStructure>;
    Object.entries(shape).forEach(([key, fieldSchema]) => {
      (result.properties as Record<string, SchemaStructure>)[key] =
        getZodSchemaStructure(fieldSchema as z.ZodTypeAny);
    });
  } else if (typeName === "ZodArray") {
    const elementSchema = (schema as z.ZodArray<z.ZodTypeAny>).element;
    result.items = getZodSchemaStructure(elementSchema);
  } else if (typeName === "ZodUnion") {
    const options = (schema._def as { options: z.ZodTypeAny[] }).options;
    result.options = options.map((option: z.ZodTypeAny) =>
      getZodSchemaStructure(option)
    );
  } else if (typeName === "ZodEnum") {
    result.values = (schema._def as { values: unknown }).values;
  } else if (typeName === "ZodRecord") {
    const { keyType: keySchema, valueType: valueSchema } = schema._def as {
      keyType: z.ZodTypeAny;
      valueType: z.ZodTypeAny;
    };
    result.keyType = getZodSchemaStructure(keySchema);
    result.valueType = getZodSchemaStructure(valueSchema);
  } else if (typeName === "ZodTuple") {
    const items = (schema._def as { items: z.ZodTypeAny[] }).items;
    result.items = items.map((item: z.ZodTypeAny) =>
      getZodSchemaStructure(item)
    );
  } else if (typeName === "ZodIntersection") {
    const { left, right } = schema._def as {
      left: z.ZodTypeAny;
      right: z.ZodTypeAny;
    };
    result.left = getZodSchemaStructure(left);
    result.right = getZodSchemaStructure(right);
  }

  return result;
}

/**
 * Log a detailed representation of a Zod schema
 * @param schema The Zod schema to analyze
 * @param name Optional name for the schema
 * @param logFullStructure Whether to log the full JSON structure in addition to the tree
 */
export function logZodSchema(
  schema: z.ZodTypeAny,
  name = "Schema",
  logFullStructure = false
): void {
  Logger.Story.log(`===== Zod Schema: ${name} =====`);
  printZodSchema(schema, name);

  if (logFullStructure) {
    const structure = getZodSchemaStructure(schema);
    Logger.Story.log(`\n----- Full Schema Structure -----`);
    Logger.Story.log(JSON.stringify(structure, null, 2));
  }

  Logger.Story.log(`===== End Schema: ${name} =====\n`);
}
