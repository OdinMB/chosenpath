import { jest } from "@jest/globals";
import {
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

describe("resolveTextModelConfig", () => {
  it("gives today's models at temperature 0.2 with no env", () => {
    const config = resolveTextModelConfig({}, quiet);
    const models = Object.fromEntries(
      ALL_ROLES.map((role) => [role, settingsFor(config, role)])
    );
    expect(models).toEqual({
      setup: { model: "gpt-4.1", temperature: 0.2 },
      templateGeneration: { model: "gpt-4.1", temperature: 0.2 },
      templateIteration: { model: "gpt-4.1", temperature: 0.2 },
      beat: { model: "gpt-4.1-mini", temperature: 0.2 },
      switchAnalysis: { model: "gpt-4.1-mini", temperature: 0.2 },
      threadAnalysis: { model: "gpt-4.1-mini", temperature: 0.2 },
      contentFilter: { model: "gpt-4.1-mini", temperature: 0.2 },
    });
  });

  it("falls back from SETUP_* to GENERATION_*, and GENERATION_* still moves the editor", () => {
    const fallback = resolveTextModelConfig(
      { GENERATION_MODEL_NAME: "gpt-4o", GENERATION_MODEL_TEMPERATURE: "0.7" },
      quiet
    );
    expect(settingsFor(fallback, "setup")).toEqual({ model: "gpt-4o", temperature: 0.7 });
    expect(settingsFor(fallback, "templateIteration")).toEqual({
      model: "gpt-4o",
      temperature: 0.7,
    });

    const split = resolveTextModelConfig(
      {
        GENERATION_MODEL_NAME: "gpt-4o",
        SETUP_MODEL_NAME: "gpt-6-sol",
        SETUP_MODEL_REASONING_EFFORT: "low",
      },
      quiet
    );
    expect(settingsFor(split, "setup")).toEqual({ model: "gpt-6-sol", reasoningEffort: "low" });
    expect(settingsFor(split, "templateGeneration").model).toBe("gpt-4o");
  });

  it("applies a multiplayer override only when its _NAME is set, and then fully", () => {
    const partial = resolveTextModelConfig(
      { MULTIPLAYER_TEXT_MODEL_REASONING_EFFORT: "low", TEXT_MODEL_NAME: "gpt-4.1-nano" },
      quiet
    );
    expect(settingsFor(partial, "beat", { multiplayer: true })).toEqual(
      settingsFor(partial, "beat")
    );

    const full = resolveTextModelConfig(
      {
        TEXT_MODEL_NAME: "gpt-6-luna",
        TEXT_MODEL_REASONING_EFFORT: "medium",
        MULTIPLAYER_TEXT_MODEL_NAME: "gpt-6-luna",
        MULTIPLAYER_TEXT_MODEL_REASONING_EFFORT: "none",
        MULTIPLAYER_SWITCH_THREAD_MODEL_NAME: "gpt-4.1",
      },
      quiet
    );
    expect(settingsFor(full, "beat", { multiplayer: true })).toEqual({
      model: "gpt-6-luna",
      reasoningEffort: "none",
    });
    expect(settingsFor(full, "beat")).toEqual({ model: "gpt-6-luna", reasoningEffort: "medium" });
    // The override does not inherit the single-player temperature or effort
    expect(settingsFor(full, "threadAnalysis", { multiplayer: true })).toEqual({
      model: "gpt-4.1",
      temperature: 0.2,
    });
    expect(settingsFor(full, "threadAnalysis").model).toBe("gpt-4.1-mini");
  });

  it("parses a string temperature and rejects invalid ones", () => {
    const config = resolveTextModelConfig({ TEXT_MODEL_TEMPERATURE: "0.9" }, quiet);
    expect(settingsFor(config, "beat").temperature).toBe(0.9);
    expect(() => resolveTextModelConfig({ TEXT_MODEL_TEMPERATURE: "warm" }, quiet)).toThrow(
      /TEXT_MODEL_TEMPERATURE/
    );
    expect(() => resolveTextModelConfig({ CONTENT_FILTER_MODEL_TEMPERATURE: "3" }, quiet)).toThrow(
      /between 0 and 2/
    );
    // Empty counts as unset
    const empty = resolveTextModelConfig({ TEXT_MODEL_TEMPERATURE: "" }, quiet);
    expect(settingsFor(empty, "beat").temperature).toBe(0.2);
  });

  it("requires an effort for gpt-6, rejects minimal, and ignores effort on gpt-4.x", () => {
    expect(() => resolveTextModelConfig({ TEXT_MODEL_NAME: "gpt-6-luna" }, quiet)).toThrow(
      /TEXT_MODEL_REASONING_EFFORT must be set/
    );
    expect(() =>
      resolveTextModelConfig(
        { TEXT_MODEL_NAME: "gpt-6-luna", TEXT_MODEL_REASONING_EFFORT: "minimal" },
        quiet
      )
    ).toThrow(/reasoning effort/);
    const legacy = resolveTextModelConfig({ GENERATION_MODEL_REASONING_EFFORT: "minimal" }, quiet);
    expect(settingsFor(legacy, "setup")).toEqual({ model: "gpt-4.1", temperature: 0.2 });
  });

  it("drops a temperature set for gpt-6 with one warning", () => {
    const warn = jest.fn();
    const config = resolveTextModelConfig(
      {
        TEXT_MODEL_NAME: "gpt-6-luna",
        TEXT_MODEL_REASONING_EFFORT: "low",
        TEXT_MODEL_TEMPERATURE: "0.2",
      },
      warn
    );
    expect(settingsFor(config, "beat")).toEqual({ model: "gpt-6-luna", reasoningEffort: "low" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown model family", () => {
    expect(() => resolveTextModelConfig({ CONTENT_FILTER_MODEL_NAME: "o3" }, quiet)).toThrow(
      /Unsupported text model/
    );
  });
});
