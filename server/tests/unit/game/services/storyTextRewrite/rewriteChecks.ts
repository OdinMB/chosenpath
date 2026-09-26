// Checks shared by the Stage 4 rewrite tests: JSON-schema walks, the stated-once and no-capitals checks

type Json = unknown;

const isRecord = (value: Json): value is Record<string, Json> => value !== null && typeof value === "object" && !Array.isArray(value);

/** The JSON schema without descriptions and array counts: its field set, types, key order and references. */
export function withoutCounts(value: Json): Json {
  if (Array.isArray(value)) return value.map(withoutCounts);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "description" && key !== "minItems" && key !== "maxItems")
      .map(([key, inner]) => [key, withoutCounts(inner)])
  );
}

/** Every description in the JSON schema, in document order (a $ref'd instance counts once, as the model sees it). */
export function descriptionsOf(value: Json): string[] {
  if (Array.isArray(value)) return value.flatMap(descriptionsOf);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === "description" && typeof inner === "string" ? [inner] : descriptionsOf(inner)
  );
}

/** The value at a path of keys (array indexes as strings); throws when the path does not exist. */
export function find(value: Json, path: string[]): Json {
  return path.reduce((current: Json, key) => {
    const next = Array.isArray(current) ? current[Number(key)] : isRecord(current) ? current[key] : undefined;
    if (next === undefined) throw new Error(`No ${key} in the schema at ${path.join(".")}`);
    return next;
  }, value);
}

/** An array schema's minItems and maxItems, where set. */
export function countOf(value: Json): { minItems?: number; maxItems?: number } {
  if (!isRecord(value)) throw new Error("not a schema object");
  const counts: { minItems?: number; maxItems?: number } = {};
  if (typeof value.minItems === "number") counts.minItems = value.minItems;
  if (typeof value.maxItems === "number") counts.maxItems = value.maxItems;
  return counts;
}

const MIN_SENTENCE = 25;

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[-\s]+/, "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter((s) => s.length >= MIN_SENTENCE);
}

/** Normalised sentences of 25 characters or more that occur more than once across the texts. */
export function repeatedSentences(texts: string[]): string[] {
  const seen = new Map<string, number>();
  for (const sentence of texts.flatMap(sentencesOf)) seen.set(sentence, (seen.get(sentence) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([sentence]) => sentence);
}

/**
 * Acronyms, not emphasis: NPC and JSON (the plan's), LLM in production's
 * image-request prompt field, and LGBTQ in production's diversity example.
 */
const ALLOWED_CAPS = new Set(["NPC", "JSON", "LLM", "LGBTQ"]);

/** Words of three or more capital letters, other than the allowed acronyms. */
export function allCapsWords(text: string): string[] {
  return (text.match(/\b[A-Z]{3,}\b/g) ?? []).filter((word) => !ALLOWED_CAPS.has(word));
}
