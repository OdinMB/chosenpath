import { jest } from "@jest/globals";
import {
  describeTextModels,
  resolveTextModelConfig,
  settingsFor,
  type TextRole,
} from "../../../../src/shared/llm/textModelSettings.js";

const ALL_ROLES: TextRole[] = [
  "setup",
  "templateGeneration",
  "templateIteration",
  "beat",
  "switchAnalysis",
  "threadAnalysis",
  "contentFilter",
];

const quiet = () => undefined;

describe("resolveTextModelConfig: the GPT-6 defaults", () => {
  it("gives the settled model and effort per role with no env", () => {
    const config = resolveTextModelConfig({}, quiet);
    const single = Object.fromEntries(ALL_ROLES.map((role) => [role, settingsFor(config, role)]));
    expect(single).toEqual({
      setup: { model: "gpt-6-luna", reasoningEffort: "low" },
      // Templates and AI Iteration on Sol low (owner, 2026-09-28, from the templates page); custom-story setup stays on Luna
      templateGeneration: { model: "gpt-6-sol", reasoningEffort: "low" },
      templateIteration: { model: "gpt-6-sol", reasoningEffort: "low" },
      beat: { model: "gpt-6-luna", reasoningEffort: "medium" },
      switchAnalysis: { model: "gpt-6-luna", reasoningEffort: "low" },
      threadAnalysis: { model: "gpt-6-luna", reasoningEffort: "low" },
      contentFilter: { model: "gpt-6-luna", reasoningEffort: "low" },
    });
    // Multiplayer turns run at low: medium's 3-player p95 was over the 60 s cap
    expect(settingsFor(config, "beat", { multiplayer: true })).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
    expect(settingsFor(config, "switchAnalysis", { multiplayer: true })).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
    expect(settingsFor(config, "threadAnalysis", { multiplayer: true })).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
  });

  it("summarises every group as model@effort for the startup log line", () => {
    expect(describeTextModels(resolveTextModelConfig({}, quiet))).toEqual({
      setup: "gpt-6-luna@low",
      templateEditor: "gpt-6-sol@low",
      beat: "gpt-6-luna@medium",
      multiplayerBeat: "gpt-6-luna@low",
      analysis: "gpt-6-luna@low",
      multiplayerAnalysis: "gpt-6-luna@low",
      contentFilter: "gpt-6-luna@low",
    });
  });
});

describe("resolveTextModelConfig: env overrides", () => {
  it("reads each group from its own prefix; setup no longer follows GENERATION_MODEL_*", () => {
    const config = resolveTextModelConfig(
      { GENERATION_MODEL_NAME: "gpt-6-luna", GENERATION_MODEL_REASONING_EFFORT: "low" },
      quiet
    );
    // Templates can go back to Luna (a rollback by env) while custom-story setup, which a player waits for, is untouched
    expect(settingsFor(config, "templateGeneration")).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
    expect(settingsFor(config, "templateIteration")).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
    expect(settingsFor(config, "setup")).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
    // And the template default (Sol) never reaches custom-story setup
    expect(settingsFor(resolveTextModelConfig({}, quiet), "setup")).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });

    const setup = resolveTextModelConfig({ SETUP_MODEL_NAME: "gpt-6-sol", SETUP_MODEL_REASONING_EFFORT: "none" }, quiet);
    expect(settingsFor(setup, "setup")).toEqual({ model: "gpt-6-sol", reasoningEffort: "none" });
  });

  it("keeps the multiplayer groups independent of the single-player ones", () => {
    const config = resolveTextModelConfig(
      {
        TEXT_MODEL_NAME: "gpt-6-sol",
        TEXT_MODEL_REASONING_EFFORT: "low",
        MULTIPLAYER_SWITCH_THREAD_MODEL_NAME: "gpt-6-luna",
        MULTIPLAYER_SWITCH_THREAD_MODEL_REASONING_EFFORT: "none",
      },
      quiet
    );
    expect(settingsFor(config, "beat")).toEqual({ model: "gpt-6-sol", reasoningEffort: "low" });
    expect(settingsFor(config, "beat", { multiplayer: true })).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
    expect(settingsFor(config, "threadAnalysis", { multiplayer: true })).toEqual({ model: "gpt-6-luna", reasoningEffort: "none" });
    expect(settingsFor(config, "threadAnalysis")).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
  });

  it("applies an effort without a name to the group's default model", () => {
    const config = resolveTextModelConfig({ MULTIPLAYER_TEXT_MODEL_REASONING_EFFORT: "medium" }, quiet);
    expect(settingsFor(config, "beat", { multiplayer: true })).toEqual({ model: "gpt-6-luna", reasoningEffort: "medium" });
  });

  it("treats an empty value as unset", () => {
    const config = resolveTextModelConfig({ TEXT_MODEL_NAME: "", TEXT_MODEL_REASONING_EFFORT: " " }, quiet);
    expect(settingsFor(config, "beat")).toEqual({ model: "gpt-6-luna", reasoningEffort: "medium" });
  });
});

describe("resolveTextModelConfig: what stops the server at startup", () => {
  it.each([
    ["SETUP_MODEL_NAME", "gpt-4.1", "SETUP_MODEL_NAME=gpt-6-luna and SETUP_MODEL_REASONING_EFFORT=low"],
    ["GENERATION_MODEL_NAME", "gpt-4.1", "GENERATION_MODEL_NAME=gpt-6-sol and GENERATION_MODEL_REASONING_EFFORT=low"],
    ["TEXT_MODEL_NAME", "gpt-4.1-mini", "TEXT_MODEL_NAME=gpt-6-luna and TEXT_MODEL_REASONING_EFFORT=medium"],
    ["MULTIPLAYER_TEXT_MODEL_NAME", "gpt-4.1-mini", "MULTIPLAYER_TEXT_MODEL_NAME=gpt-6-luna and MULTIPLAYER_TEXT_MODEL_REASONING_EFFORT=low"],
    ["SWITCH_THREAD_MODEL_NAME", "gpt-4o-mini", "SWITCH_THREAD_MODEL_NAME=gpt-6-luna and SWITCH_THREAD_MODEL_REASONING_EFFORT=low"],
    ["MULTIPLAYER_SWITCH_THREAD_MODEL_NAME", "gpt-4.1", "MULTIPLAYER_SWITCH_THREAD_MODEL_NAME=gpt-6-luna"],
    ["CONTENT_FILTER_MODEL_NAME", "gpt-4.1-mini", "CONTENT_FILTER_MODEL_NAME=gpt-6-luna and CONTENT_FILTER_MODEL_REASONING_EFFORT=low"],
  ])("refuses a gpt-4.x model in %s, naming the variable and its replacement", (name, model, replacement) => {
    const resolve = () => resolveTextModelConfig({ [name]: model }, quiet);
    expect(resolve).toThrow(`${name}=${model}`);
    expect(resolve).toThrow(/no longer run production text calls/);
    expect(resolve).toThrow(replacement);
  });

  it("refuses a gpt-4.x model even with a temperature or a legacy effort beside it", () => {
    expect(() =>
      resolveTextModelConfig({ TEXT_MODEL_NAME: "gpt-4.1-mini", TEXT_MODEL_TEMPERATURE: "0.2", TEXT_MODEL_REASONING_EFFORT: "minimal" }, quiet)
    ).toThrow(/TEXT_MODEL_NAME=gpt-4.1-mini/);
  });

  it("refuses the gpt-4-era effort minimal, even on the default model", () => {
    const resolve = () => resolveTextModelConfig({ GENERATION_MODEL_REASONING_EFFORT: "minimal" }, quiet);
    expect(resolve).toThrow(/GENERATION_MODEL_REASONING_EFFORT=minimal/);
    expect(resolve).toThrow(/set low or remove it/);
    expect(() => resolveTextModelConfig({ TEXT_MODEL_REASONING_EFFORT: "extreme" }, quiet)).toThrow(
      /TEXT_MODEL_REASONING_EFFORT=extreme is not a GPT-6 reasoning effort/
    );
  });

  it("requires an effort beside an explicit gpt-6 name", () => {
    expect(() => resolveTextModelConfig({ TEXT_MODEL_NAME: "gpt-6-luna" }, quiet)).toThrow(
      /TEXT_MODEL_REASONING_EFFORT must be set for gpt-6-luna/
    );
  });

  it("refuses a model outside the gpt-6 family, naming the variable", () => {
    expect(() => resolveTextModelConfig({ CONTENT_FILTER_MODEL_NAME: "o3" }, quiet)).toThrow(
      /CONTENT_FILTER_MODEL_NAME=o3 is not a supported text model/
    );
  });

  it("drops a temperature with one warning per variable", () => {
    const warn = jest.fn();
    const config = resolveTextModelConfig(
      { TEXT_MODEL_TEMPERATURE: "0.2", CONTENT_FILTER_MODEL_TEMPERATURE: "warm" },
      warn
    );
    expect(settingsFor(config, "beat")).toEqual({ model: "gpt-6-luna", reasoningEffort: "medium" });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/TEXT_MODEL_TEMPERATURE is ignored/);
  });
});
