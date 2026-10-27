// A fake OpenAI-compatible API for the harness, listening on 127.0.0.1 only.
// Chat completions answer with an instance of the request's JSON schema
// (response_format json_schema, or the forced tool's parameters), filled with
// readable placeholder prose; image generations and edits answer with a
// placeholder picture of the requested size. Nothing here calls out.

import http from "node:http";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const SENTENCES = [
  "The lamps along the harbour wall flicker as the evening tide comes in.",
  "A cart rattles past, loaded with crates that smell of salt and cedar.",
  "Someone has chalked a small arrow on the door, pointing toward the old archive.",
  "The bell in the square rings twice, then falls silent before the hour is done.",
  "Rain gathers on the slate roofs and runs in thin threads down the gutters.",
  "A stranger at the corner table folds a letter and slips it into a coat pocket.",
  "The bridge keeper counts the travellers aloud, as if afraid to lose one.",
  "Somewhere below the street, water moves through tunnels nobody maps any more.",
  "A gull lands on the railing, studies you, and leaves without a sound.",
  "The market stalls close one by one, their awnings rolled up like sails.",
  "An old map on the wall shows a road that no longer exists.",
  "The baker leaves the last loaf on the step, as she does every night.",
];

const NAMES = [
  "Avery Stone",
  "Rowan Hale",
  "Juno Marsh",
  "Ellis Grey",
  "Sasha Reed",
  "Noor Vale",
  "Tobin Ashe",
  "Mira Quill",
  "Casimir Lark",
  "Wren Holloway",
];

/** The first sentence of every multi-paragraph text, so no screenshot passes for model output. */
export const PLACEHOLDER_MARK = "This placeholder scene comes from the local harness's fake model, not from a language model.";

function words(key) {
  return String(key ?? "item")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
}

function snake(key) {
  return words(key).replace(/\s+/g, "_") || "item";
}

function resolvePointer(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#")) return undefined;
  const parts = ref
    .slice(1)
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => decodeURIComponent(part.replace(/~1/g, "/").replace(/~0/g, "~")));
  let node = root;
  for (const part of parts) {
    if (node === null || typeof node !== "object" || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

/** How many items an array gets: the schema's bounds, else what its description asks for, else two. */
export function arrayLength(schema) {
  const description = String(schema.description ?? "");
  let count = 2;
  const exactly = description.match(/\bexactly (\d+|one|two|three|four|five|six)\b/i);
  const range = description.match(/\b(\d+)\s*(?:-|to|–)\s*(\d+)\b/);
  if (exactly) {
    const word = exactly[1].toLowerCase();
    count = NUMBER_WORDS[word] ?? Number(word);
  } else if (/\b(leave (this|it) empty|return an empty list|empty if|an empty list|if this is the first beat)\b/i.test(description)) {
    count = 0;
  } else if (range && Number(range[1]) <= 8) {
    count = Number(range[1]);
  }
  const min = typeof schema.minItems === "number" ? schema.minItems : 0;
  const max = typeof schema.maxItems === "number" ? schema.maxItems : Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, count));
}

/**
 * A value that the given JSON schema accepts. Strings are short readable
 * placeholders (unique, so lists of names never repeat), a field whose
 * description asks for paragraphs gets several, ids are snake_case and an
 * id field that names another list (statId, outcomeId, …) points at an id
 * generated earlier in the same reply. Booleans are true, numbers sit inside
 * their bounds, enums take their first value unless a hint says otherwise.
 * A list of player seats holds each seat once per reply (seatList).
 * `offset` starts the counter behind every number, so replies to different
 * requests never repeat an id or a line.
 */
export function instanceFromSchema(rootSchema, hints = DEFAULT_HINTS, { offset = 0 } = {}) {
  const state = { counter: offset, ids: [], placedSeats: new Set(), root: rootSchema, hints };
  return generate(rootSchema, { key: undefined, index: 0, path: [], depth: 0 }, state);
}

/** Product-specific preferences, keyed by property name: kept small, everything else is generic. */
export const DEFAULT_HINTS = {
  enum: {
    // Stats as percentages read naturally as numbers on screen
    type: ["percentage", "number"],
    imageSource: ["none"],
    resourceType: ["normal"],
    riskType: ["normal"],
  },
  boolean: {
    isAppropriate: true,
  },
};

function next(state) {
  state.counter += 1;
  return state.counter;
}

function generate(schema, ctx, state) {
  if (schema === true || schema === undefined || schema === null) return placeholderString(ctx, state, {});
  if (schema === false) return null;
  if (ctx.depth > 40) return null;
  const deeper = { ...ctx, depth: ctx.depth + 1 };
  if (typeof schema.$ref === "string") {
    const { $ref: pointer, ...rest } = schema;
    const target = resolvePointer(state.root, pointer);
    return generate({ ...(target ?? {}), ...rest }, deeper, state);
  }
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return pickEnum(schema.enum, ctx, state);
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const merged = schema.allOf.reduce(
      (acc, part) => {
        const resolved = typeof part.$ref === "string" ? resolvePointer(state.root, part.$ref) ?? {} : part;
        return {
          ...acc,
          ...resolved,
          properties: { ...(acc.properties ?? {}), ...(resolved.properties ?? {}) },
          required: [...(acc.required ?? []), ...(resolved.required ?? [])],
        };
      },
      { type: "object" }
    );
    return generate(merged, deeper, state);
  }
  const union = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(union) && union.length > 0) {
    const choice = union.find((option) => option && option.type !== "null") ?? union[0];
    return generate({ description: schema.description, ...choice }, deeper, state);
  }
  let type = schema.type;
  if (Array.isArray(type)) type = type.find((t) => t !== "null") ?? "null";
  if (!type) type = schema.properties ? "object" : schema.items ? "array" : "string";
  switch (type) {
    case "object":
      return generateObject(schema, deeper, state);
    case "array":
      return generateArray(schema, deeper, state);
    case "integer":
    case "number":
      return placeholderNumber(schema, type === "integer");
    case "boolean": {
      const hinted = state.hints.boolean?.[ctx.key];
      return typeof hinted === "boolean" ? hinted : true;
    }
    case "null":
      return null;
    default:
      return placeholderString(ctx, state, schema);
  }
}

function generateObject(schema, ctx, state) {
  const result = {};
  const properties = schema.properties ?? {};
  const required = Array.isArray(schema.required) ? schema.required : Object.keys(properties);
  for (const [key, child] of Object.entries(properties)) {
    if (!required.includes(key)) continue;
    result[key] = generate(child, { ...ctx, key, path: [...ctx.path, key], parentKey: ctx.key }, state);
  }
  const names = schema.propertyNames?.enum;
  if (Object.keys(properties).length === 0 && Array.isArray(names) && schema.additionalProperties) {
    for (const name of names) {
      result[name] = generate(schema.additionalProperties, { ...ctx, key: name, path: [...ctx.path, name] }, state);
    }
  }
  return result;
}

const SEAT = /^player\d+$/;

/** The seats a list's items name, when every value its items' enum allows is a player seat (player1, player2, …). */
function seatValues(itemSchema, state) {
  const schema = typeof itemSchema?.$ref === "string" ? { ...(resolvePointer(state.root, itemSchema.$ref) ?? {}), ...itemSchema } : itemSchema;
  const values = schema?.enum;
  return Array.isArray(values) && values.length > 0 && values.every((value) => typeof value === "string" && SEAT.test(value)) ? values : undefined;
}

/**
 * A list of player seats (a switch's or a thread's players): every seat not
 * yet listed in this reply, so the first such list groups all the players
 * and later ones hold none, as the planners must place each player exactly
 * once (planChecks.ts). A list with a minimum fills up from the first seat.
 */
function seatList(schema, seats, state) {
  const max = typeof schema.maxItems === "number" ? schema.maxItems : Number.POSITIVE_INFINITY;
  const min = typeof schema.minItems === "number" ? schema.minItems : 0;
  const list = seats.filter((seat) => !state.placedSeats.has(seat)).slice(0, max);
  for (const seat of list) state.placedSeats.add(seat);
  for (let i = 0; list.length < min; i++) list.push(seats[i % seats.length]);
  return list;
}

function generateArray(schema, ctx, state) {
  if (Array.isArray(schema.items)) {
    return schema.items.map((item, index) => generate(item, { ...ctx, index, listKey: ctx.key }, state));
  }
  const seats = seatValues(schema.items, state);
  if (seats) return seatList(schema, seats, state);
  const count = arrayLength(schema);
  const items = [];
  for (let index = 0; index < count; index++) {
    items.push(generate(schema.items ?? {}, { ...ctx, index, listKey: ctx.key, key: ctx.key }, state));
  }
  return items;
}

function pickEnum(values, ctx, state) {
  const preferred = state.hints.enum?.[ctx.key];
  if (Array.isArray(preferred)) {
    const hit = preferred.find((value) => values.includes(value));
    if (hit !== undefined) return hit;
  }
  // An id chosen from a list the product offers: spread over the list, one per item
  if (/id$/i.test(String(ctx.key ?? ""))) {
    const usable = values.filter((value) => value !== "");
    if (usable.length > 0) return usable[ctx.index % usable.length];
  }
  return values[0];
}

function placeholderNumber(schema, integer) {
  let min = typeof schema.minimum === "number" ? schema.minimum : undefined;
  let max = typeof schema.maximum === "number" ? schema.maximum : undefined;
  if (typeof schema.exclusiveMinimum === "number") min = schema.exclusiveMinimum + (integer ? 1 : 0.5);
  if (typeof schema.exclusiveMaximum === "number") max = schema.exclusiveMaximum - (integer ? 1 : 0.5);
  let value = 0;
  if (min !== undefined && max !== undefined) value = (min + max) / 2;
  else if (min !== undefined) value = Math.max(min, 0);
  else if (max !== undefined) value = Math.min(max, 0);
  if (integer || Number.isInteger(min ?? 0)) value = Math.floor(value);
  if (typeof schema.multipleOf === "number" && schema.multipleOf > 0) {
    value = Math.round(value / schema.multipleOf) * schema.multipleOf;
  }
  return value;
}

function prose(sentences, offset) {
  const out = [];
  for (let i = 0; i < sentences; i++) out.push(SENTENCES[(offset + i) % SENTENCES.length]);
  return out.join(" ");
}

const ID_REFERENCE = /^(.+?)_?id$/i;

function idFor(ctx, state) {
  const n = next(state);
  const owner = ctx.listKey ?? ctx.parentKey ?? "item";
  const id = `${snake(owner).replace(/s$/, "")}_${n}`;
  state.ids.push({ id, owner: String(owner).toLowerCase() });
  return id;
}

/** An id another list holds: statId → an id generated under a key that mentions "stat". */
function referencedId(ctx, state) {
  const match = String(ctx.key).match(ID_REFERENCE);
  if (!match) return undefined;
  const topic = match[1].toLowerCase().replace(/[^a-z]/g, "");
  if (!topic) return undefined;
  const candidates = state.ids.filter((entry) => entry.owner.replace(/[^a-z]/g, "").includes(topic));
  if (candidates.length === 0) return undefined;
  return candidates[ctx.index % candidates.length].id;
}

function placeholderString(ctx, state, schema) {
  const key = String(ctx.key ?? "");
  const description = String(schema.description ?? "");
  const n = next(state);
  let value;
  if (schema.format === "uuid") {
    value = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  } else if (schema.format === "date-time") {
    value = new Date(0).toISOString();
  } else if (schema.format === "email") {
    value = `placeholder${n}@example.com`;
  } else if (schema.format === "uri" || schema.format === "url") {
    value = `http://127.0.0.1/placeholder/${n}`;
  } else if (key === "id") {
    value = idFor(ctx, state);
  } else if (ID_REFERENCE.test(key)) {
    value = referencedId(ctx, state) ?? `${snake(key.replace(/_?id$/i, ""))}_${n}`;
  } else if (/paragraph/i.test(description) || key === "text" && /beat|narrative/i.test(description)) {
    const paragraphs = [];
    for (let p = 0; p < 5; p++) paragraphs.push(prose(3, n + p * 3));
    value = `${PLACEHOLDER_MARK} ${paragraphs.join("\n\n")}`;
  } else if (/name$/i.test(key)) {
    value = `${NAMES[n % NAMES.length]} ${n}`;
  } else if (/title$/i.test(key)) {
    value = `Placeholder ${words(ctx.parentKey ?? key)} ${n}`;
  } else if (/^(personal|object|possessive|reflexive)$/.test(key)) {
    value = { personal: "they", object: "them", possessive: "their", reflexive: "themselves" }[key];
  } else {
    value = `${prose(1, n)} (placeholder ${words(key)} ${n})`;
  }
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) value = value.slice(0, schema.maxLength);
  if (typeof schema.minLength === "number" && value.length < schema.minLength) value = value.padEnd(schema.minLength, ".");
  return value;
}

// ---------------------------------------------------------------- images

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function gradientPixels(width, height, seed) {
  const pixels = Buffer.alloc(width * height * 3);
  const hue = (seed * 47) % 255;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const band = ((Math.floor(x / 32) + Math.floor(y / 32)) % 2) * 12;
      pixels[i] = (hue + (x * 120) / width + band) & 0xff;
      pixels[i + 1] = (90 + (y * 100) / height + band) & 0xff;
      pixels[i + 2] = (180 - (x * 60) / width + band) & 0xff;
    }
  }
  return pixels;
}

/** A valid PNG with a soft gradient: no dependency, no fonts. */
export function placeholderPng(width, height, seed = 1) {
  const pixels = gradientPixels(width, height, seed);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 3 + 1)] = 0;
    pixels.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Parses "1024x1536"; anything else (auto, missing) gives a square. Capped so a placeholder stays cheap. */
export function imageSize(size) {
  const match = String(size ?? "").match(/^(\d+)x(\d+)$/);
  const width = match ? Number(match[1]) : 1024;
  const height = match ? Number(match[2]) : 1024;
  const scale = Math.min(1, 512 / Math.max(width, height));
  return { width: Math.max(8, Math.round(width * scale)), height: Math.max(8, Math.round(height * scale)) };
}

/**
 * Placeholder image bytes in the requested format. JPEG goes through sharp, a
 * dependency the product already has (resolved from the worktree's server
 * package); without it the image is a PNG.
 */
export async function placeholderImage(format, size, seed, sharpFrom) {
  const { width, height } = imageSize(size);
  if (format === "jpeg" || format === "jpg" || format === "webp") {
    try {
      const require = createRequire(sharpFrom);
      const sharp = require("sharp");
      const raw = gradientPixels(width, height, seed);
      const image = sharp(raw, { raw: { width, height, channels: 3 } });
      return { bytes: await (format === "webp" ? image.webp() : image.jpeg({ quality: 70 })).toBuffer(), format };
    } catch {
      // fall through to PNG
    }
  }
  return { bytes: placeholderPng(width, height, seed), format: "png" };
}

// ---------------------------------------------------------------- server

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** The schema a chat completion asks for, and how to answer: as content, or as a call of the forced tool. */
export function requestedSchema(body) {
  const format = body?.response_format;
  if (format?.type === "json_schema" && format.json_schema?.schema) {
    return { schema: format.json_schema.schema, as: "content" };
  }
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  const forced = body?.tool_choice?.function?.name;
  const tool = tools.find((t) => t?.function?.name === forced) ?? (tools.length === 1 ? tools[0] : undefined);
  if (tool?.function) {
    return { schema: tool.function.parameters ?? { type: "object", properties: {} }, as: "tool", name: tool.function.name };
  }
  if (format?.type === "json_object") return { schema: { type: "object", properties: {} }, as: "content" };
  return undefined;
}

function usage(prompt, completion) {
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completionTokens = Math.max(1, Math.ceil(completion.length / 4));
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0 },
  };
}

/** The chat completion a request gets: a schema instance, or plain placeholder prose. */
export function chatCompletion(body, sequence) {
  const model = typeof body?.model === "string" ? body.model : "fake-model";
  const prompt = JSON.stringify(body?.messages ?? []);
  const wanted = requestedSchema(body);
  const id = `chatcmpl-harness-${sequence}`;
  const created = Math.floor(Date.now() / 1000);
  if (wanted) {
    const instance = JSON.stringify(instanceFromSchema(wanted.schema, DEFAULT_HINTS, { offset: sequence * 1000 }));
    const message =
      wanted.as === "tool"
        ? {
            role: "assistant",
            content: null,
            refusal: null,
            tool_calls: [{ id: `call_harness_${sequence}`, type: "function", function: { name: wanted.name, arguments: instance } }],
          }
        : { role: "assistant", content: instance, refusal: null };
    return {
      id,
      object: "chat.completion",
      created,
      model,
      choices: [{ index: 0, message, logprobs: null, finish_reason: wanted.as === "tool" ? "tool_calls" : "stop" }],
      usage: usage(prompt, instance),
    };
  }
  const text = `${PLACEHOLDER_MARK} ${prose(3, sequence)}`;
  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text, refusal: null }, logprobs: null, finish_reason: "stop" }],
    usage: usage(prompt, text),
  };
}

function multipartFields(buffer, contentType) {
  const boundary = String(contentType ?? "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundary) return {};
  const marker = `--${boundary[1] ?? boundary[2]}`;
  const fields = {};
  for (const part of buffer.toString("latin1").split(marker)) {
    const name = part.match(/name="([^"]+)"/);
    if (!name || /filename=/.test(part)) continue;
    const value = part.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, "");
    fields[name[1]] = value;
  }
  return fields;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

/**
 * Starts the fake API on 127.0.0.1 and a port the system picks.
 * `record` gets one entry per request (method, path, model, kind, status), never prompt text.
 * `sharpFrom` is a path inside the package that depends on sharp (for JPEG placeholders).
 */
export async function startFakeOpenAI({ record = () => {}, sharpFrom } = {}) {
  let sequence = 0;
  const server = http.createServer(async (req, res) => {
    sequence += 1;
    const seq = sequence;
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname.replace(/^\/v1(?=\/)/, "");
    try {
      const raw = req.method === "POST" ? await readBody(req) : Buffer.alloc(0);
      if (req.method === "GET" && path === "/models") {
        record({ method: req.method, path, kind: "models", status: 200 });
        return sendJson(res, 200, { object: "list", data: [{ id: "fake-model", object: "model", owned_by: "harness" }] });
      }
      if (req.method === "POST" && path === "/chat/completions") {
        const body = JSON.parse(raw.toString("utf8") || "{}");
        const completion = chatCompletion(body, seq);
        record({ method: req.method, path, model: body.model, kind: requestedSchema(body) ? "structured" : "text", status: 200 });
        if (body.stream) {
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
          const choice = completion.choices[0];
          const chunk = {
            id: completion.id,
            object: "chat.completion.chunk",
            created: completion.created,
            model: completion.model,
            choices: [{ index: 0, delta: { role: "assistant", ...choice.message }, finish_reason: choice.finish_reason }],
            usage: completion.usage,
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          res.end("data: [DONE]\n\n");
          return;
        }
        return sendJson(res, 200, completion);
      }
      if (req.method === "POST" && (path === "/images/generations" || path === "/images/edits")) {
        const fields = /json/i.test(String(req.headers["content-type"]))
          ? JSON.parse(raw.toString("utf8") || "{}")
          : multipartFields(raw, req.headers["content-type"]);
        const format = String(fields.output_format ?? "png");
        const image = await placeholderImage(format, fields.size, seq, sharpFrom);
        const data =
          fields.response_format === "url"
            ? { url: `data:image/${image.format};base64,${image.bytes.toString("base64")}` }
            : { b64_json: image.bytes.toString("base64") };
        record({ method: req.method, path, model: fields.model, kind: "image", status: 200 });
        return sendJson(res, 200, {
          created: Math.floor(Date.now() / 1000),
          data: [data],
          output_format: image.format,
          usage: { input_tokens: 10, output_tokens: 100, total_tokens: 110, input_tokens_details: { text_tokens: 10, image_tokens: 0 } },
        });
      }
      if (req.method === "POST" && path === "/moderations") {
        record({ method: req.method, path, kind: "moderation", status: 200 });
        return sendJson(res, 200, {
          id: `modr-harness-${seq}`,
          model: "fake-moderation",
          results: [{ flagged: false, categories: {}, category_scores: {} }],
        });
      }
      record({ method: req.method, path, kind: "unhandled", status: 404 });
      return sendJson(res, 404, { error: { message: `The harness's fake API has no ${req.method} ${path}`, type: "invalid_request_error" } });
    } catch (error) {
      record({ method: req.method, path, kind: "error", status: 500 });
      return sendJson(res, 500, { error: { message: error instanceof Error ? error.message : String(error), type: "server_error" } });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
