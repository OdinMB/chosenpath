import { htmlLeaks, metadataLeaks } from "../../../../src/evals/textModelEval/blinding.js";
import { SETUP_FIELD_LABELS, setupCard, withPictureNotes } from "../../../../src/evals/textModelEval/ratingContent.js";
import { renderRatingPage } from "../../../../src/evals/textModelEval/ratingPage.js";
import { planRatingSet, ratingSetFromKey, type RatingSet, type RatingSpec } from "../../../../src/evals/textModelEval/ratingSets.js";
import { scoreRatings, type ExportedRatings } from "../../../../src/evals/textModelEval/ratingScore.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { makeArm, type Arm } from "../../../../src/evals/textModelEval/arms.js";
import { GameModes } from "core/types/index.js";
import { BASELINE, LUNA, SOL, evalCase, record, tags } from "./fixtures.js";

const ARMS = [BASELINE, LUNA, SOL].map((a) => ({ promptState: "prefix", armKey: a.key }));

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

  it("shows each section in a foldable section that starts open", () => {
    for (const title of [L.characterSelection, L.guidelines, L.sharedOutcomes, L.stats, L.storyElements, `${L.player} 1`, L.imageInstructions]) {
      expect(html).toContain(`<details class="part" open><summary><h4>${title}</h4></summary>`);
    }
    for (const title of [L.sharedStats, L.playerStats]) {
      expect(html).toContain(`<details class="part" open><summary><h5>${title}</h5></summary>`);
    }
  });

  it("shows every guideline and the difficulty", () => {
    expect(html).toContain("Calm Seas (modifier +10)");
    for (const label of [L.world, L.rules, L.tone, L.conflicts, L.decisions, L.typesOfThreads]) expect(html).toContain(`<dt>${label}</dt>`);
    for (const text of ["Tides rule the town.", "Whom to trust", "Harbour chase"]) expect(html).toContain(text);
    expect(html).toContain(`<dt>${L.switchAndThreadInstructions}</dt><dd>${L.empty}</dd>`);
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
    expect(html).toContain(`<span class="k">${L.statGroups}:</span> Crew, Town`);
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
    expect(bare).not.toMatch(/<details|<dl|class="block"|class="meta"/);
    const partial = setupPage({ sharedStats: [{ name: "Supplies", tooltip: "What you have" }] });
    expect(partial).toContain(`<dt>${L.tooltip}</dt><dd>What you have</dd>`);
    for (const label of [L.effectOnPoints, L.initialValue, L.playerStats, L.storyElements]) expect(partial).not.toContain(label);
    expect(() => setupPage({ player1: { possibleCharacterBackgrounds: [{ initialPlayerStatValues: [{}] }] } })).not.toThrow();
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
});
