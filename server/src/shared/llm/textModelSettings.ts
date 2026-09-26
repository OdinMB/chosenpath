import { assertSupportedSettings, modelFamily } from "./chatModel.js";

/*
 * Which model, reasoning effort and temperature each text role uses, read from
 * env with today's defaults. Background: .context/text-model-eval.md.
 *
 * Five setting groups. Existing env names keep their meaning:
 *   setup            SETUP_MODEL_*, or GENERATION_MODEL_* when SETUP_MODEL_NAME is unset
 *   template editor  GENERATION_MODEL_*
 *   beats            TEXT_MODEL_*            (+ MULTIPLAYER_TEXT_MODEL_*)
 *   analysis         SWITCH_THREAD_MODEL_*   (+ MULTIPLAYER_SWITCH_THREAD_MODEL_*)
 *   content filter   CONTENT_FILTER_MODEL_*
 * Each group reads _NAME, _TEMPERATURE and _REASONING_EFFORT.
 */

export type TextRole =
  | "setup"
  | "templateGeneration"
  | "templateIteration"
  | "beat"
  | "switchAnalysis"
  | "threadAnalysis"
  | "contentFilter";

export const REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const VERBOSITIES = ["low", "medium", "high"] as const;
export type Verbosity = (typeof VERBOSITIES)[number];

/** Settings as they may arrive (env, CLI); assertSupportedSettings narrows them. */
export type UncheckedTextModelSettings = {
  model: string;
  temperature?: number;
  reasoningEffort?: string;
  verbosity?: string;
};

export type TextModelSettings = {
  model: string;
  /** gpt-4.x only */
  temperature?: number;
  /** gpt-6 only; always set there */
  reasoningEffort?: ReasoningEffort;
  /** gpt-6 only; no env var yet (probe and later arms) */
  verbosity?: Verbosity;
};

export type TextModelConfig = {
  setup: TextModelSettings;
  templateEditor: TextModelSettings;
  beat: TextModelSettings;
  analysis: TextModelSettings;
  contentFilter: TextModelSettings;
  /** Only when MULTIPLAYER_TEXT_MODEL_NAME is set */
  multiplayerBeat?: TextModelSettings;
  /** Only when MULTIPLAYER_SWITCH_THREAD_MODEL_NAME is set */
  multiplayerAnalysis?: TextModelSettings;
};

export type Env = Record<string, string | undefined>;

const DEFAULT_TEMPERATURE = 0.2;
const LARGE_DEFAULT_MODEL = "gpt-4.1";
const SMALL_DEFAULT_MODEL = "gpt-4.1-mini";

/** An empty string counts as unset, as `||` treated it before. */
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseTemperature(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`${name} must be a number between 0 and 2`);
  }
  return value;
}

function readGroup(
  env: Env,
  prefix: string,
  defaultModel: string,
  warn: (message: string) => void
): TextModelSettings {
  const model = read(env, `${prefix}_NAME`) ?? defaultModel;
  const rawTemperature = read(env, `${prefix}_TEMPERATURE`);
  const rawEffort = read(env, `${prefix}_REASONING_EFFORT`);

  let settings: UncheckedTextModelSettings;
  if (modelFamily(model) === "gpt-4.x") {
    // Effort is ignored here: today's configured "minimal" must keep working
    settings = {
      model,
      temperature:
        rawTemperature === undefined
          ? DEFAULT_TEMPERATURE
          : parseTemperature(`${prefix}_TEMPERATURE`, rawTemperature),
    };
  } else {
    if (rawTemperature !== undefined) {
      warn(`${prefix}_TEMPERATURE is ignored for ${model} (GPT-6 takes no temperature)`);
    }
    if (rawEffort === undefined) {
      throw new Error(
        `${prefix}_REASONING_EFFORT must be set for ${model} (none, low, medium or high)`
      );
    }
    settings = { model, reasoningEffort: rawEffort };
  }
  assertSupportedSettings(settings);
  return settings;
}

/** Reads every text role's settings; throws on an unsupported configuration. */
export function resolveTextModelConfig(
  env: Env,
  warn: (message: string) => void = console.warn
): TextModelConfig {
  const setupPrefix = read(env, "SETUP_MODEL_NAME") ? "SETUP_MODEL" : "GENERATION_MODEL";
  const config: TextModelConfig = {
    setup: readGroup(env, setupPrefix, LARGE_DEFAULT_MODEL, warn),
    templateEditor: readGroup(env, "GENERATION_MODEL", LARGE_DEFAULT_MODEL, warn),
    beat: readGroup(env, "TEXT_MODEL", SMALL_DEFAULT_MODEL, warn),
    analysis: readGroup(env, "SWITCH_THREAD_MODEL", SMALL_DEFAULT_MODEL, warn),
    contentFilter: readGroup(env, "CONTENT_FILTER_MODEL", SMALL_DEFAULT_MODEL, warn),
  };
  // A multiplayer override applies only when its _NAME is set, and then fully
  if (read(env, "MULTIPLAYER_TEXT_MODEL_NAME")) {
    config.multiplayerBeat = readGroup(env, "MULTIPLAYER_TEXT_MODEL", SMALL_DEFAULT_MODEL, warn);
  }
  if (read(env, "MULTIPLAYER_SWITCH_THREAD_MODEL_NAME")) {
    config.multiplayerAnalysis = readGroup(
      env,
      "MULTIPLAYER_SWITCH_THREAD_MODEL",
      SMALL_DEFAULT_MODEL,
      warn
    );
  }
  return config;
}

/** The settings one call uses. */
export function settingsFor(
  config: TextModelConfig,
  role: TextRole,
  options: { multiplayer: boolean } = { multiplayer: false }
): TextModelSettings {
  switch (role) {
    case "setup":
      return config.setup;
    case "templateGeneration":
    case "templateIteration":
      return config.templateEditor;
    case "beat":
      return (options.multiplayer && config.multiplayerBeat) || config.beat;
    case "switchAnalysis":
    case "threadAnalysis":
      return (options.multiplayer && config.multiplayerAnalysis) || config.analysis;
    case "contentFilter":
      return config.contentFilter;
  }
}
