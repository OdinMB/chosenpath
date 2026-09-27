import { assertSupportedSettings, modelFamily } from "./chatModel.js";

/*
 * Which model and reasoning effort each production text role uses, read from
 * env with the GPT-6 defaults the owner and coordinator settled on
 * 2026-09-27. Background: .context/text-model-eval.md.
 *
 * Seven setting groups, each read from its own prefix and nothing else:
 *   setup                 SETUP_MODEL_*                       gpt-6-luna low
 *   template editor       GENERATION_MODEL_*                  gpt-6-luna low
 *   beats                 TEXT_MODEL_*                        gpt-6-luna medium
 *   multiplayer beats     MULTIPLAYER_TEXT_MODEL_*            gpt-6-luna low
 *   analysis              SWITCH_THREAD_MODEL_*               gpt-6-luna low
 *   multiplayer analysis  MULTIPLAYER_SWITCH_THREAD_MODEL_*   gpt-6-luna low
 *   content filter        CONTENT_FILTER_MODEL_*              gpt-6-luna low
 * Each group reads _NAME and _REASONING_EFFORT; _TEMPERATURE is ignored with
 * a warning. Production text calls run only on gpt-6 models: a gpt-4.x name
 * stops the server at startup with the variable and its replacement. The
 * eval's comparison arms still run gpt-4.x through the factory directly.
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
 * the setup wait cap; templates may move to Sol after setup round 1.
 */
export const TEXT_MODEL_GROUPS: Record<TextModelGroup, GroupDefault> = {
  setup: { prefix: "SETUP_MODEL", model: "gpt-6-luna", reasoningEffort: "low" },
  templateEditor: { prefix: "GENERATION_MODEL", model: "gpt-6-luna", reasoningEffort: "low" },
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
      `${prefix}_NAME=${model} is not a supported text model: production text calls take gpt-6-* models. ${replacement(group)}`
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
  if (effort === undefined) {
    throw new Error(`${prefix}_REASONING_EFFORT must be set for ${model} (none, low, medium or high)`);
  }
  if (!isEffort(effort)) {
    const legacy = effort === "minimal" ? `; minimal was a gpt-4-era value: set ${group.reasoningEffort} or remove it` : "";
    throw new Error(
      `${prefix}_REASONING_EFFORT=${effort} is not a GPT-6 reasoning effort (none, low, medium or high)${legacy}`
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
