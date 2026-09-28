import { LEAK_PATTERN, htmlLeaks, metadataLeaks } from "../../../../src/evals/textModelEval/blinding.js";
import {
  SETUP_FIELD_LABELS,
  TURN_FIELD_LABELS,
  setupCard,
  withPictureNotes,
  type TurnBeat,
  type TurnContent,
} from "../../../../src/evals/textModelEval/ratingContent.js";
import { WIDE_FROM, renderRatingPage } from "../../../../src/evals/textModelEval/ratingPage.js";
import { ENTRY_STARTS_OPEN, startsOpen } from "../../../../src/evals/textModelEval/ratingRows.js";
import {
  LABELS,
  PAIRWISE_CRITERIA_SETS,
  pageFieldLabels,
  pairwiseInstructions,
  planRatingSet,
  ratingSetFromKey,
  type RatingSet,
  type RatingSpec,
} from "../../../../src/evals/textModelEval/ratingSets.js";
import {
  renderPairwiseScores,
  renderScores,
  scorePairwise,
  scoreRatings,
  signTestP,
  type ExportedRatings,
} from "../../../../src/evals/textModelEval/ratingScore.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { makeArm, type Arm } from "../../../../src/evals/textModelEval/arms.js";
import { GameModes } from "core/types/index.js";
import { BASELINE, LUNA, SOL, evalCase, record, tags } from "./fixtures.js";
import { all, closest, kids, parseHtml, select, textOf, type HtmlNode } from "./htmlTree.js";
import { endingBeat, threadAnalysisAfterSwitch, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration, beatSet, challengeOptions, threadAnalysis } from "../../../helpers/textFixtures.js";

const ARMS = [BASELINE, LUNA, SOL].map((a) => ({ promptState: "prefix", armKey: a.key }));

const GUIDELINE_FIELD: Record<string, string> = {
  World: "world",
  "World rules": "rules",
  Tone: "tone",
  Conflicts: "conflicts",
  Decisions: "decisions",
  "Types of threads": "typesOfThreads",
  "Switch and thread instructions": "switchAndThreadInstructions",
};

/** The one aligned section with this key (a row across every option of the item). */
function sectionAt(root: HtmlNode, key: string): HtmlNode {
  const found = all(root, (n) => n.tag === "details" && n.attrs["data-sec"] === key);
  if (found.length !== 1) throw new Error(`Expected one section "${key}", found ${found.length}`);
  return found[0];
}

const sectionKeys = (root: HtmlNode) => all(root, (n) => n.tag === "details" && n.attrs["data-sec"] !== undefined).map((n) => n.attrs["data-sec"]);

/** A whole setup reply in production's shape, the character-selection plan included. */
function setupOutput(title: string) {
  return {
    guidelines: {
      world: "A harbour town.",
      rules: ["Tides rule the town."],
      tone: ["warm"],
      conflicts: ["storm"],
      decisions: ["Whom to trust"],
      typesOfThreads: ["Harbour chase", "Tavern talk"],
      switchAndThreadInstructions: [],
    },
    difficultyLevel: { modifier: 10, title: "Calm Seas" },
    storyElements: [
      { id: "harbour", name: "Harbour", role: "where boats come in", instructions: "Use it for arrivals.", appearance: "", facts: ["Built of stone", "Busy at dawn"] },
    ],
    sharedOutcomes: [
      {
        id: "shared_storm",
        question: "Does the town survive the storm?",
        possibleResolutions: { favorable: "It stands.", unfavorable: "It floods.", mixed: "Half stands." },
        resonance: "Home matters.",
        intendedNumberOfMilestones: 3,
        milestones: [],
      },
    ],
    statGroups: ["Crew", "Town"],
    sharedStats: [
      {
        type: "number",
        name: "Supplies",
        id: "shared_supplies",
        possibleValues: "",
        effectOnPoints: ["Under 3 supplies: -10 points"],
        optionsToSacrifice: "Spend 1 supply",
        optionsToGainAsReward: "None",
        canBeChangedInBeatResolutions: true,
        narrativeImplications: ["0 supplies means hunger"],
        adjustmentsAfterThreads: ["-1 after each thread"],
        isVisible: true,
        partOfPlayerBackgrounds: false,
        initialValue: 5,
        tooltip: "What you have",
        group: "Town",
      },
    ],
    playerStats: [
      {
        type: "string[]",
        name: "Courage",
        id: "player_courage",
        possibleValues: "Bold, Steady (max 2)",
        effectOnPoints: ["+10 points when Bold"],
        optionsToSacrifice: "None",
        optionsToGainAsReward: "Rest to steady yourself",
        canBeChangedInBeatResolutions: false,
        narrativeImplications: ["Bold sailors lead"],
        adjustmentsAfterThreads: ["Gain Bold after a rescue"],
        isVisible: false,
        partOfPlayerBackgrounds: true,
        initialValue: [],
        tooltip: "How brave",
        group: "Crew",
      },
    ],
    characterSelectionPlan: {
      multiplayerCoordination: [],
      playerStatConversionRates: ["PLAN-SCRATCH one Bold is worth 2 supplies"],
      backgroundArchetypes: ["PLAN-SCRATCH brave but poor"],
    },
    player1: {
      outcomes: [
        {
          id: "player1_home",
          question: "Does Ada find a home?",
          possibleResolutions: { resolution1: "She settles.", resolution2: "She sails on.", resolution3: "She founds a guild." },
          resonance: "She grew up an orphan.",
          intendedNumberOfMilestones: 2,
          milestones: ["Met the harbourmaster"],
        },
      ],
      possibleCharacterIdentities: [{ name: "Ada", pronouns: { personal: "she", object: "her", possessive: "her", reflexive: "herself" }, appearance: "tall" }],
      possibleCharacterBackgrounds: [
        {
          title: "Sailor",
          fluffTemplate: "{name} sails.",
          initialPlayerStatValues: [
            { statId: "player_courage", value: ["Bold"] },
            { statId: "shared_supplies", value: 2 },
          ],
        },
      ],
    },
    title,
    characterSelectionIntroduction: { title: "Welcome", text: "Luna waits at the gate." },
    imageInstructions: {
      visualStyle: "Watercolor",
      atmosphere: "Salt and fog.",
      colorPalette: "muted blues",
      settingDetails: "Stone quays",
      characterStyle: "Weathered faces",
      artInfluences: "Maritime painting",
      coverPrompt: "A harbour at dawn",
    },
  };
}

/** Setup cases; every arm has sample 1, the baseline also sample 2. */
function fixture(arms: Arm[] = [BASELINE, LUNA, SOL], caseCount = 10) {
  const cases = Array.from({ length: caseCount }, (_, i) =>
    evalCase(`setup-case-${i}`, "setup", {
      setup: { premise: `Premise ${i} </script><b>bold</b>`, playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 },
      tags: tags({ gameMode: "single-player", players: 1 + (i % 3) }),
    })
  );
  const records: CallRecord[] = [];
  const outputs = new Map<string, unknown>();
  for (const c of cases) {
    for (const [index, arm] of arms.entries()) {
      for (const sample of arm.baseline ? [1, 2] : [1]) {
        const outputFile = `${c.id}-${arm.key}-${sample}`;
        outputs.set(outputFile, setupOutput(`Title ${c.id} option ${index} s${sample}`));
        records.push(record({ caseId: c.id, group: "setup", role: "setup", armKey: arm.key, callArmKey: arm.key, baseline: arm.baseline, sample, outputFile }));
      }
    }
  }
  return { cases, records, load: (r: CallRecord) => outputs.get(r.outputFile ?? "") };
}

function plan(salt: string, items = 8, spec: Partial<RatingSpec> = {}) {
  const { cases, records, load } = fixture();
  return planRatingSet({ kind: "setup", arms: ARMS, items, preview: false, ...spec }, records, cases, { loadOutput: load, salt, now: new Date(0) });
}

describe("planRatingSet", () => {
  it("orders options by the salt", () => {
    const orders = ["salt-a", "salt-b", "salt-c"].map((salt) =>
      Object.values(plan(salt).key.items).map((item) => Object.values(item.labels).map((l) => l.armKey).join()).join("|")
    );
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("balances the baseline's position across a 9-item set", () => {
    const { key } = plan("balance", 9);
    expect(key.labelDistribution).toEqual({ A: 3, B: 3, C: 3 });
  });

  it("adds a repeated item and a baseline-against-baseline item, mapped in the key", () => {
    const { set, key } = plan("controls", 6);
    expect(set.items).toHaveLength(8);
    const entries = Object.entries(key.items);
    const repeat = entries.find(([, item]) => item.repeatOf);
    const control = entries.find(([, item]) => item.control);
    expect(repeat?.[1].caseId).toBe(key.items[repeat?.[1].repeatOf ?? ""].caseId);
    const ids = set.items.map((i) => i.id);
    expect(ids.indexOf(repeat?.[0] ?? "") - ids.indexOf(repeat?.[1].repeatOf ?? "")).toBeGreaterThanOrEqual(3);
    expect(Object.values(control?.[1].labels ?? {}).map((l) => [l.armKey, l.sample]).sort()).toEqual([
      [BASELINE.key, 1],
      [BASELINE.key, 2],
    ]);
    expect(set.items.every((i) => /^setup-\d{2}$/.test(i.id))).toBe(true);
  });
});

describe("ratingSetFromKey", () => {
  it("rebuilds the planned page from its key: same page id, items, labels and content", () => {
    const { cases, records, load } = fixture();
    const { set, key } = planRatingSet({ kind: "setup", arms: ARMS, items: 6, preview: false }, records, cases, { loadOutput: load, salt: "again", now: new Date(0) });
    expect(ratingSetFromKey(key, records, cases, load)).toEqual(set);
  });

  it("re-reads each keyed output, so a rendering fix reaches a page already handed out", () => {
    const { cases, records, load } = fixture();
    const { set, key } = planRatingSet({ kind: "setup", arms: ARMS, items: 6, preview: false }, records, cases, { loadOutput: load, salt: "again", now: new Date(0) });
    const renamed = (r: CallRecord) => ({ ...(load(r) as object), title: `New ${r.outputFile}` });
    const rebuilt = ratingSetFromKey(key, records, cases, renamed);
    expect(rebuilt.pageId).toBe(set.pageId);
    expect(rebuilt.items.map((i) => [i.id, i.options.map((o) => o.label)])).toEqual(set.items.map((i) => [i.id, i.options.map((o) => o.label)]));
    const first = key.items[rebuilt.items[0].id].labels.A;
    const firstTitle = rebuilt.items[0].options[0].content.kind === "setup" ? rebuilt.items[0].options[0].content.title : "";
    expect(firstTitle).toBe(`New ${first.caseId}-${first.armKey}-${first.sample}`);
  });

  it("refuses a key whose output is gone", () => {
    const { cases, records, load } = fixture();
    const { key } = planRatingSet({ kind: "setup", arms: ARMS, items: 6, preview: false }, records, cases, { loadOutput: load, salt: "again", now: new Date(0) });
    const first = Object.values(key.items)[0].labels.A;
    const without = records.filter((r) => !(r.caseId === first.caseId && r.armKey === first.armKey && r.sample === first.sample));
    expect(() => ratingSetFromKey(key, without, cases, load)).toThrow(/No usable output/);
  });
});

describe("planRatingSet: rotating candidates (perItem)", () => {
  const SOL_MEDIUM = makeArm({ model: "gpt-6-sol", reasoningEffort: "medium" });
  const LUNA_MEDIUM = makeArm({ model: "gpt-6-luna", reasoningEffort: "medium" });

  function rotated(arms: Arm[], items: number, perItem: number, salt = "rotate") {
    const { cases, records, load } = fixture(arms, items + 3);
    const refs = arms.map((a) => ({ promptState: "prefix", armKey: a.key }));
    return planRatingSet({ kind: "setup", arms: refs, items, preview: false, perItem }, records, cases, { loadOutput: load, salt, now: new Date(0) });
  }
  const regular = (key: ReturnType<typeof rotated>["key"]) => Object.values(key.items).filter((i) => !i.repeatOf && !i.control);
  const appearances = (key: ReturnType<typeof rotated>["key"]) =>
    regular(key).reduce<Record<string, number>>((acc, item) => {
      for (const ref of Object.values(item.labels)) acc[ref.armKey] = (acc[ref.armKey] ?? 0) + 1;
      return acc;
    }, {});

  it("shows the baseline plus 2 of 3 candidates, each candidate in 6 of 9 items", () => {
    const { set, key } = rotated([BASELINE, LUNA, SOL, SOL_MEDIUM], 9, 2);
    expect(regular(key)).toHaveLength(9);
    // Every item but the baseline-against-baseline control shows three options
    const optionCounts = set.items.filter((i) => !key.items[i.id].control).map((i) => i.options.length);
    expect(optionCounts).toEqual(new Array(10).fill(3));
    expect(appearances(key)).toEqual({ [BASELINE.key]: 9, [LUNA.key]: 6, [SOL.key]: 6, [SOL_MEDIUM.key]: 6 });
    expect(key.labelDistribution).toEqual({ A: 3, B: 3, C: 3 });
  });

  it("pairs every candidate pair with every baseline position once over 9 items", () => {
    const { key } = rotated([BASELINE, LUNA, SOL, SOL_MEDIUM], 9, 2);
    const pairs = regular(key).map((item) => {
      const labels = Object.entries(item.labels);
      const baselineAt = labels.find(([, ref]) => ref.armKey === BASELINE.key)?.[0];
      const pair = labels.filter(([, ref]) => ref.armKey !== BASELINE.key).map(([, ref]) => ref.armKey).sort().join("+");
      return `${pair}@${baselineAt}`;
    });
    expect(new Set(pairs).size).toBe(9);
  });

  it("spreads each candidate evenly over the strata: 2 of 3 items per player count", () => {
    const { key } = rotated([BASELINE, LUNA, SOL, SOL_MEDIUM], 9, 2, "strata");
    const players = new Map(Array.from({ length: 12 }, (_, i) => [`setup-case-${i}`, 1 + (i % 3)]));
    const perStratum: Record<string, number> = {};
    for (const item of regular(key)) {
      for (const ref of Object.values(item.labels)) {
        if (ref.armKey === BASELINE.key) continue;
        const k = `${ref.armKey}|${players.get(item.caseId)}p`;
        perStratum[k] = (perStratum[k] ?? 0) + 1;
      }
    }
    expect(Object.values(perStratum)).toEqual(new Array(9).fill(2));
  });

  it("keeps a 4-candidate rotation within one appearance of even over 15 items", () => {
    const { key } = rotated([BASELINE, LUNA, SOL, SOL_MEDIUM, LUNA_MEDIUM], 15, 2);
    const counts = appearances(key);
    expect(counts[BASELINE.key]).toBe(15);
    const candidates = [LUNA, SOL, SOL_MEDIUM, LUNA_MEDIUM].map((a) => counts[a.key]);
    expect(candidates.reduce((a, b) => a + b, 0)).toBe(30);
    expect(Math.max(...candidates) - Math.min(...candidates)).toBeLessThanOrEqual(1);
  });

  it("repeats an item with the same arms it first showed", () => {
    const { key } = rotated([BASELINE, LUNA, SOL, SOL_MEDIUM], 9, 2);
    const repeat = Object.values(key.items).find((i) => i.repeatOf);
    const armsOf = (item: (typeof key.items)[string]) => Object.values(item.labels).map((r) => r.armKey).sort();
    expect(repeat).toBeDefined();
    expect(armsOf(repeat as (typeof key.items)[string])).toEqual(armsOf(key.items[repeat?.repeatOf ?? ""]));
    expect(Object.keys(repeat?.labels ?? {})).toHaveLength(3);
  });

  it("picks regular items only from caseIds, and the control from the other cases", () => {
    const { cases, records, load } = fixture([BASELINE, LUNA, SOL], 10);
    const chosen = ["setup-case-1", "setup-case-4", "setup-case-7"];
    const { key } = planRatingSet(
      { kind: "setup", arms: ARMS, items: 9, preview: false, caseIds: chosen },
      records,
      cases,
      { loadOutput: load, salt: "chosen", now: new Date(0) }
    );
    const items = Object.values(key.items);
    expect(items.filter((i) => !i.control).every((i) => chosen.includes(i.caseId))).toBe(true);
    expect(items.filter((i) => !i.control && !i.repeatOf)).toHaveLength(3);
    expect(chosen).not.toContain(items.find((i) => i.control)?.caseId);
  });

  it("shows every arm on every item when perItem is unset or covers all candidates", () => {
    const { set } = rotated([BASELINE, LUNA, SOL, SOL_MEDIUM], 6, 3);
    expect(set.items.filter((i) => i.options.length === 4)).toHaveLength(set.items.length - 1);
  });
});

describe("planRatingSet: pairwise pages", () => {
  const PAIR = [BASELINE, LUNA].map((a) => ({ promptState: "prefix", armKey: a.key }));
  function pairwise(items: number, spec: Partial<RatingSpec> = {}, salt = "pairwise", kind: RatingSpec["kind"] = "setup") {
    const { cases, records, load } = fixture([BASELINE, LUNA], items + 3);
    return planRatingSet({ kind, arms: PAIR, items, preview: false, pairwise: true, ...spec }, records, cases, { loadOutput: load, salt, now: new Date(0) });
  }
  const regular = (key: ReturnType<typeof pairwise>["key"]) => Object.entries(key.items).filter(([, i]) => !i.repeatOf && !i.control);
  const referenceLabel = (item: { labels: Record<string, { armKey: string; sample: number }> }) =>
    Object.entries(item.labels).find(([, ref]) => ref.armKey === BASELINE.key)?.[0];

  it("shows exactly two options per item, the reference against the candidate", () => {
    const { set, key } = pairwise(9);
    expect(set.items.every((i) => i.options.length === 2)).toBe(true);
    for (const [, item] of regular(key)) expect(Object.values(item.labels).map((r) => r.armKey).sort()).toEqual([BASELINE.key, LUNA.key].sort());
    expect(set.mode).toBe("pairwise");
    expect(key.mode).toBe("pairwise");
  });

  it("puts the reference first on about half the items, in salted page order", () => {
    for (const salt of ["one", "two", "three"]) {
      const { key } = pairwise(9, {}, salt);
      expect(Math.abs((key.labelDistribution.A ?? 0) - (key.labelDistribution.B ?? 0))).toBeLessThanOrEqual(1);
    }
    expect(pairwise(10).key.labelDistribution).toEqual({ A: 5, B: 5 });
    const orders = ["one", "two", "three", "four"].map((salt) => regular(pairwise(8, {}, salt).key).map(([, i]) => referenceLabel(i)).join(""));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("keeps the control and the repeat, and repeats the pair with its labels swapped", () => {
    const { key } = pairwise(6);
    const entries = Object.entries(key.items);
    const repeat = entries.find(([, i]) => i.repeatOf)?.[1];
    const control = entries.find(([, i]) => i.control)?.[1];
    expect(repeat).toBeDefined();
    expect(referenceLabel(repeat as NonNullable<typeof repeat>)).not.toBe(referenceLabel(key.items[repeat?.repeatOf ?? ""]));
    expect(Object.values(control?.labels ?? {}).map((l) => [l.armKey, l.sample]).sort()).toEqual([
      [BASELINE.key, 1],
      [BASELINE.key, 2],
    ]);
  });

  it("leaves the repeat out when it is switched off, on any page, and says so", () => {
    const off = pairwise(6, { repeat: false });
    expect(Object.values(off.key.items).some((i) => i.repeatOf)).toBe(false);
    expect(Object.values(off.key.items).some((i) => i.control)).toBe(true);
    expect(off.key.notes).toContain("No repeated item: switched off.");
    expect(Object.values(plan("ranked-off", 6, { repeat: false }).key.items).some((i) => i.repeatOf)).toBe(false);
  });

  it("refuses anything but two arms", () => {
    expect(() => pairwise(6, { arms: ARMS })).toThrow(/exactly two arms/);
    expect(() => pairwise(6, { arms: PAIR.slice(0, 1) })).toThrow(/exactly two arms/);
  });

  it("prints the owner's criteria in the instructions, which pass the blinding word check", () => {
    const setup = pairwise(6).set;
    const text = setup.instructions.join(" ");
    for (const criterion of [
      "stats that matter in play and keep score sensibly",
      "a real arc for each player",
      "shared outcomes only where they fit",
      "thread types and switch rules that steer",
    ]) {
      expect(text).toContain(criterion);
    }
    const turnInstructions = pairwiseInstructions("turn").join(" ");
    for (const criterion of [
      "Does this turn move the chapter's question and follow its plan?",
      "Does the chapter pursue the direction the player picked?",
      "Is there a real choice among the options?",
      "Does the prose sound like this story?",
    ]) {
      expect(turnInstructions).toContain(criterion);
    }
    expect(metadataLeaks(setup)).toEqual([]);
    expect([...pairwiseInstructions("turn"), ...pageFieldLabels("turn", "pairwise")].filter((s) => LEAK_PATTERN.test(s))).toEqual([]);
    expect(pageFieldLabels("setup", "pairwise")).toEqual(expect.arrayContaining(["Which is better?", "About the same"]));
  });

  it("rebuilds a pairwise page from its key", () => {
    const { cases, records, load } = fixture([BASELINE, LUNA], 9);
    const planned = planRatingSet({ kind: "setup", arms: PAIR, items: 6, preview: false, pairwise: true }, records, cases, { loadOutput: load, salt: "again", now: new Date(0) });
    expect(ratingSetFromKey(planned.key, records, cases, load)).toEqual(planned.set);
  });
});

describe("renderRatingPage: a pairwise page", () => {
  const PAIR = [BASELINE, LUNA].map((a) => ({ promptState: "prefix", armKey: a.key }));
  const { cases, records, load } = fixture([BASELINE, LUNA], 9);
  const { set, key } = planRatingSet({ kind: "setup", arms: PAIR, items: 6, preview: false, pairwise: true }, records, cases, { loadOutput: load, salt: "page", now: new Date(0) });
  const html = renderRatingPage(set);
  const tree = parseHtml(html);
  const item = select(tree, "section.item")[0];
  const itemId = item.attrs.id.replace(/^item-/, "");

  it("keeps the aligned, foldable layout: one column per option, the same section keys", () => {
    expect(select(item, "div.compare")[0].attrs.class).toContain("n2");
    expect(sectionKeys(item)).toContain("sharedOutcomes");
    expect(sectionKeys(item)).toContain("premise");
  });

  it("asks Acceptable? on both options and one Which is better? per item, with no ranks", () => {
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs.filter((i) => i.includes('data-field="rank"'))).toEqual([]);
    const own = inputs.filter((i) => i.includes(`data-item="${itemId}"`));
    expect(own.filter((i) => i.includes('data-field="acceptable"'))).toHaveLength(4);
    expect(own.filter((i) => i.includes('data-field="note"'))).toHaveLength(2);
    expect(own.filter((i) => i.includes('data-field="preference"'))).toEqual([
      `<input type="radio" name="${itemId}-preference" value="A" data-item="${itemId}" data-field="preference">`,
      `<input type="radio" name="${itemId}-preference" value="B" data-item="${itemId}" data-field="preference">`,
      `<input type="radio" name="${itemId}-preference" value="same" data-item="${itemId}" data-field="preference">`,
    ]);
    expect(textOf(select(item, "fieldset.prefer")[0])).toBe("Which is better? A B About the same");
  });

  it("tells the script it is pairwise, which exports the preferences beside the verdicts", () => {
    expect(html).toContain(`"mode":"pairwise"`);
    const script = select(tree, "script").filter((s) => s.attrs.type === undefined)[0].text.join("");
    expect(script).toContain(`out.preferences=state.preferences`);
    expect(html).not.toContain(key.keyFile);
  });

  it("keeps the harness's leak words out of the stylesheet, the script and every attribute", () => {
    const code = [...select(tree, "style"), ...select(tree, "script").filter((s) => s.attrs.type === undefined)].map((n) => n.text.join(""));
    const attributes = all(tree, () => true).flatMap((n) => Object.values(n.attrs));
    expect([...code, ...attributes].map((s) => s.replace(/\bnone\b/gi, "").match(LEAK_PATTERN)?.[0]).filter(Boolean)).toEqual([]);
    expect(htmlLeaks(html, key)).toEqual([]);
  });
});

describe("scorePairwise", () => {
  const PAIR = [BASELINE, LUNA].map((a) => ({ promptState: "prefix", armKey: a.key }));
  const { cases, records, load } = fixture([BASELINE, LUNA], 9);
  const { key } = planRatingSet({ kind: "setup", arms: PAIR, items: 6, preview: false, pairwise: true }, records, cases, { loadOutput: load, salt: "score", now: new Date(0) });
  const ids = Object.keys(key.items);
  const regularIds = ids.filter((id) => !key.items[id].repeatOf && !key.items[id].control);
  const repeatId = ids.find((id) => key.items[id].repeatOf) ?? "";
  const controlId = ids.find((id) => key.items[id].control) ?? "";
  const labelOf = (itemId: string, armKey: string, sample = 1) =>
    Object.entries(key.items[itemId].labels).find(([, ref]) => ref.armKey === armKey && ref.sample === sample)?.[0] ?? "";

  /** Prefers the candidate on the items given (the reference elsewhere), marks both acceptable except the reference on `refused` */
  function exported(prefer: (itemId: string) => "candidate" | "reference" | "same" | undefined, refused: string[] = []): ExportedRatings {
    const ratings: ExportedRatings["ratings"] = {};
    const preferences: Record<string, string> = {};
    for (const [itemId, item] of Object.entries(key.items)) {
      ratings[itemId] = Object.fromEntries(
        Object.entries(item.labels).map(([label, ref]) => [label, { acceptable: ref.armKey === BASELINE.key && refused.includes(itemId) ? "no" : "yes" }])
      );
      const choice = prefer(itemId);
      if (choice === "same") preferences[itemId] = "same";
      else if (choice === "candidate") preferences[itemId] = labelOf(itemId, LUNA.key) || labelOf(itemId, BASELINE.key, 2);
      else if (choice === "reference") preferences[itemId] = labelOf(itemId, BASELINE.key);
    }
    return { pageId: key.pageId, setId: key.setId, exportedAt: "2026-09-27T00:00:00Z", mode: "pairwise", ratings, preferences };
  }

  it("reads a win, tie or loss per item for the candidate, and acceptable rates per arm", () => {
    const [w1, w2, t1] = regularIds;
    const scores = scorePairwise(exported((id) => (id === w1 || id === w2 ? "candidate" : id === t1 ? "same" : "reference"), [w1]), key);
    expect(scores).toMatchObject({ reference: `prefix:${BASELINE.key}`, candidate: `prefix:${LUNA.key}`, wins: 2, ties: 1, losses: regularIds.length - 3 });
    expect(scores.items.find((i) => i.item === w1)).toMatchObject({ result: "win", referenceAcceptable: "no", candidateAcceptable: "yes" });
    expect(scores.acceptable.candidate).toEqual({ marked: regularIds.length, yes: regularIds.length, rate: 1 });
    expect(scores.acceptable.reference.yes).toBe(regularIds.length - 1);
    expect(scores.acceptable.onlyCandidate).toBe(1);
    expect(scores.picksByLabel.same).toBe(1);
  });

  it("gives the sign test's two-sided p over the decided items", () => {
    const allWins = scorePairwise(exported(() => "candidate"), key);
    expect(allWins.wins).toBe(regularIds.length);
    expect(allWins.signTestP).toBeCloseTo(2 / 2 ** regularIds.length);
    expect(scorePairwise(exported(() => "same"), key).signTestP).toBeNull();
    expect(signTestP(9, 0)).toBeCloseTo(0.00390625);
    expect(signTestP(5, 4)).toBe(1);
  });

  it("reads the repeat in arm terms, so the swapped labels still agree", () => {
    const same = scorePairwise(exported(() => "candidate"), key);
    expect(same.repeat).toMatchObject({ item: repeatId, samePreference: true, acceptableAgreement: 1 });
    const first = key.items[repeatId].repeatOf ?? "";
    const flipped = scorePairwise(exported((id) => (id === repeatId ? "reference" : id === first ? "candidate" : "same")), key);
    expect(flipped.repeat?.samePreference).toBe(false);
  });

  it("reads the control as which sample was preferred", () => {
    const scores = scorePairwise(exported((id) => (id === controlId ? "candidate" : "same")), key);
    // The control's "candidate" is its sample 2
    expect(scores.control).toMatchObject({ item: controlId, preferred: "sample 2" });
  });

  it("lists items without a preference or a verdict, and scores what is there", () => {
    const [skipped] = regularIds;
    const partial = exported((id) => (id === skipped ? undefined : "candidate"));
    delete partial.ratings[skipped];
    const scores = scorePairwise(partial, key);
    expect(scores.completeness.unratedItems).toEqual([skipped]);
    expect(scores.wins).toBe(regularIds.length - 1);
    const md = renderPairwiseScores(scores);
    expect(md).toContain(`Not rated at all: ${skipped}`);
    expect(md).toMatch(/\| Candidate \| prefix:gpt-6-luna@low\/prod \|/);
    expect(md).not.toMatch(/NaN|Infinity/);
  });

  it("refuses an export for another page, and a ranked key", () => {
    expect(() => scorePairwise({ ...exported(() => "same"), pageId: "other" }, key)).toThrow(/key for/);
    const ranked = plan("ranked", 3).key;
    expect(() => scorePairwise({ ...exported(() => "same"), pageId: ranked.pageId }, ranked)).toThrow(/not a pairwise page/);
  });

  it("lists every note with its arm", () => {
    const notes = exported(() => "candidate");
    notes.ratings[regularIds[0]] = { ...notes.ratings[regularIds[0]], [labelOf(regularIds[0], LUNA.key)]: { acceptable: "yes", note: "clearer stats" } };
    const scores = scorePairwise(notes, key);
    expect(scores.notes).toEqual([{ item: regularIds[0], label: labelOf(regularIds[0], LUNA.key), arm: `prefix:${LUNA.key} s1`, note: "clearer stats" }]);
  });
});

describe("blinding", () => {
  it("accepts a clean page, and 'Luna' in story text", () => {
    const { set, key } = plan("clean");
    expect(metadataLeaks(set)).toEqual([]);
    expect(htmlLeaks(renderRatingPage(set), key)).toEqual([]);
  });

  it("rejects a model id in a label, an effort word in the instructions and an arm key in the HTML", () => {
    const { set, key } = plan("leaky");
    const labelled = { ...set, items: [{ ...set.items[0], options: [{ ...set.items[0].options[0], label: "gpt-6" }] }] };
    expect(metadataLeaks(labelled)).toEqual([expect.stringContaining("label")]);
    expect(metadataLeaks({ ...set, instructions: ["Low effort answers first."] })).toEqual([expect.stringContaining("instructions")]);
    const html = renderRatingPage(set).replace("</body>", `<!-- ${LUNA.key} --></body>`);
    expect(htmlLeaks(html, key)).toEqual(expect.arrayContaining([LUNA.key, "gpt-6-luna", "@low"]));
  });

  it("checks every fixed string of a setup card with the word pattern", () => {
    const { set } = plan("labels");
    expect(set.fieldLabels).toEqual(expect.arrayContaining(Object.values(SETUP_FIELD_LABELS)));
    expect(metadataLeaks({ ...set, fieldLabels: [...set.fieldLabels, "Effort"] })).toEqual([expect.stringContaining("field label")]);
  });
});

describe("setupCard: the whole design", () => {
  const card = setupCard(setupOutput("Tides"));

  it("reads the guidelines, difficulty and introduction", () => {
    expect(card).toMatchObject({
      title: "Tides",
      introduction: { title: "Welcome", text: "Luna waits at the gate." },
      difficulty: [{ title: "Calm Seas", modifier: "+10" }],
      guidelines: {
        world: "A harbour town.",
        rules: ["Tides rule the town."],
        tone: ["warm"],
        conflicts: ["storm"],
        decisions: ["Whom to trust"],
        typesOfThreads: ["Harbour chase", "Tavern talk"],
        switchAndThreadInstructions: [],
      },
      statGroups: ["Crew", "Town"],
    });
  });

  it("reads every field of every stat", () => {
    expect(card.sharedStats).toEqual([
      {
        id: "shared_supplies",
        name: "Supplies",
        type: "number",
        group: "Town",
        tooltip: "What you have",
        initialValue: ["5"],
        possibleValues: "",
        isVisible: true,
        partOfPlayerBackgrounds: false,
        canBeChangedInBeatResolutions: true,
        effectOnPoints: ["Under 3 supplies: -10 points"],
        narrativeImplications: ["0 supplies means hunger"],
        adjustmentsAfterThreads: ["-1 after each thread"],
        optionsToSacrifice: "Spend 1 supply",
        optionsToGainAsReward: "None",
      },
    ]);
    expect(card.playerStats?.[0]).toMatchObject({ initialValue: [], isVisible: false, partOfPlayerBackgrounds: true, possibleValues: "Bold, Steady (max 2)" });
  });

  it("reads outcomes with their resolutions in order and their milestones", () => {
    expect(card.sharedOutcomes).toEqual([
      {
        id: "shared_storm",
        question: "Does the town survive the storm?",
        resonance: "Home matters.",
        resolutions: [
          { key: "favorable", text: "It stands." },
          { key: "unfavorable", text: "It floods." },
          { key: "mixed", text: "Half stands." },
        ],
        intendedNumberOfMilestones: "3",
        milestones: [],
      },
    ]);
    expect(card.players[0].outcomes?.[0]).toMatchObject({ id: "player1_home", milestones: ["Met the harbourmaster"], intendedNumberOfMilestones: "2" });
  });

  it("reads story elements, identities, and backgrounds with starting stats by name", () => {
    expect(card.storyElements).toEqual([
      { id: "harbour", name: "Harbour", role: "where boats come in", instructions: "Use it for arrivals.", appearance: "", facts: ["Built of stone", "Busy at dawn"] },
    ]);
    expect(card.players[0].identities).toEqual([{ name: "Ada", pronouns: "she/her/her/herself", appearance: "tall" }]);
    expect(card.players[0].backgrounds).toEqual([
      {
        title: "Sailor",
        fluffTemplate: "{name} sails.",
        initialStats: [
          { stat: "Courage", known: true, value: ["Bold"] },
          { stat: "shared_supplies", known: false, value: ["2"] },
        ],
      },
    ]);
  });

  it("reads the image instructions in schema order", () => {
    expect(card.imageInstructions.map((i) => i.key)).toEqual([
      "visualStyle",
      "atmosphere",
      "colorPalette",
      "settingDetails",
      "characterStyle",
      "artInfluences",
      "coverPrompt",
    ]);
  });

  it("leaves out the character-selection plan", () => {
    expect(JSON.stringify(card)).not.toContain("PLAN-SCRATCH");
  });

  it("reads a template's difficulty levels and teaser", () => {
    const template = setupCard({ teaser: "Sail away.", difficultyLevels: [{ modifier: -10, title: "Squall" }, { modifier: 0, title: "Fair" }] });
    expect(template.teaser).toBe("Sail away.");
    expect(template.difficulty).toEqual([
      { title: "Squall", modifier: "-10" },
      { title: "Fair", modifier: "0" },
    ]);
  });

  it("does not throw on missing or malformed fields, and leaves absent ones undefined", () => {
    const bare = {
      kind: "setup",
      title: "",
      teaser: "",
      introduction: { title: "", text: "" },
      difficulty: [],
      guidelines: { world: "" },
      players: [],
      imageInstructions: [],
    };
    for (const output of [undefined, null, "junk", 42, {}]) expect(setupCard(output)).toEqual(bare);
    const malformed = setupCard({
      guidelines: "x",
      sharedStats: "x",
      difficultyLevel: null,
      player2: { outcomes: {}, possibleCharacterBackgrounds: [{ initialPlayerStatValues: "x" }] },
      player1: null,
    });
    expect(malformed.sharedStats).toBeUndefined();
    expect(malformed.players.map((p) => p.slot)).toEqual(["player1", "player2"]);
    expect(malformed.players[1]).toEqual({ slot: "player2", backgrounds: [{ title: "", fluffTemplate: "" }] });
  });
});

describe("renderRatingPage: the setup design", () => {
  function setupPage(output: unknown): string {
    const set: RatingSet = {
      setId: "text-setup",
      pageId: "page",
      kind: "setup",
      title: "Setups",
      instructions: [],
      fieldLabels: [],
      items: [{ id: "setup-01", context: [], options: [{ label: "A", content: setupCard(output) }] }],
      preview: false,
    };
    return renderRatingPage(set);
  }
  const L = SETUP_FIELD_LABELS;
  const html = setupPage(setupOutput("Tides"));
  const tree = parseHtml(html);
  const bodyOf = (key: string) => textOf(kids(sectionAt(tree, key), "div.body")[0]);

  it("shows every guideline and the difficulty", () => {
    expect(bodyOf("difficulty")).toBe("A Calm Seas (modifier +10)");
    for (const label of [L.world, L.rules, L.tone, L.conflicts, L.decisions, L.typesOfThreads, L.switchAndThreadInstructions]) {
      expect(textOf(kids(sectionAt(tree, `guidelines.${GUIDELINE_FIELD[label]}`), "summary")[0])).toContain(label);
    }
    for (const text of ["Tides rule the town.", "Whom to trust", "Harbour chase"]) expect(html).toContain(text);
    expect(bodyOf("guidelines.switchAndThreadInstructions")).toBe(`A ${L.empty}`);
  });

  it("shows every field of a stat, and an empty initial list as empty", () => {
    for (const label of [L.tooltip, L.initialValue, L.possibleValues, L.effectOnPoints, L.narrativeImplications, L.adjustmentsAfterThreads, L.optionsToSacrifice, L.optionsToGainAsReward]) {
      expect(html).toContain(`<dt>${label}</dt>`);
    }
    for (const label of [L.type, L.group, L.isVisible, L.partOfPlayerBackgrounds, L.canBeChangedInBeatResolutions]) {
      expect(html).toContain(`<span class="k">${label}:</span>`);
    }
    for (const text of ["Under 3 supplies: -10 points", "0 supplies means hunger", "-1 after each thread", "Spend 1 supply", "Bold, Steady (max 2)", "shared_supplies"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(`<dt>${L.initialValue}</dt><dd>${L.empty}</dd>`);
    expect(bodyOf("stats.statGroups")).toBe("A Crew, Town");
  });

  it("shows outcomes with their resolutions and milestones", () => {
    for (const text of [`<span class="k">${L.unfavorable}:</span> It floods.`, `<span class="k">${L.resolution3}:</span> She founds a guild.`, "Home matters.", "Met the harbourmaster"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(`<dt>${L.intendedMilestones}</dt><dd>3</dd>`);
    expect(html).toContain(`<dt>${L.milestones}</dt><dd>${L.empty}</dd>`);
  });

  it("shows story elements, identities, backgrounds and image instructions", () => {
    for (const text of ["Use it for arrivals.", "Busy at dawn", "she/her/her/herself", "{name} sails.", "Maritime painting", "A harbour at dawn"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(`<span class="k">Courage:</span> Bold`);
    expect(html).toContain(`<span class="k">shared_supplies (${L.notAPlayerStat}):</span> 2`);
    // An empty appearance renders no row
    expect(html.match(new RegExp(`<dt>${L.appearance}</dt>`, "g"))).toBeNull();
  });

  it("never shows the character-selection plan", () => {
    expect(html).not.toContain("PLAN-SCRATCH");
  });

  it("renders nothing for absent fields, without throwing", () => {
    const bare = setupPage({ title: "Bare" });
    expect(bare).toContain("Bare");
    expect(bare).not.toMatch(/<details|<dl|class="meta"/);
    const partial = setupPage({ sharedStats: [{ name: "Supplies", tooltip: "What you have" }] });
    expect(partial).toContain(`<dt>${L.tooltip}</dt><dd>What you have</dd>`);
    for (const label of [L.effectOnPoints, L.initialValue, L.playerStats, L.storyElements]) expect(partial).not.toContain(label);
    expect(() => setupPage({ player1: { possibleCharacterBackgrounds: [{ initialPlayerStatValues: [{}] }] } })).not.toThrow();
  });
});

const optionsOf = (cells: HtmlNode[]) => cells.map((c) => c.attrs["data-option"]);
const headCells = (section: HtmlNode) => select(kids(section, "summary")[0], ".cell");
const bodyCells = (section: HtmlNode) => kids(kids(section, "div.body")[0], "div.cell");
const gists = (section: HtmlNode) => headCells(section).map((c) => select(c, "span.gist").map(textOf).join(""));

/** Setups of one item that differ in length and in what they carry, two players each. */
function comparisonOutputs(): unknown[] {
  const twoPlayers = (output: ReturnType<typeof setupOutput>): Record<string, unknown> => ({ ...output, player2: output.player1 });
  const storm = setupOutput("Storm");
  const longer = twoPlayers({
    ...storm,
    guidelines: { ...storm.guidelines, tone: ["grim", "wry"], world: "A long world. ".repeat(40) },
    sharedStats: [...storm.sharedStats, { ...storm.sharedStats[0], id: "shared_morale", name: "Morale", type: "string" }],
    storyElements: [...storm.storyElements, { ...storm.storyElements[0], id: "tavern", name: "Tavern" }],
  });
  const thinner = twoPlayers(setupOutput("Fog"));
  delete thinner.storyElements;
  delete thinner.statGroups;
  return [twoPlayers(setupOutput("Tides")), longer, thinner];
}

function comparisonSet(outputs: unknown[]): RatingSet {
  return {
    setId: "text-setup",
    pageId: "page",
    kind: "setup",
    title: "Setups",
    instructions: [],
    fieldLabels: [],
    items: [
      {
        id: "setup-01",
        premise: "A harbour town in a storm.",
        context: [],
        options: outputs.map((output, i) => ({ label: LABELS[i], content: setupCard(output) })),
      },
    ],
    preview: false,
  };
}

describe("renderRatingPage: setups side by side, every section aligned and foldable", () => {
  const L = SETUP_FIELD_LABELS;
  const html = renderRatingPage(comparisonSet(comparisonOutputs()));
  const tree = parseHtml(html);
  const item = select(tree, "section.item")[0];
  const compare = select(item, "div.compare")[0];
  const options = ["A", "B", "C"];
  const players = ["player1", "player2"].flatMap((p) => [p, `${p}.outcomes`, `${p}.identities`, `${p}.backgrounds`]);
  const images = ["visualStyle", "atmosphere", "colorPalette", "settingDetails", "characterStyle", "artInfluences", "coverPrompt"];
  const EXPECTED_KEYS = [
    "premise",
    "difficulty",
    "characterSelection",
    "guidelines",
    ...Object.values(GUIDELINE_FIELD).map((k) => `guidelines.${k}`),
    "sharedOutcomes",
    "stats",
    "stats.statGroups",
    "stats.sharedStats",
    "stats.playerStats",
    "storyElements",
    ...players,
    "imageInstructions",
    ...images.map((k) => `imageInstructions.${k}`),
  ];

  it("makes every section and sub-section foldable", () => {
    expect(sectionKeys(item)).toEqual(EXPECTED_KEYS);
    for (const details of select(item, "details")) expect(details.children[0].tag).toBe("summary");
    // The only headings outside a fold are the item's, the option labels and the setup titles
    const loose = all(item, (n) => /^h[3-6]$/.test(n.tag) && !closest(n, "summary"));
    expect(loose.every((h) => ["label", "card-title"].includes(h.attrs.class ?? ""))).toBe(true);
  });

  it("lays each section out as one row: a header cell and a body cell per option, in label order", () => {
    for (const key of EXPECTED_KEYS.filter((k) => k !== "premise")) {
      const section = sectionAt(item, key);
      expect(optionsOf(headCells(section))).toEqual(options);
      const [body] = kids(section, "div.body");
      const [nested] = kids(section, "div.kids");
      if (body) expect(optionsOf(bodyCells(section))).toEqual(options);
      else expect(kids(nested, "details.sec").length).toBeGreaterThan(0);
    }
  });

  it("gives every option the same section keys in the same order, one element per section, so one toggle folds it everywhere", () => {
    const perOption = options.map((label) =>
      select(item, "details.sec")
        .filter((section) => headCells(section).some((c) => c.attrs["data-option"] === label))
        .map((section) => section.attrs["data-sec"])
    );
    for (const keys of perOption) expect(keys).toEqual(perOption[0]);
    expect(new Set(sectionKeys(item)).size).toBe(sectionKeys(item).length);
  });

  it("starts with exactly the owner's defaults folded", () => {
    const folded = select(item, "details").filter((d) => d.attrs["data-sec"] !== undefined && d.attrs.open === undefined);
    expect(folded.map((d) => d.attrs["data-sec"])).toEqual([
      "guidelines",
      "guidelines.tone",
      "guidelines.decisions",
      "guidelines.typesOfThreads",
      "storyElements",
      "player1.backgrounds",
      "player2.backgrounds",
      "imageInstructions",
    ]);
    const entries = select(item, "details.entry");
    expect(new Set(entries.map((d) => d.attrs["data-entry"]))).toEqual(new Set(["stat", "element", "background", "outcome", "identity"]));
    for (const entry of entries) expect(entry.attrs.open !== undefined).toBe(["outcome", "identity"].includes(entry.attrs["data-entry"]));
  });

  it("keeps the fold rule in one place", () => {
    expect(ENTRY_STARTS_OPEN).toEqual({ stat: false, element: false, background: false, outcome: true, identity: true });
    const folded = ["guidelines", "guidelines.tone", "guidelines.decisions", "guidelines.typesOfThreads", "storyElements", "player3.backgrounds", "imageInstructions"];
    expect(folded.filter((k) => startsOpen("setup", k))).toEqual([]);
    const open = ["premise", "difficulty", "teaser", "characterSelection", "guidelines.world", "guidelines.rules", "guidelines.conflicts", "guidelines.switchAndThreadInstructions"];
    const openToo = ["sharedOutcomes", "stats", "stats.statGroups", "stats.sharedStats", "player3", "player3.outcomes", "player3.identities", "imageInstructions.coverPrompt"];
    expect([...open, ...openToo].filter((k) => !startsOpen("setup", k))).toEqual([]);
    expect([...folded, "text", "context-1"].filter((k) => !startsOpen("turn", k))).toEqual([]);
  });

  it("folds each stat, element, outcome, identity and background on its own, inside one option's cell", () => {
    for (const entry of select(item, "details.entry")) {
      expect(kids(entry, "summary")).toHaveLength(1);
      expect(closest(entry, "div.cell")?.attrs["data-option"]).toMatch(/^[ABC]$/);
      expect(closest(entry, "details.entry")).toBeUndefined();
    }
    const stats = select(sectionAt(item, "stats.sharedStats"), "details.entry");
    expect(stats.map((s) => closest(s, "div.cell")?.attrs["data-option"])).toEqual(["A", "B", "B", "C"]);
  });

  it("says in each header what it folds away", () => {
    expect(gists(sectionAt(item, "guidelines.tone"))).toEqual(["1", "2", "1"]);
    expect(gists(sectionAt(item, "stats.sharedStats"))).toEqual(["1", "2", "1"]);
    expect(gists(sectionAt(item, "storyElements"))).toEqual(["1", "2", ""]);
    expect(gists(sectionAt(item, "player1.backgrounds"))).toEqual(["1", "1", "1"]);
    // A group says how many fields each option filled, or what its lists hold
    expect(gists(sectionAt(item, "guidelines"))).toEqual(["6", "6", "6"]);
    expect(gists(sectionAt(item, "imageInstructions"))).toEqual(["7", "7", "7"]);
    expect(gists(sectionAt(item, "stats"))).toEqual([
      "Stat groups 2 Shared stats 1 Player stats 1",
      "Stat groups 2 Shared stats 2 Player stats 1",
      "Shared stats 1 Player stats 1",
    ]);
    expect(gists(sectionAt(item, "player1"))).toEqual(options.map(() => "Outcomes 1 Identities 1 Backgrounds 1"));
    const sparse = parseHtml(renderRatingPage(comparisonSet([setupOutput("Tides"), { ...setupOutput("Bare"), guidelines: { world: "An island.", tone: [] } }])));
    expect(gists(sectionAt(sparse, "guidelines"))).toEqual(["6", "1"]);
    const summaries = (root: HtmlNode, kind: string) =>
      select(root, "details.entry")
        .filter((d) => d.attrs["data-entry"] === kind)
        .map((d) => textOf(kids(d, "summary")[0]));
    expect(summaries(sectionAt(item, "stats.sharedStats"), "stat")).toEqual(["Supplies number", "Supplies number", "Morale string", "Supplies number"]);
    expect(summaries(item, "element")).toEqual(["Harbour", "Harbour", "Tavern"]);
    expect(summaries(item, "background")[0]).toBe("Sailor");
    expect(summaries(item, "identity")[0]).toBe("Ada (she/her/her/herself)");
    expect(summaries(item, "outcome")[0]).toBe("Does the town survive the storm?");
  });

  it("marks a section an option lacks with a dash, and a list that is present but empty as empty", () => {
    expect(textOf(bodyCells(sectionAt(item, "storyElements"))[2])).toBe("C —");
    expect(textOf(bodyCells(sectionAt(item, "guidelines.switchAndThreadInstructions"))[0])).toBe(`A ${L.empty}`);
  });

  it("keeps one set of rating controls per option, in the last row, with unchanged names, ids and page data", () => {
    const [controls] = kids(compare, "div.controls");
    expect(compare.children[compare.children.length - 1]).toBe(controls);
    expect(optionsOf(kids(controls, "div.cell"))).toEqual(options);
    for (const cell of kids(controls, "div.cell")) {
      expect(select(cell, "input").every((i) => i.attrs["data-label"] === cell.attrs["data-option"])).toBe(true);
    }
    const expected = options.flatMap((l) => [
      `<input type="radio" name="setup-01-${l}-acceptable" value="yes" data-item="setup-01" data-label="${l}" data-field="acceptable">`,
      `<input type="radio" name="setup-01-${l}-acceptable" value="no" data-item="setup-01" data-label="${l}" data-field="acceptable">`,
      ...[1, 2, 3].map((r) => `<input type="radio" name="setup-01-${l}-rank" value="${r}" data-item="setup-01" data-label="${l}" data-field="rank">`),
      `<input type="text" data-item="setup-01" data-label="${l}" data-field="note">`,
    ]);
    expect(html.match(/<input\b[^>]*>/g)).toEqual(expected);
    expect(html).toContain(
      `<script type="application/json" id="page-data">{"pageId":"page","setId":"text-setup","items":[{"id":"setup-01","labels":["A","B","C"]}]}</script>`
    );
    const ids = all(tree, (n) => n.attrs.id !== undefined).map((n) => n.attrs.id);
    expect(ids).toEqual(["storage-notice", "prev", "jump", "next", "progress", "item-setup-01", "export", "last-export", "page-data"]);
  });

  it("stacks the options on a narrow screen: the same rows, each cell labelled with its option letter", () => {
    expect(compare.attrs.class).toContain("n3");
    const cells = select(compare, ".cell").filter((c) => !closest(c, "div.labels") && !closest(c, "div.controls"));
    expect(cells.length).toBeGreaterThan(EXPECTED_KEYS.length * 3);
    for (const cell of cells) expect(textOf(kids(cell, "span.tag")[0])).toBe(cell.attrs["data-option"]);
    for (const cell of kids(kids(compare, "div.controls")[0], "div.cell")) expect(textOf(cell)).toMatch(new RegExp(`^Option ${cell.attrs["data-option"]} `));
    const css = select(tree, "style")[0].text.join("");
    // One column by default; side by side only from the width where the columns fit
    expect(css).toContain(".grid{display:grid;grid-template-columns:minmax(0,1fr)");
    expect(css).toContain(`@media (min-width:${WIDE_FROM[3]}px){.n3 .grid{grid-template-columns:repeat(3,minmax(0,1fr))}`);
    expect(WIDE_FROM[2]).toBeGreaterThan(390);
    // Nothing forces a width a 390 px screen cannot hold (media conditions aside)
    const widths = [...css.replace(/@media \([^)]*\)/g, "").matchAll(/(?:^|[;{])(?:min-)?width:([\d.]+)(px|rem)/g)];
    expect(widths.length).toBeGreaterThan(3);
    expect(widths.map(([, n, unit]) => Number(n) * (unit === "rem" ? 18 : 1)).filter((px) => px > 44)).toEqual([]);
  });

  it("keeps the harness's leak words out of the stylesheet, the script and every attribute (CSS's own none aside)", () => {
    const code = [...select(tree, "style"), ...select(tree, "script").filter((s) => s.attrs.type === undefined)].map((n) => n.text.join(""));
    const attributes = all(tree, () => true).flatMap((n) => Object.values(n.attrs));
    const hits = [...code, ...attributes].map((s) => s.replace(/\bnone\b/gi, "").match(LEAK_PATTERN)?.[0]).filter(Boolean);
    expect(hits).toEqual([]);
  });

  it("keeps n and p for the items, but not while typing a note", () => {
    const script = select(tree, "script").filter((s) => s.attrs.type === undefined)[0].text.join("");
    expect(script).toContain(`if(tag==="input"&&ev.target.type==="text"||tag==="textarea"||tag==="select")return;`);
    expect(script).toContain(`if(ev.key==="n"){show(state.current+1,true);}else if(ev.key==="p"){show(state.current-1,true);}`);
  });

  it("shows a template's teaser and difficulty levels as rows of their own", () => {
    const template = { ...setupOutput("Tides"), teaser: "Sail away.", difficultyLevels: [{ modifier: -10, title: "Squall" }, { modifier: 0, title: "Fair" }] };
    const page = parseHtml(renderRatingPage(comparisonSet([template, template])));
    expect(sectionKeys(page).slice(0, 4)).toEqual(["premise", "difficulty", "teaser", "characterSelection"]);
    expect(textOf(kids(sectionAt(page, "teaser"), "div.body")[0])).toBe("A Sail away. B Sail away.");
    expect(textOf(bodyCells(sectionAt(page, "difficulty"))[0])).toBe("A Squall (modifier -10) · Fair (modifier 0)");
  });

  it("aligns players by slot, with a dash where an option has no such player", () => {
    const duo = { ...setupOutput("Duo"), player2: setupOutput("x").player1 };
    const page = parseHtml(renderRatingPage(comparisonSet([setupOutput("Solo"), duo])));
    expect(optionsOf(headCells(sectionAt(page, "player2")))).toEqual(["A", "B"]);
    expect(gists(sectionAt(page, "player2"))).toEqual(["", "Outcomes 1 Identities 1 Backgrounds 1"]);
    expect(textOf(bodyCells(sectionAt(page, "player2.outcomes"))[0])).toBe("A —");
  });
});

describe("renderRatingPage: turns side by side", () => {
  const beat = (slot: string, playerName: string, title: string, extra = 0): TurnBeat => ({
    slot,
    playerName,
    title,
    paragraphs: ["You wake.", ...new Array<string>(extra).fill("More happens.")],
    options: ["Go", "Stay", "Hide"],
    interludes: ["A gull cries."],
  });
  function turnSet(beats: (label: string) => TurnBeat[]): RatingSet {
    const context = [
      { heading: "Before this turn: player 1", lines: ["Character: Ada"] },
      { heading: "Before this turn: player 2", lines: ["Character: Bo"] },
    ];
    const options = ["A", "B"].map((label) => ({ label, content: { kind: "turn", beats: beats(label) } as TurnContent }));
    return { setId: "text-turn", pageId: "page", kind: "turn", title: "Turns", instructions: [], fieldLabels: [], items: [{ id: "turn-01", context, options }], preview: false };
  }
  const multi = parseHtml(renderRatingPage(turnSet((l) => [beat("player1", "Ada", `Dawn ${l}`, l === "B" ? 5 : 0), beat("player2", "Bo", `Dusk ${l}`)])));
  const parts = (p: string) => [p, `${p}.title`, `${p}.text`, `${p}.options`, `${p}.interludes`];

  it("aligns the context and, per player, title, text, options and interludes, all foldable and all open", () => {
    expect(sectionKeys(multi)).toEqual(["context-1", "context-2", ...parts("player1"), ...parts("player2")]);
    expect(select(multi, "details").every((d) => d.attrs.open !== undefined)).toBe(true);
    for (const section of select(multi, "details.sec")) expect(optionsOf(headCells(section))).toEqual(["A", "B"]);
    expect(textOf(headCells(sectionAt(multi, "player1"))[0])).toContain("For Ada");
    expect(gists(sectionAt(multi, "player1.options"))).toEqual(["3", "3"]);
    expect(textOf(bodyCells(sectionAt(multi, "player1.title"))[1])).toBe("B Dawn B");
  });

  it("leaves out the player row on a single-player turn", () => {
    const single = parseHtml(renderRatingPage(turnSet((l) => [beat("player1", "Ada", `Dawn ${l}`)])));
    expect(sectionKeys(single)).toEqual(["context-1", "context-2", "title", "text", "options", "interludes"]);
  });

  it("registers every fixed string with the blinding word check", () => {
    expect(pageFieldLabels("turn")).toEqual(expect.arrayContaining(Object.values(TURN_FIELD_LABELS)));
    expect(pageFieldLabels("setup")).toEqual(expect.arrayContaining(Object.values(SETUP_FIELD_LABELS)));
    expect([...pageFieldLabels("turn"), ...pageFieldLabels("setup")].filter((label) => LEAK_PATTERN.test(label))).toEqual([]);
  });
});

describe("renderRatingPage", () => {
  const { set, key } = plan("7f3a9c1e5b2d4a60");
  const html = renderRatingPage(set);

  it("makes no network reference", () => {
    expect(html).not.toMatch(/\b(src|href)=["']?(https?:)?\/\//i);
    expect(html).not.toMatch(/@import|<link\b|fonts\./i);
  });

  it("escapes narrative, including a closing script tag", () => {
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("&lt;/script&gt;&lt;b&gt;bold&lt;/b&gt;");
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it("shows every option's text and never the key", () => {
    for (const item of set.items) {
      for (const option of item.options) {
        if (option.content.kind === "setup") expect(html).toContain(option.content.title);
      }
    }
    expect(html).not.toContain(key.keyFile);
    expect(html).not.toContain(key.salt);
  });
});

describe("withPictureNotes", () => {
  it("breaks paragraphs where the game does: at single newlines too", () => {
    expect(withPictureNotes("First paragraph.\nSecond paragraph.\n\nThird paragraph.")).toEqual([
      "First paragraph.",
      "Second paragraph.",
      "Third paragraph.",
    ]);
  });

  it("keeps an image line with the paragraph after it", () => {
    expect(withPictureNotes('Before.\n[image id=inn source=story desc="The inn"]\nAfter.')).toEqual([
      "Before.",
      "[picture: The inn] After.",
    ]);
  });
});

describe("scoreRatings", () => {
  const { key } = plan("score", 3);
  const labelOf = (itemId: string, armKey: string, sample = 1) =>
    Object.entries(key.items[itemId].labels).find(([, ref]) => ref.armKey === armKey && ref.sample === sample)?.[0] ?? "";

  function exportWith(rank: (itemId: string, armKey: string) => number): ExportedRatings {
    const ratings: ExportedRatings["ratings"] = {};
    for (const [itemId, item] of Object.entries(key.items)) {
      ratings[itemId] = Object.fromEntries(
        Object.entries(item.labels).map(([label, ref]) => [label, { acceptable: ref.armKey === SOL.key ? "no" : "yes", rank: rank(itemId, ref.armKey), note: ref.armKey === LUNA.key ? "nice" : "" }])
      );
    }
    return { pageId: key.pageId, setId: key.setId, exportedAt: "2026-09-27T00:00:00Z", ratings };
  }

  it("maps labels to arms and scores against the baseline", () => {
    const scores = scoreRatings(exportWith((_, armKey) => (armKey === LUNA.key ? 1 : armKey === BASELINE.key ? 2 : 3)), key);
    const luna = scores.arms.find((a) => a.arm === `prefix:${LUNA.key}`);
    const sol = scores.arms.find((a) => a.arm === `prefix:${SOL.key}`);
    expect(luna).toMatchObject({ acceptableRate: 1, meanRank: 1, equalOrBetterThanBaseline: 1, wins: 3 });
    expect(sol).toMatchObject({ acceptableRate: 0, meanRank: 3, equalOrBetterThanBaseline: 0, losses: 3 });
    expect(scores.notes.every((n) => n.arm.includes(LUNA.key))).toBe(true);
    expect(labelOf(Object.keys(key.items)[0], LUNA.key)).toMatch(/^[A-C]$/);
  });

  it("reports agreement on the repeated item", () => {
    const repeatId = Object.entries(key.items).find(([, item]) => item.repeatOf)?.[0] ?? "";
    const consistent = scoreRatings(exportWith((_, armKey) => (armKey === LUNA.key ? 1 : 2)), key);
    expect(consistent.repeat).toMatchObject({ item: repeatId, acceptableAgreement: 1, sameRankOrder: true });
    const flipped = scoreRatings(exportWith((itemId, armKey) => (itemId === repeatId ? (armKey === LUNA.key ? 3 : 1) : armKey === LUNA.key ? 1 : 2)), key);
    expect(flipped.repeat?.sameRankOrder).toBe(false);
  });

  it("rejects an export for another page", () => {
    expect(() => scoreRatings({ ...exportWith(() => 1), pageId: "other" }, key)).toThrow(/key for/);
  });

  const itemIds = Object.keys(key.items);
  const regularIds = itemIds.filter((id) => !key.items[id].control && !key.items[id].repeatOf);
  const repeatId = itemIds.find((id) => key.items[id].repeatOf) ?? "";
  const controlId = itemIds.find((id) => key.items[id].control) ?? "";
  const armOf = (a: Arm) => `prefix:${a.key}`;

  /** Ranks only, as the owner exports them with no Acceptable? verdict; an undefined rank leaves the option out, a skipped item leaves the item out. */
  function rankOnly(rank: (itemId: string, armKey: string) => number | undefined, skip: string[] = []): ExportedRatings {
    const ratings: ExportedRatings["ratings"] = {};
    for (const [itemId, item] of Object.entries(key.items)) {
      if (skip.includes(itemId)) continue;
      ratings[itemId] = Object.fromEntries(
        Object.entries(item.labels).flatMap(([label, ref]) => {
          const r = rank(itemId, ref.armKey);
          return r === undefined ? [] : [[label, { rank: r }]];
        })
      );
    }
    return { pageId: key.pageId, setId: key.setId, exportedAt: "2026-09-27T00:00:00Z", ratings };
  }

  const lunaFirst = (_: string, armKey: string) => (armKey === LUNA.key ? 1 : armKey === BASELINE.key ? 2 : 3);

  it("scores a rank-only export and reads the acceptable columns as not marked", () => {
    const scores = scoreRatings(rankOnly(lunaFirst), key);
    expect(scores.arms.map((a) => a.arm)).toEqual([armOf(BASELINE), armOf(LUNA), armOf(SOL)]);
    const [baseline, luna, sol] = scores.arms;
    expect(baseline).toMatchObject({ ranked: 3, meanRank: 2, rank1: 0, acceptableMarked: 0, acceptableRate: null });
    expect(luna).toMatchObject({ ranked: 3, meanRank: 1, rank1: 3, wins: 3, ties: 0, losses: 0, equalOrBetterThanBaseline: 1, acceptableRate: null });
    expect(sol).toMatchObject({ ranked: 3, meanRank: 3, rank1: 0, wins: 0, ties: 0, losses: 3, equalOrBetterThanBaseline: 0 });
    expect(scores.completeness.acceptableMarked).toBe(false);

    const md = renderScores(scores);
    const row = md.split("\n").find((line) => line.startsWith(`| ${armOf(LUNA)} `)) ?? "";
    expect(row).toContain("| 3 | 1.00 | 3 |");
    expect(row).toContain("not marked");
    expect(md).not.toMatch(/NaN|Infinity/);
    expect(md).toContain("Every option of every item was ranked.");
    expect(md).toContain("No option carries an Acceptable? verdict");
  });

  it("computes the acceptable columns over the options that carry a verdict", () => {
    const exported = rankOnly(lunaFirst);
    const first = regularIds[0];
    exported.ratings[first][labelOf(first, LUNA.key)].acceptable = "yes";
    exported.ratings[first][labelOf(first, SOL.key)].acceptable = "no";
    const scores = scoreRatings(exported, key);
    const luna = scores.arms.find((a) => a.arm === armOf(LUNA));
    const sol = scores.arms.find((a) => a.arm === armOf(SOL));
    const baseline = scores.arms.find((a) => a.arm === armOf(BASELINE));
    expect(luna).toMatchObject({ acceptableMarked: 1, acceptableYes: 1, acceptableRate: 1 });
    expect(sol).toMatchObject({ acceptableMarked: 1, acceptableYes: 0, acceptableRate: 0 });
    expect(baseline).toMatchObject({ acceptableMarked: 0, acceptableRate: null });
    expect(scores.completeness.acceptableMarked).toBe(true);
    expect(scores.completeness.unmarked.find((u) => u.item === first)?.options.map((o) => o.label)).toEqual([labelOf(first, BASELINE.key)]);
  });

  /** The Completeness line naming an item's options other than the ranked arms. */
  const unrankedLine = (itemId: string, ranked: string[], label: string) =>
    `- ${itemId}: ${Object.entries(key.items[itemId].labels)
      .filter(([, ref]) => !ranked.includes(ref.armKey))
      .map(([l, ref]) => `${l} (prefix:${ref.armKey} s1)`)
      .join(", ")} ${label}.`;
  const READ_AS_WORSE = "unranked (read as worse, unordered)";

  it("reads the options left unranked beside a single rank as tied with each other and worse than it", () => {
    const [onlyBaseline, onlyLuna] = regularIds;
    const scores = scoreRatings(
      rankOnly((itemId, armKey) => {
        if (itemId === onlyBaseline) return armKey === BASELINE.key ? 1 : undefined;
        if (itemId === onlyLuna) return armKey === LUNA.key ? 1 : undefined;
        return lunaFirst(itemId, armKey);
      }),
      key
    );
    const luna = scores.arms.find((a) => a.arm === armOf(LUNA));
    const baseline = scores.arms.find((a) => a.arm === armOf(BASELINE));
    const sol = scores.arms.find((a) => a.arm === armOf(SOL));
    // Only a 1 given, so the unranked options count as 2: Luna loses where only the baseline is ranked, Sol ties the baseline where only Luna is
    expect(luna).toMatchObject({ ranked: 3, meanRank: 4 / 3, rank1: 2, wins: 2, ties: 0, losses: 1 });
    expect(baseline).toMatchObject({ ranked: 3, meanRank: 5 / 3, rank1: 1 });
    expect(sol).toMatchObject({ ranked: 3, meanRank: 7 / 3, rank1: 0, wins: 0, ties: 1, losses: 2 });

    const unranked = (itemId: string) => scores.completeness.unranked.find((u) => u.item === itemId)?.options.map((o) => o.label).sort();
    expect(unranked(onlyBaseline)).toEqual([labelOf(onlyBaseline, LUNA.key), labelOf(onlyBaseline, SOL.key)].sort());
    expect(unranked(onlyLuna)).toEqual([labelOf(onlyLuna, BASELINE.key), labelOf(onlyLuna, SOL.key)].sort());
    expect(scores.completeness.unratedItems).toEqual([]);

    const md = renderScores(scores);
    expect(md).not.toContain("Every option of every item was ranked.");
    expect(md).toContain(unrankedLine(onlyBaseline, [BASELINE.key], READ_AS_WORSE));
    expect(md).toContain(unrankedLine(onlyLuna, [LUNA.key], READ_AS_WORSE));
    expect(md).toContain("the rank one below the worst rank given on that item");
  });

  it("reads an option left unranked beside two ranks as one below the worst of them, ties included", () => {
    const [lunaThenBaseline, tiedFirst] = regularIds;
    const scores = scoreRatings(
      rankOnly((itemId, armKey) => {
        if (itemId === lunaThenBaseline) return armKey === LUNA.key ? 1 : armKey === BASELINE.key ? 2 : undefined;
        if (itemId === tiedFirst) return armKey === LUNA.key ? undefined : 1;
        return lunaFirst(itemId, armKey);
      }),
      key
    );
    const luna = scores.arms.find((a) => a.arm === armOf(LUNA));
    const baseline = scores.arms.find((a) => a.arm === armOf(BASELINE));
    const sol = scores.arms.find((a) => a.arm === armOf(SOL));
    // Sol reads as 3 below Luna 1 and the baseline 2; Luna reads as 2 below the baseline and Sol tied at 1
    expect(sol).toMatchObject({ ranked: 3, meanRank: 7 / 3, rank1: 1, wins: 0, ties: 1, losses: 2 });
    expect(luna).toMatchObject({ ranked: 3, meanRank: 4 / 3, rank1: 2, wins: 2, ties: 0, losses: 1 });
    expect(baseline).toMatchObject({ ranked: 3, meanRank: 5 / 3, rank1: 1 });

    const md = renderScores(scores);
    expect(md).toContain(unrankedLine(lunaThenBaseline, [LUNA.key, BASELINE.key], READ_AS_WORSE));
    expect(md).toContain(unrankedLine(tiedFirst, [BASELINE.key, SOL.key], READ_AS_WORSE));
  });

  it("leaves an item without any rank unrated, whether it carries only verdicts or only a note", () => {
    const [verdictsOnly, noteOnly] = regularIds;
    const exported = rankOnly((itemId, armKey) => ([verdictsOnly, noteOnly].includes(itemId) ? undefined : lunaFirst(itemId, armKey)));
    exported.ratings[verdictsOnly] = Object.fromEntries(Object.keys(key.items[verdictsOnly].labels).map((label) => [label, { acceptable: "yes" }]));
    exported.ratings[noteOnly] = { [labelOf(noteOnly, LUNA.key)]: { note: "not sure yet" } };
    const scores = scoreRatings(exported, key);
    expect(scores.arms.map((a) => a.ranked)).toEqual([1, 1, 1]);
    expect(scores.arms.find((a) => a.arm === armOf(SOL))).toMatchObject({ meanRank: 3, wins: 0, ties: 0, losses: 1 });
    expect(scores.completeness.unratedItems).toEqual([noteOnly]);

    const md = renderScores(scores);
    expect(md).toContain(unrankedLine(verdictsOnly, [], "unranked"));
    expect(md).not.toMatch(new RegExp(`${verdictsOnly}:.*read as worse`));
    expect(md).toMatch(new RegExp(`Not rated at all: ${noteOnly}\\b`));
  });

  it("reads the repeat with its unranked options as worse, unordered", () => {
    const first = key.items[repeatId].repeatOf ?? "";
    const scores = scoreRatings(
      rankOnly((itemId, armKey) => {
        if (itemId === repeatId) return armKey === LUNA.key ? 1 : undefined;
        if (itemId === first) return armKey === LUNA.key ? 1 : 2;
        return lunaFirst(itemId, armKey);
      }),
      key
    );
    expect(scores.repeat).toMatchObject({ item: repeatId, rankCompared: 3, sameRankOrder: true });
    expect(renderScores(scores)).toContain(unrankedLine(repeatId, [LUNA.key], READ_AS_WORSE).replace(`${repeatId}:`, `${repeatId} (repeat of ${first}):`));
  });

  it("reads the control's unranked sample as worse than the ranked one", () => {
    const exported = rankOnly(lunaFirst);
    const [ranked, unranked] = Object.keys(key.items[controlId].labels);
    exported.ratings[controlId] = { [ranked]: { rank: 1 }, [unranked]: {} };
    const scores = scoreRatings(exported, key);
    const sampleOf = (label: string) => key.items[controlId].labels[label].sample;
    expect(scores.control?.samples.find((s) => s.sample === sampleOf(ranked))).toMatchObject({ rank: 1, readAsWorse: false });
    expect(scores.control?.samples.find((s) => s.sample === sampleOf(unranked))).toMatchObject({ rank: 2, readAsWorse: true });
    const md = renderScores(scores);
    expect(md).toContain(`sample ${sampleOf(unranked)} rank 2 (unranked, read as worse)`);
    expect(md).toContain(`sample ${sampleOf(ranked)} rank 1,`);
  });

  it("lists an item missing from the export as not rated at all", () => {
    const missing = regularIds[1];
    const scores = scoreRatings(rankOnly(lunaFirst, [missing]), key);
    expect(scores.completeness.unratedItems).toEqual([missing]);
    expect(scores.completeness.unranked.find((u) => u.item === missing)).toBeUndefined();
    expect(scores.arms.find((a) => a.arm === armOf(LUNA))).toMatchObject({ ranked: 2, wins: 2 });
    const md = renderScores(scores);
    expect(md).toMatch(new RegExp(`Not rated at all: ${missing}\\b`));
    expect(md).not.toContain("Every option of every item was ranked.");
  });

  it("says the repeat and control readings are unavailable when their items have no ratings", () => {
    const scores = scoreRatings(rankOnly(lunaFirst, [repeatId, controlId]), key);
    expect(scores.repeat).toMatchObject({ item: repeatId, acceptableAgreement: null, sameRankOrder: null });
    expect(scores.completeness.unratedItems.sort()).toEqual([repeatId, controlId].sort());
    const md = renderScores(scores);
    expect(md).toContain(`Repeated item ${repeatId} (of ${scores.repeat?.of}): unavailable, ${repeatId} has no ratings.`);
    expect(md).toContain(`Baseline against baseline (${controlId}): unavailable, ${controlId} has no ratings.`);
    expect(md).not.toMatch(/agree on \d+%/);
    expect(md).not.toMatch(/rank order (identical|differs)/);
    expect(md).toMatch(new RegExp(`Not rated at all: .*${repeatId} \\(repeat of`));
  });

  it("reads a ranked repeat's order without verdicts, and leaves acceptable agreement unavailable", () => {
    const scores = scoreRatings(rankOnly(lunaFirst), key);
    expect(scores.repeat).toMatchObject({ item: repeatId, acceptableAgreement: null, sameRankOrder: true, rankCompared: 3 });
    const md = renderScores(scores);
    expect(md).toContain("rank order identical");
    expect(md).not.toMatch(/agree on \d+%/);
  });
});

describe("a pairwise turn page with chapter openings (turn round 1)", () => {
  const REF = { promptState: "round0", armKey: "gpt-6-luna@medium/prod" };
  const CAND = { promptState: "round0", armKey: "gpt-6-luna@medium/chapterFull" };
  const REF_CHAIN = { promptState: "round0", armKey: "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod" };
  const CAND_CHAIN = { promptState: "round0", armKey: "pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/chapterFull" };
  const turnOutput = (title: string) => beatSet(1, { player1: { ...beatGeneration({ title, text: `${title} happens.` }), options: challengeOptions() } });
  const planOutput = (title: string) => {
    const plan = threadAnalysis("challenge", 2, 4);
    return { ...plan, threads: plan.threads.map((t) => ({ ...t, title, question: "A version-only question?", plan: "A version-only plan." })) };
  };

  function turnFixture() {
    const beats = Array.from({ length: 12 }, (_, i) => evalCase(`step-${i}`, "beat", { state: threadBeat(1, { id: `story-${i}` }).getState() }));
    const threads = Array.from({ length: 5 }, (_, i) => evalCase(`open-${i}`, "thread", { state: threadAnalysisAfterSwitch(1, { id: `story-t${i}` }).getState() }));
    const records: CallRecord[] = [];
    const outputs = new Map<string, unknown>();
    const add = (r: Partial<CallRecord>, output: unknown) => {
      outputs.set(r.outputFile ?? "", output);
      records.push(record({ ...r, callArmKey: r.armKey, baseline: false }));
    };
    for (const c of beats) {
      for (const [arm, samples] of [[REF, [1, 2]], [CAND, [1]]] as const) {
        for (const sample of samples) add({ caseId: c.id, group: "beat", role: "beat", promptState: arm.promptState, armKey: arm.armKey, sample, outputFile: `${c.id}-${arm.armKey}-${sample}` }, turnOutput(`Turn ${arm === REF ? "one" : "two"}`));
      }
    }
    for (const c of threads) {
      for (const chain of [REF_CHAIN, CAND_CHAIN]) {
        const jobKey = `${c.id}|${chain.armKey}|round0|s1`;
        const which = chain === REF_CHAIN ? "one" : "two";
        add({ jobKey, caseId: c.id, group: "pipeline", role: "thread", promptState: "round0", armKey: chain.armKey, sample: 1, step: 1, jobFinal: false, outputFile: `${jobKey}-plan` }, planOutput(`Plan of ${which}`));
        add({ jobKey, caseId: c.id, group: "pipeline", role: "beat", promptState: "round0", armKey: chain.armKey, sample: 1, step: 2, outputFile: `${jobKey}-turn` }, turnOutput(`Opening ${which}`));
      }
    }
    return { cases: [...beats, ...threads], records, load: (r: CallRecord) => outputs.get(r.outputFile ?? "") };
  }

  const { cases, records, load } = turnFixture();
  const spec: RatingSpec = { kind: "turn", arms: [REF, CAND], items: 10, preview: false, pairwise: true, chainArms: [REF_CHAIN, CAND_CHAIN], chainItems: 4 };
  const { set, key } = planRatingSet(spec, records, cases, { loadOutput: load, salt: "chains", now: new Date(0) });
  const chainItems = Object.entries(key.items).filter(([, i]) => i.reference);

  it("adds the chapter openings beside the steps, each pairing the two chains with their own reference", () => {
    expect(chainItems).toHaveLength(4);
    for (const [, item] of chainItems) {
      expect(item.reference).toEqual(REF_CHAIN);
      expect(Object.values(item.labels).map((l) => l.armKey).sort()).toEqual([CAND_CHAIN.armKey, REF_CHAIN.armKey].sort());
    }
    expect(Object.values(key.items).filter((i) => !i.reference && !i.repeatOf && !i.control)).toHaveLength(10);
    // The reference chain sits at A on half the chapter openings
    expect(chainItems.filter(([, i]) => i.labels.A.armKey === REF_CHAIN.armKey)).toHaveLength(2);
    // The repeat repeats a chapter step, never a chain item
    const repeat = Object.values(key.items).find((i) => i.repeatOf);
    expect(repeat?.reference).toBeUndefined();
  });

  it("shows each chain option its own plan, with only the fields every planner form writes, and stops the context at the switch", () => {
    const item = set.items.find((i) => i.id === chainItems[0][0]);
    const plans = item?.options.map((o) => (o.content.kind === "turn" ? o.content.plan : undefined)) ?? [];
    expect(plans.every((p) => p && p.length === 1)).toBe(true);
    const planText = JSON.stringify(plans);
    expect(planText).toContain("Plan of ");
    expect(planText).not.toContain("version-only");
    const chapter = item?.context.find((s) => s.key === "chapter");
    expect(JSON.stringify(chapter)).toContain("The switch the player chose from");
    expect(JSON.stringify(chapter)).toContain("planned this chapter itself");
  });

  it("renders the plans in a row of their own and leaks no arm, chain sides included", () => {
    const html = renderRatingPage(set);
    expect(sectionKeys(parseHtml(html))).toContain("chapterPlan");
    expect(htmlLeaks(html, key)).toEqual([]);
    expect(metadataLeaks(set)).toEqual([]);
    expect(htmlLeaks("gpt-6-luna@medium/chapterFull", key).length).toBeGreaterThan(0);
  });

  it("scores a chain item against its own reference", () => {
    const [chainId, item] = chainItems[0];
    const candidateLabel = Object.entries(item.labels).find(([, l]) => l.armKey === CAND_CHAIN.armKey)?.[0] ?? "";
    const exported: ExportedRatings = { pageId: key.pageId, setId: key.setId, exportedAt: "2026-09-28T00:00:00Z", mode: "pairwise", ratings: {}, preferences: { [chainId]: candidateLabel } };
    expect(scorePairwise(exported, key).items.find((i) => i.item === chainId)?.result).toBe("win");
  });

  it("rebuilds the page from its key", () => {
    expect(ratingSetFromKey(key, records, cases, load)).toEqual(set);
  });
});

describe("the rebuilt turn round 1 page (turns-r1b, 2026-09-28): the nearer frames and the chain items' cases", () => {
  const REF = { promptState: "round0", armKey: "gpt-6-luna@medium/prod" };
  const CAND = { promptState: "round0", armKey: "gpt-6-luna@medium/chapterFullB" };
  const REF_CHAIN = { promptState: "round0", armKey: "pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod" };
  const CAND_CHAIN = { promptState: "round0", armKey: "pipeline:gpt-6-luna@low/planV2c>gpt-6-luna@medium/chapterFullB" };
  const turnOutput = (title: string) => beatSet(1, { player1: { ...beatGeneration({ title, text: `${title} happens.` }), options: challengeOptions() } });
  const planOutput = () => threadAnalysis("challenge", 2, 4);

  function fixture() {
    const frame = (question: string, typeOfMilestone?: string) => (state: ReturnType<ReturnType<typeof threadBeat>["getState"]>) => {
      const id = (state.storyPhases[state.storyPhases.length - 1] as { threads: { id: string }[] }).threads[0].id;
      return { [id]: { question, plan: `${question} plan.`, chapterKey: "k", ...(typeOfMilestone ? { typeOfMilestone } : {}) } };
    };
    const beats = Array.from({ length: 4 }, (_, i) => {
      const state = threadBeat(1, { id: `story-${i}` }).getState();
      return evalCase(`step-${i}`, "beat", { state, chapterFrames: frame("First question?")(state), nearerFrames: frame("Nearer question?", "whether the ledger names the banker")(state) });
    });
    const threads = Array.from({ length: 5 }, (_, i) => evalCase(`open-${i}`, "thread", { state: threadAnalysisAfterSwitch(1, { id: `story-t${i}` }).getState() }));
    const records: CallRecord[] = [];
    const outputs = new Map<string, unknown>();
    const add = (r: Partial<CallRecord>, output: unknown) => {
      outputs.set(r.outputFile ?? "", output);
      records.push(record({ ...r, callArmKey: r.armKey, baseline: false }));
    };
    for (const c of beats) {
      for (const [arm, samples] of [[REF, [1, 2]], [CAND, [1]]] as const) {
        for (const sample of samples) add({ caseId: c.id, group: "beat", role: "beat", promptState: arm.promptState, armKey: arm.armKey, sample, outputFile: `${c.id}-${arm.armKey}-${sample}` }, turnOutput("Turn"));
      }
    }
    for (const c of threads) {
      for (const chain of [REF_CHAIN, CAND_CHAIN]) {
        const jobKey = `${c.id}|${chain.armKey}|round0|s1`;
        add({ jobKey, caseId: c.id, group: "pipeline", role: "thread", promptState: "round0", armKey: chain.armKey, sample: 1, step: 1, jobFinal: false, outputFile: `${jobKey}-plan` }, planOutput());
        add({ jobKey, caseId: c.id, group: "pipeline", role: "beat", promptState: "round0", armKey: chain.armKey, sample: 1, step: 2, outputFile: `${jobKey}-turn` }, turnOutput("Opening"));
      }
    }
    return { cases: [...beats, ...threads], records, load: (r: CallRecord) => outputs.get(r.outputFile ?? "") };
  }

  const { cases, records, load } = fixture();
  const spec: RatingSpec = {
    kind: "turn",
    arms: [REF, CAND],
    items: 3,
    preview: false,
    pairwise: true,
    chainArms: [REF_CHAIN, CAND_CHAIN],
    chainItems: 2,
    chainCaseIds: ["open-1", "open-3"],
    frames: "nearer",
  };
  const { set, key } = planRatingSet(spec, records, cases, { loadOutput: load, salt: "nearer", now: new Date(0) });
  const text = (itemId: string) => JSON.stringify(set.items.find((i) => i.id === itemId)?.context);

  it("records the nearer frames in the key and shows them, with their kind of milestone, in each step's context", () => {
    expect(key.frames).toBe("nearer");
    const steps = Object.entries(key.items).filter(([, i]) => !i.reference && i.caseId.startsWith("step-"));
    expect(steps.length).toBeGreaterThan(0);
    for (const [id] of steps) {
      expect(text(id)).toContain("Nearer question?");
      expect(text(id)).toContain("whether the ledger names the banker");
      expect(text(id)).not.toContain("First question?");
    }
    // Without the option, the first frames and the stored kind of milestone stand
    const first = planRatingSet({ ...spec, frames: undefined }, records, cases, { loadOutput: load, salt: "nearer", now: new Date(0) });
    expect(first.key.frames).toBeUndefined();
    expect(JSON.stringify(first.set.items.map((i) => i.context))).toContain("First question?");
    expect(JSON.stringify(first.set.items.map((i) => i.context))).not.toContain("whether the ledger names the banker");
  });

  it("takes the chapter openings from the cases named, and rebuilds the page from its key", () => {
    expect(Object.values(key.items).filter((i) => i.reference).map((i) => i.caseId).sort()).toEqual(["open-1", "open-3"]);
    expect(ratingSetFromKey(key, records, cases, load)).toEqual(set);
  });
});

describe("a pairwise turn page for the group round (B10): the group questions, every player's turn per option", () => {
  const REF = { promptState: "round0", armKey: "gpt-6-luna@low/prod" };
  const CAND = { promptState: "round0", armKey: "gpt-6-luna@low/turnB10" };
  const cases = Array.from({ length: 5 }, (_, i) => evalCase(`group-${i}`, "beat", { state: threadBeat(2, { id: `story-g${i}` }).getState(), tags: tags({ multiplayer: true, players: 2 }) }));
  const records: CallRecord[] = [];
  const outputs = new Map<string, unknown>();
  for (const c of cases) {
    for (const [arm, samples] of [[REF, [1, 2]], [CAND, [1]]] as const) {
      for (const sample of samples) {
        const outputFile = `${c.id}-${arm.armKey}-${sample}`;
        outputs.set(outputFile, beatSet(2, { player1: beatGeneration({ text: `First player scene in ${c.id}.` }), player2: beatGeneration({ text: `Second player scene in ${c.id}.` }) }));
        records.push(record({ caseId: c.id, group: "beat", role: "beat", promptState: arm.promptState, armKey: arm.armKey, callArmKey: arm.armKey, baseline: false, sample, players: 2, outputFile }));
      }
    }
  }
  const load = (r: CallRecord) => outputs.get(r.outputFile ?? "");
  const { set, key } = planRatingSet({ kind: "turn", arms: [REF, CAND], items: 4, preview: false, pairwise: true, criteria: "groups" }, records, cases, { loadOutput: load, salt: "groups", now: new Date(0) });

  it("asks whether the players' turns tell their shared moments alike, keeps the questions in the key, and leaks nothing", () => {
    const text = set.instructions.join(" ");
    for (const question of PAIRWISE_CRITERIA_SETS.groups) expect(text).toContain(question);
    expect(text).toContain("the same lines, from the same speakers");
    expect(key.criteria).toBe("groups");
    expect(ratingSetFromKey(key, records, cases, load)).toEqual(set);
    expect(metadataLeaks(set)).toEqual([]);
    expect(htmlLeaks(renderRatingPage(set), key)).toEqual([]);
    expect(renderRatingPage(set)).toContain("Second player scene in");
  });
});

describe("a pairwise turn page for turn round 2: the owner's round-2 questions, and endings as the player sees them", () => {
  const REF = { promptState: "round0", armKey: "gpt-6-luna@medium/prod" };
  const CAND = { promptState: "round0", armKey: "gpt-6-luna@medium/turnR2" };
  function fixture() {
    const cases = [
      ...Array.from({ length: 3 }, (_, i) => evalCase(`end-${i}`, "beat", { state: endingBeat(1, { id: `story-e${i}` }).getState(), tags: tags({ ending: true }) })),
      ...Array.from({ length: 3 }, (_, i) => evalCase(`step-${i}`, "beat", { state: threadBeat(1, { id: `story-s${i}` }).getState() })),
    ];
    const records: CallRecord[] = [];
    const outputs = new Map<string, unknown>();
    for (const c of cases) {
      for (const [arm, samples] of [[REF, [1, 2]], [CAND, [1]]] as const) {
        for (const sample of samples) {
          const outputFile = `${c.id}-${arm.armKey}-${sample}`;
          // Today's ending still writes options and interludes, which the game hides
          outputs.set(outputFile, beatSet(1, { player1: beatGeneration({ title: "The End", text: `Ending of ${c.id}.`, options: arm === REF ? challengeOptions() : [], interludes: arm === REF ? beatGeneration().interludes : [] }) }));
          records.push(record({ caseId: c.id, group: "beat", role: "beat", promptState: arm.promptState, armKey: arm.armKey, callArmKey: arm.armKey, baseline: false, sample, outputFile }));
        }
      }
    }
    return { cases, records, load: (r: CallRecord) => outputs.get(r.outputFile ?? "") };
  }
  const { cases, records, load } = fixture();
  const { set, key } = planRatingSet({ kind: "turn", arms: [REF, CAND], items: 4, preview: false, pairwise: true, criteria: "turnRound2" }, records, cases, {
    loadOutput: load,
    salt: "round2",
    now: new Date(0),
  });

  it("prints round 2's questions instead of round 1's, and keeps them in the key for a re-render", () => {
    const text = set.instructions.join(" ");
    for (const question of PAIRWISE_CRITERIA_SETS.turnRound2) expect(text).toContain(question);
    expect(text).not.toContain("follow its plan");
    expect(key.criteria).toBe("turnRound2");
    expect(ratingSetFromKey(key, records, cases, load)).toEqual(set);
    expect(metadataLeaks(set)).toEqual([]);
    expect(htmlLeaks(renderRatingPage(set), key)).toEqual([]);
  });

  it("shows no options or interludes at an ending, for either version: the game shows none", () => {
    const endings = Object.entries(key.items).filter(([, item]) => item.caseId.startsWith("end-"));
    expect(endings.length).toBeGreaterThan(0);
    for (const [id] of endings) {
      for (const option of set.items.find((i) => i.id === id)?.options ?? []) {
        if (option.content.kind !== "turn") throw new Error("a turn option");
        expect(option.content.beats.every((b) => b.options.length === 0 && b.interludes.length === 0)).toBe(true);
      }
    }
    const step = set.items.find((i) => key.items[i.id].caseId.startsWith("step-") && !key.items[i.id].control);
    const shown = step?.options.flatMap((o) => (o.content.kind === "turn" ? o.content.beats.map((b) => b.options.length) : []));
    expect(shown).toContain(3);
  });
});
