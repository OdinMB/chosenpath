import { assertSupportedSettings, modelFamily } from "./chatModel.js";

/*
 * Which model and reasoning effort each production text role uses, read from
 * env with the GPT-6 defaults the owner and coordinator settled on
 * 2026-09-27. Background: .context/text-model-eval.md.
 *
 * Seven setting groups, each read from its own prefix and nothing else:
 *   setup                 SETUP_MODEL_*                       gpt-6-luna low
 *   template editor       GENERATION_MODEL_*                  gpt-6.1-sol low
 *   beats                 TEXT_MODEL_*                        gpt-6-luna medium
 *   multiplayer beats     MULTIPLAYER_TEXT_MODEL_*            gpt-6-luna low
 *   analysis              SWITCH_THREAD_MODEL_*               gpt-6-luna low
 *   multiplayer analysis  MULTIPLAYER_SWITCH_THREAD_MODEL_*   gpt-6-luna low
 *   content filter        CONTENT_FILTER_MODEL_*              gpt-6-luna low
 * Each group reads _NAME and _REASONING_EFFORT; _TEMPERATURE is ignored with
 * a warning. Production text calls run only on gpt-6 models: a gpt-4.x name
 * stops the server at startup with the variable and its replacement. The
 * eval's comparison arms still run gpt-4.x through the factory directly.
 * gpt-6.1-sol is accepted since 2026-09-30 and is the template editor's
 * default since 2026-10-02; an effort a model does not take (none on
 * gpt-6.1-sol) stops the server too.
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

/**
 * Models that take fewer of REASONING_EFFORTS than the rest, by name prefix.
 * GPT-6.1 Sol (released 2026-09-29) takes low to max but no none or minimal
 * (OpenAI's model page; DOCS/2026-09-30_sol-6-1-assessment.md), and a refused
 * request (400) is never retried, so a none there would fail every call.
 */
const EFFORTS_BY_MODEL: [prefix: string, efforts: readonly ReasoningEffort[]][] = [
  ["gpt-6.1-sol", ["low", "medium", "high"]],
];

/** The reasoning efforts this model takes. */
export function reasoningEffortsFor(model: string): readonly ReasoningEffort[] {
  return EFFORTS_BY_MODEL.find(([prefix]) => model.startsWith(prefix))?.[1] ?? REASONING_EFFORTS;
}

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
  /** gpt-4.x only (the eval's comparison arms) */
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
  multiplayerBeat: TextModelSettings;
  analysis: TextModelSettings;
  multiplayerAnalysis: TextModelSettings;
  contentFilter: TextModelSettings;
};

export type TextModelGroup = keyof TextModelConfig;

export type Env = Record<string, string | undefined>;

type GroupDefault = { prefix: string; model: string; reasoningEffort: ReasoningEffort };

/**
 * The settled defaults (2026-09-27): single-player turns on Luna medium,
 * multiplayer turns on Luna low (medium's 3-player p95 was 62 s, over the
 * 60 s cap), everything else on Luna low. Setup is the only GPT-6 arm inside
 * the setup wait cap. The template editor (AI Draft, AI Iteration) moved to
 * Sol low on 2026-09-28 (owner, from the templates rating page: Sol better on
 * 3 items, the same on 6, worse on none, the repeat agreeing); no player waits
 * on it, and custom-story setup stays on Luna low. It moved to GPT-6.1 Sol low
 * on 2026-10-02 without a rating (owner: "For Sol, let's just assume that 6.1
 * is better than 6."), after one AI Draft through production's path on it
 * (the eval's sol61-smoke stage); same price but for cached input, same
 * measured pace at low (DOCS/2026-09-30_sol-6-1-assessment.md). Rollback:
 * GENERATION_MODEL_NAME=gpt-6-sol with GENERATION_MODEL_REASONING_EFFORT=low.
 */
export const TEXT_MODEL_GROUPS: Record<TextModelGroup, GroupDefault> = {
  setup: { prefix: "SETUP_MODEL", model: "gpt-6-luna", reasoningEffort: "low" },
  templateEditor: { prefix: "GENERATION_MODEL", model: "gpt-6.1-sol", reasoningEffort: "low" },
  beat: { prefix: "TEXT_MODEL", model: "gpt-6-luna", reasoningEffort: "medium" },
  multiplayerBeat: { prefix: "MULTIPLAYER_TEXT_MODEL", model: "gpt-6-luna", reasoningEffort: "low" },
  analysis: { prefix: "SWITCH_THREAD_MODEL", model: "gpt-6-luna", reasoningEffort: "low" },
  multiplayerAnalysis: {
    prefix: "MULTIPLAYER_SWITCH_THREAD_MODEL",
    model: "gpt-6-luna",
    reasoningEffort: "low",
  },
  contentFilter: { prefix: "CONTENT_FILTER_MODEL", model: "gpt-6-luna", reasoningEffort: "low" },
};

/** An empty string counts as unset, as `||` treated it before. */
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function isEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

/** "low, medium or high" */
function listOf(efforts: readonly string[]): string {
  return efforts.length < 2 ? efforts.join("") : `${efforts.slice(0, -1).join(", ")} or ${efforts[efforts.length - 1]}`;
}

function replacement(group: GroupDefault): string {
  return `Set ${group.prefix}_NAME=${group.model} and ${group.prefix}_REASONING_EFFORT=${group.reasoningEffort}, or remove ${group.prefix}_NAME to use that default.`;
}

function readGroup(env: Env, group: GroupDefault, warn: (message: string) => void): TextModelSettings {
  const { prefix } = group;
  const name = read(env, `${prefix}_NAME`);
  const model = name ?? group.model;

  let family: ReturnType<typeof modelFamily>;
  try {
    family = modelFamily(model);
  } catch {
    throw new Error(
      `${prefix}_NAME=${model} is not a supported text model: production text calls take gpt-6-* and gpt-6.1-* models. ${replacement(group)}`
    );
  }
  if (family === "gpt-4.x") {
    throw new Error(
      `${prefix}_NAME=${model}: gpt-4.x models no longer run production text calls (GPT-6 migration, 2026-09-27). ${replacement(group)}`
    );
  }

  if (read(env, `${prefix}_TEMPERATURE`) !== undefined) {
    warn(`${prefix}_TEMPERATURE is ignored for ${model} (GPT-6 takes no temperature); remove it`);
  }

  // The default model brings its default effort; an explicit name needs its own
  const effort = read(env, `${prefix}_REASONING_EFFORT`) ?? (name ? undefined : group.reasoningEffort);
  const efforts = reasoningEffortsFor(model);
  if (effort === undefined) {
    throw new Error(`${prefix}_REASONING_EFFORT must be set for ${model} (${listOf(efforts)})`);
  }
  if (!isEffort(effort)) {
    const legacy = effort === "minimal" ? `; minimal was a gpt-4-era value: set ${group.reasoningEffort} or remove it` : "";
    throw new Error(
      `${prefix}_REASONING_EFFORT=${effort} is not a GPT-6 reasoning effort: ${model} takes ${listOf(efforts)}${legacy}`
    );
  }
  if (!efforts.includes(effort)) {
    const suggestion = efforts.includes(group.reasoningEffort) ? group.reasoningEffort : efforts[0];
    throw new Error(
      `${prefix}_REASONING_EFFORT=${effort} is not supported by ${model}, which takes ${listOf(efforts)}: OpenAI refuses it and a refused call is never retried, so every call would fail. Set ${prefix}_REASONING_EFFORT=${suggestion}.`
    );
  }

  const settings: UncheckedTextModelSettings = { model, reasoningEffort: effort };
  assertSupportedSettings(settings);
  return settings;
}

/** Reads every text group's settings; throws on a retired or unsupported configuration. */
export function resolveTextModelConfig(
  env: Env,
  warn: (message: string) => void = console.warn
): TextModelConfig {
  const groups = Object.entries(TEXT_MODEL_GROUPS) as [TextModelGroup, GroupDefault][];
  return Object.fromEntries(
    groups.map(([key, group]) => [key, readGroup(env, group, warn)])
  ) as TextModelConfig;
}

/** Each group as model@effort, for the startup log line. */
export function describeTextModels(config: TextModelConfig): Record<TextModelGroup, string> {
  const entries = Object.entries(config) as [TextModelGroup, TextModelSettings][];
  return Object.fromEntries(
    entries.map(([key, settings]) => [key, `${settings.model}@${settings.reasoningEffort}`])
  ) as Record<TextModelGroup, string>;
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
      return options.multiplayer ? config.multiplayerBeat : config.beat;
    case "switchAnalysis":
    case "threadAnalysis":
      return options.multiplayer ? config.multiplayerAnalysis : config.analysis;
    case "contentFilter":
      return config.contentFilter;
  }
}
