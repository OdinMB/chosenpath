import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { PlayerSlot, SetOfBeatGenerationSchema, Stat } from "core/types/index.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { outcomesCompletedThisBeat } from "../../game/services/storyTextRounds/outcomeSettled.js";
import type { Arm, Stage } from "./arms.js";
import { isReliable, type HandVerdict } from "./judgedChecks.js";
import { playerParagraphs } from "./playerText.js";
import { prepJob } from "./prepCalls.js";
import type { Job } from "./runner.js";
import type { StageArmReading, StageComparison } from "./stageJudge.js";

/*
 * The outcome-settled stage's judged check (2026-09-30, the second
 * playthroughs' review). One cheap GPT-6 call per switch turn that completes
 * an outcome asks completedToldSettled: every player's text and every fact
 * the turn records tell each outcome the turn completes as settled, as its
 * milestones leave it (never open, provisional, undecided, or another of its
 * resolutions), and no stat change contradicts a milestone the turn adds.
 * Phrased so yes passes. The judge reads the completed outcomes (question,
 * possible resolutions, the milestones so far and the turn's own, the game's
 * count), the other milestones the turn adds, each stat change with the
 * stat's levels and its value before, the facts the turn records and every
 * player's text as they read it; never the prompt, so production's turn and
 * the variant read alike. It says how the turn tells each completed outcome,
 * which facts call one open and whether each stat change fits, then answers.
 * Calibrated on switch turns read by hand before any judge call
 * (SETTLED_CALIBRATION), to the judged checks' standard (isReliable). The
 * endings are read by the ending's own calibrated check (endingJudge.ts).
 */

export const SETTLED_CHECK = "completedToldSettled" as const;

/**
 * Part of each judge call's key: a wording change is judged afresh. v2 (the
 * calibration's one fix, 2026-09-30) adds SETTLED_DECISION_RULE: v1 agreed with
 * the hand on 15 of 17 but its samples on only 19 of 22, and each miss rode on
 * what counts as open. It passed a completed contest whose rival proposal the
 * texts and a fact left "unresolved" (a pending alternative one of its
 * resolutions names, read as "a separate issue"), failed a contract "the
 * judges announce" (the announcing read as still to come), and read a
 * credibility stat cut by 30 beside "remains in good standing" as of no
 * bearing, since the stat names no level.
 */
export const SETTLED_JUDGE_PROMPT_VERSION = 2;

export const SETTLED_DECISION_RULE = `How to decide: judge each completed outcome by its possible resolutions. It is told settled when the words say which way its question has been decided, as its milestones say, whether they tell the decision being made, announced or recorded. It is told open when the words say its decision is still to come, provisional or undecided, or when something that would decide between its possible resolutions is still pending: a rival's proposal or a compromise that one of its resolutions names, a vote not yet taken. A matter no resolution of the outcome names is another matter and may stay open. A stat change contradicts a milestone when the stat's new level or the size of its move tells another result: a standing, trust or support stat falling steeply beside a milestone that keeps or earns them, or rising to a level whose description is another of the outcome's resolutions.`;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const IMAGE_TAG = /\[image\s+[^\]]*\]/g;

const INTRO = `YOUR JOB: CHECK ONE TURN OF A STORY GAME, A TURN THAT SETTLES OUTCOMES

In this game a story's outcomes are settled over several chapters, one milestone at a time. An outcome is complete once it holds all its intended milestones: its question is then answered, the way its milestones point. This turn follows a chapter that just ended. It adds that chapter's milestones, and the outcomes listed below are complete once they are added. The turn tells each player what happened, records facts the game keeps for every later turn, and may change stats.

The game's rules for this turn:
- An outcome the turn completes is settled. Every player's text and every fact the turn records tell it as settled, the way its milestones leave it: never as open, provisional, undecided or still to be settled, and never as another of its possible resolutions. Earlier milestones may have left it open; the one this turn adds settles it. Other matters the story goes on to are not the outcome, and outcomes the turn does not complete may be told as open.
- No stat change contradicts a milestone the turn adds: a stat whose levels say how an outcome turned out (a bond, a standing, a score) is not moved to a level that tells another result.

Read the turn as a careful editor. For each completed outcome, say how the texts tell it and quote the words that show it; list every recorded fact that calls a completed outcome open or tells it another way; say for each stat change whether it fits the milestones; then answer the question. Judge by what the words say has happened or stays so, not by their mood.

An example from another story: "Will Mara win the regional baking championship?" is completed by the milestone "The judges award Mara's pie the county prize". A text saying "the judges hand Mara the ribbon" tells it settled: yes. "The judges will announce the winner next week", or a recorded fact "the county result is still provisional", leaves it open: no. A stat "Rivalry with Jonah" set to "Close friends" beside a milestone where Jonah walks out on her contradicts it: no.

${SETTLED_DECISION_RULE}`;

const QUESTION = `${SETTLED_CHECK}: Does the turn tell every outcome it completes as settled, the way its milestones leave it, in every player's text and every fact it records, with no stat change contradicting a milestone it adds? Answer no if a text or a recorded fact calls a completed outcome open, provisional, undecided or still to be settled, or tells it as another of its possible resolutions, or if a stat change moves a stat to a level that tells another result than a milestone the turn adds. Answer yes otherwise.`;

const TOLD = ["settled as its milestones leave it", "open or provisional", "another resolution", "not told"] as const;
const FITS = ["fits the milestones", "contradicts a milestone", "no bearing on a milestone"] as const;

export function settledJudgeSchema() {
  return z.object({
    outcomes: z
      .array(
        z.object({
          outcomeId: z.string().describe("The completed outcome's id, as its heading reads."),
          told: z.enum(TOLD).describe("How the players' texts tell it: settled as its milestones leave it, open or provisional, as another of its resolutions, or not told."),
          quote: z.string().describe("The words that show it, quoted; empty when not told."),
        })
      )
      .max(6)
      .describe("Every completed outcome listed above, once each, in their order."),
    facts: z
      .array(z.object({ fact: z.string().describe("The recorded fact, quoted."), why: z.string().describe("A few words on how it calls a completed outcome open or tells it another way.") }))
      .max(8)
      .describe("Only the recorded facts that call a completed outcome open, provisional or undecided, or tell it another way; empty when none does."),
    stats: z
      .array(
        z.object({
          stat: z.string().describe("The stat's name."),
          fits: z.enum(FITS).describe("Whether the change fits the milestones this turn adds."),
          why: z.string().describe("A few words on why."),
        })
      )
      .max(8)
      .describe("Every stat change listed above, once each."),
    [SETTLED_CHECK]: z.object({
      evidence: z.string().describe("The words that decide the answer, quoted, or what is missing; one or two sentences."),
      answer: z.enum(["yes", "no"]).describe(`The answer to the question ${SETTLED_CHECK} above`),
    }),
  });
}

const resultLines = (resolutions: unknown) => Object.entries(asObject(resolutions)).map(([key, text]) => `    ${key}: ${asString(text)}`);

/** A player's text as they read it: paragraphs without image tags (recordedResultJudge.ts reads it too). */
export function paragraphsOf(reply: unknown, slot: string): string[] {
  const beat = asObject(asObject(reply)[slot]);
  return playerParagraphs(asString(beat.text))
    .map((p) => p.replace(IMAGE_TAG, " ").replace(/\s+/g, " ").trim())
    .filter((p) => /\p{L}/u.test(p));
}

/** A stat's value before this turn: shared, or the seat's own. */
function valueBefore(story: Story, group: string, statId: string): unknown {
  const state = story.getState();
  const entries = group === "shared" ? state.sharedStatValues : state.players[group as PlayerSlot]?.statValues;
  return entries?.find((v) => v.statId === statId)?.value;
}

const valueText = (value: unknown) => (value === undefined ? "not set" : Array.isArray(value) ? `[${value.join(", ")}]` : String(value));

/** Whose side an opposites stat's first half is, where the story plays contests on a scoreboard. */
function sideLine(story: Story, stat: Stat): string | undefined {
  if (stat.type !== "opposites" || !story.getSharedOutcomes().some(isContestedOutcome)) return undefined;
  const name = story.getPlayer("player1")?.name ?? "player1";
  return story.getNumberOfPlayers() >= 3 ? `  Its first side (side A) is player1's camp (${name}'s).` : `  Its first side (side A) is player1's (${name}).`;
}

function statBlock(story: Story, change: Loose): string {
  const group = asString(change.group);
  const id = asString(change.stat);
  const stat = story.getStatById(id);
  const what = `${asString(change.change)} ${valueText(change.value)}`;
  if (!stat) return `Stat ${id} (${group}): ${what}; before: ${valueText(valueBefore(story, group, id))}`;
  const owner = group === "shared" ? "shared" : `${story.getPlayer(group as PlayerSlot)?.name ?? group}'s`;
  const side = sideLine(story, stat);
  return [
    `Stat ${stat.name} (${owner}, ${stat.type}): ${what}; before: ${valueText(valueBefore(story, group, id))}`,
    ...(stat.possibleValues ? [`  Levels: ${stat.possibleValues}`] : []),
    ...(stat.narrativeImplications ?? []).map((line) => `  ${line}`),
    ...(side ? [side] : []),
  ].join("\n");
}

/** The facts the turn records (each player's, once each) and the new story elements' own (recordedResultJudge.ts reads them too). */
export function factLines(story: Story, reply: SetOfBeatGenerationSchema): string[] {
  const names = new Map(story.getStoryElements().map((e) => [e.id, e.name]));
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const slot of story.getPlayerSlots()) {
    const plan = asObject(asObject(asObject(reply)[slot]).plan);
    for (const element of asArray(plan.newGameElements).map(asObject)) {
      const e = asObject(element.element);
      if (asString(element.type) !== "newStoryElement") continue;
      names.set(asString(e.id), asString(e.name));
      for (const fact of asArray(e.facts).map(asString)) {
        if (fact && !seen.has(fact)) {
          seen.add(fact);
          lines.push(`- (${asString(e.name) || asString(e.id)}, new) ${fact}`);
        }
      }
    }
    for (const entry of asArray(plan.establishedFacts).map(asObject)) {
      const fact = asString(entry.fact);
      if (!fact || seen.has(fact)) continue;
      seen.add(fact);
      const id = asString(entry.storyElementId);
      lines.push(`- (${names.get(id) ?? id}) ${fact}`);
    }
  }
  return lines;
}

/**
 * The judge's request for one reply (as the game keeps it, after the beat
 * repairs) on its turn's story, or undefined where the turn completes no
 * outcome.
 */
export function settledJudgeRequest(story: Story, reply: SetOfBeatGenerationSchema): TextRequest | undefined {
  const completed = outcomesCompletedThisBeat(story);
  if (completed.length === 0) return undefined;
  const added = asArray(asObject(reply).newMilestones).map(asObject);
  const completedIds = new Set(completed.map((s) => s.id));
  const outcomes = completed.flatMap((state) => {
    const outcome = story.getOutcomeById(state.id);
    if (!outcome) return [];
    const recorded = outcome.milestones ?? [];
    const own = added.filter((m) => asString(m.outcome) === state.id).map((m) => asString(m.newMilestone)).filter(Boolean);
    const owner = state.owner === "shared" ? "shared" : `${story.getPlayer(state.owner as PlayerSlot)?.name ?? state.owner}'s own`;
    return [
      [
        `Outcome ${state.id} (${owner}): ${outcome.question}`,
        "  Possible resolutions:",
        ...resultLines(outcome.possibleResolutions),
        `  Milestones, complete after this turn (${state.milestones} of ${state.intended} milestones):`,
        ...recorded.map((m, i) => `    ${i + 1}. ${m}`),
        ...own.map((m, i) => `    ${recorded.length + i + 1}. ${m} (added by this turn)`),
      ].join("\n"),
    ];
  });
  const others = added
    .filter((m) => !completedIds.has(asString(m.outcome)))
    .map((m) => `- ${story.getOutcomeById(asString(m.outcome))?.question ?? asString(m.outcome)}: ${asString(m.newMilestone)}`);
  const stats = asArray(asObject(reply).statChanges).map((c) => statBlock(story, asObject(c)));
  const facts = factLines(story, reply);
  const slots = story.getPlayerSlots();
  const texts = slots.map((slot) => {
    const name = story.getPlayer(slot)?.name ?? slot;
    return [`${name}'s text (${slot}):`, ...paragraphsOf(reply, slot).map((p, i) => `[${i + 1}] ${p}`)].join("\n");
  });
  const names = slots.map((s) => story.getPlayer(s)?.name ?? s);
  const sections = [
    INTRO,
    ["======= THE STORY =======", `Title: ${story.getTitle()}`, `${names.length > 1 ? "The players' characters" : "The player's character"}: ${names.join(", ")}`].join("\n"),
    ["======= THE OUTCOMES THIS TURN COMPLETES =======", ...outcomes].join("\n\n"),
    ["======= OTHER MILESTONES THIS TURN ADDS =======", ...(others.length ? others : ["none"])].join("\n"),
    ["======= STAT CHANGES THIS TURN MAKES =======", ...(stats.length ? stats : ["none"])].join("\n"),
    ["======= FACTS THIS TURN RECORDS =======", ...(facts.length ? facts : ["none"])].join("\n"),
    ["======= THE TURN, AS EACH PLAYER READS IT =======", ...texts].join("\n\n"),
    ["======= QUESTION =======", QUESTION].join("\n"),
  ];
  return { prompt: sections.join("\n\n"), schema: settledJudgeSchema() };
}

/** The verdict: true when the judge answered yes, undefined where it answered neither. */
export function settledVerdictFrom(parsed: unknown): boolean | undefined {
  const answer = asObject(asObject(parsed)[SETTLED_CHECK]).answer;
  return answer === "yes" ? true : answer === "no" ? false : undefined;
}

/** The judge's evidence and its readings: each completed outcome, each fact that calls one open, each stat change. */
export function settledEvidenceFrom(parsed: unknown): { evidence?: string; lines: string[] } {
  const reply = asObject(parsed);
  const evidence = asString(asObject(reply[SETTLED_CHECK]).evidence);
  const lines = [
    ...asArray(reply.outcomes)
      .map(asObject)
      .map((o) => `${asString(o.outcomeId)}: ${asString(o.told)}${asString(o.quote) ? ` ("${asString(o.quote)}")` : ""}`),
    ...asArray(reply.facts)
      .map(asObject)
      .map((f) => `fact "${asString(f.fact)}": ${asString(f.why)}`),
    ...asArray(reply.stats)
      .map(asObject)
      .map((s) => `stat ${asString(s.stat)}: ${asString(s.fits)} (${asString(s.why)})`),
  ];
  return { ...(evidence ? { evidence } : {}), lines };
}

export const settledJudgeCaseId = (key: string, version = SETTLED_JUDGE_PROMPT_VERSION) => `judge-settled-v${version}-${key}`;

/** Luna low reads one turn (every player's text) and writes a line per outcome, fact and stat: about 600-1,000 tokens, reasoning included */
const SETTLED_JUDGE_OUTPUT_TOKENS = 900;

export type SettledTarget = { key: string; request: TextRequest; samples: number };

/** The judge calls: each target at its number of samples (the calibration's two, the rest one). */
export function settledJudgeJobs(targets: SettledTarget[], arm: Arm, promptState: string, stage: Stage): Job[] {
  return targets.flatMap((target) =>
    Array.from({ length: target.samples }, (_, i) =>
      prepJob({
        kind: "judge",
        stage,
        promptState,
        caseId: settledJudgeCaseId(target.key),
        sample: i + 1,
        arm,
        role: "beat",
        players: 1,
        build: () => target.request,
        outputTokens: SETTLED_JUDGE_OUTPUT_TOKENS,
      })
    )
  );
}

// ---------------------------------------------------------------- calibration

/**
 * A hand-read turn: a stored playthrough turn (replayed), or a reply of the
 * stage's own run by its output id. A constructed failing version (the stage
 * judge's precedent) is a stored turn with edits on its reply: each passage,
 * which must occur, replaced wherever it occurs.
 */
export type SettledCalibrationItem = { id: string; hand: HandVerdict; note: string } & ({ story: string; turn: number; edits?: [string, string][] } | { output: string });

/**
 * Switch turns that complete an outcome, read by hand on the check's criterion
 * before any judge call: yes when every player's text and every recorded fact
 * tell each completed outcome as settled, as its milestones leave it, and no
 * stat change contradicts a milestone; no when one calls a completed outcome
 * open or provisional or tells it another way, or a stat change contradicts a
 * milestone; partial where a reader could go either way (left out of
 * agreement). Read on 2026-09-30: the second round's stored turns
 * (production's of 30 September), the stage's own replies (production and the
 * variant, both samples, by output id) and two constructed failing versions of
 * stored turns (a completed contract told as provisional; a standing's stat
 * cut beside the milestone that keeps it).
 */
const CONTRACT_OPEN: [string, string][] = [
  ["“The Grand Circuit contract, including the equipment grant, goes to Jo.”", "“The Grand Circuit contract, including the equipment grant, stays provisional until the licensing review decides it.”"],
  ["“The Grand Circuit contract and equipment grant are awarded to Jo.”", "“The contract and the equipment grant will be decided after the licensing review.”"],
  ["At the Slipharbor final tasting, the judges award Jo the full Grand Circuit route contract and its equipment grant.", "At the Slipharbor final tasting, the judges leave the Grand Circuit contract provisional pending a licensing review."],
];
const STANDING_CUT: [string, string][] = [['"change":"addNumber","value":10', '"change":"subtractNumber","value":30']];

export const SETTLED_CALIBRATION: SettledCalibrationItem[] = [
  // --- Hand yes ---
  { id: "stored-lemonade-t4", story: "play-lemonade", turn: 4, hand: true, note: "The stand's finances settled: the reserve is real, the sleeve cost counted; the margin and the new ledger skill fit" },
  { id: "stored-food-trucks-t20", story: "play-food-trucks", turn: 20, hand: true, note: "The contract awarded to Jo in both texts ('The route award stands'); the scoreboard set to 35|65, toward Jo's side" },
  { id: "stored-estate-agents-t19", story: "play-estate-agents", turn: 19, hand: true, note: "Rory's standing settled: 'Rory's place on it is no longer under review'; credibility +10 fits" },
  { id: "stored-estate-agents-t15", story: "play-estate-agents", turn: 15, hand: true, note: "The sale's mixed result told as it is ('I'll make a conditional offer through them. I haven't chosen an agent'); Rory's principle told as the hook he used; the principle set to Pragmatic" },
  { id: "stored-food-trucks-t16", story: "play-food-trucks", turn: 16, hand: true, note: "Tavi's refusal settled ('Tavi does not withdraw their refusal to endorse you'); 'the unresolved plan' and the open rush coverage are other matters, the crew's outcome still 1 of 2" },
  { id: "stored-lemonade-t8", story: "play-lemonade", turn: 8, hand: true, note: "The shared fair stall registered and paid, one coin each, costs kept apart; the cashbox -1 fits" },
  { id: "stored-avalon-t8", story: "play-avalon", turn: 8, hand: true, note: "Tavi's promise kept ('You kept your word'); the city's broader repair is another outcome, told as still ahead" },
  { id: "run-space-pirates-t14-variant-s1", output: "2d5f48af2e7c842a85d3", hand: true, note: "The variant: 'The Cache arrangement is settled', 'no longer provisional', the fact 'The crew settles the Cache's extraordinary-share arrangement in Bex's camp's favor'; the ship told as its milestone leaves it" },
  { id: "run-space-pirates-t14-production-s2", output: "28e415a1184697eca37a", hand: true, note: "Production: 'That settlement', 'settled line now', the claim 'entered as standing', Pip's proposal 'not the accepted arrangement'; the milestone's 'recognition of' but nothing told open" },
  { id: "run-avalon-t23-variant-s1", output: "e91b8bcb1f3c82fbb471", hand: true, note: "The variant: 'the Compact's decision settles how the city will live with the missing Heart: its care is shared openly'; facts of shared oversight" },
  { id: "run-food-trucks-t20-production-s1", output: "c1d4b03e00af574b2a26", hand: true, note: "Production: 'The Grand Circuit contract goes to Jo' in both texts and a fact; the scoreboard to 35|65, Jo's side" },
  // --- Hand no ---
  { id: "stored-space-pirates-t14", story: "play-space-pirates", turn: 14, hand: false, note: "The complete claim told 'open and unsettled' and 'visible but unresolved', and the fact 'The crew's provisional galley record ... does not settle Pip's repair-reserve proposal'" },
  { id: "stored-avalon-t16", story: "play-avalon", turn: 16, hand: false, note: "The parting milestone (they part on good terms, each following a different idea) beside Orin's relationship set to Deeply Trusted, whose line is the first resolution's sealed record" },
  { id: "run-space-pirates-t14-production-s1", output: "258b71c0ef4e61042600", hand: false, note: "Production: its milestone and a fact say 'the repair-reserve proposal remains unresolved'; texts 'The reserve question can wait', 'Pip's reserve proposal is still open'" },
  { id: "run-avalon-t23-production-s1", output: "9a8aef1b683e732e7243", hand: false, note: "Production: the Heart complete, but the facts 'leaves the bypass's oversight arrangements unsettled' and 'it does not establish who will oversee the bypass or how long it will remain in use'" },
  { id: "constructed-food-trucks-t20-open", story: "play-food-trucks", turn: 20, edits: CONTRACT_OPEN, hand: false, note: "Constructed from the stored turn: the completed contract told as 'provisional until the licensing review' in both texts and the fact" },
  { id: "constructed-estate-agents-t19-stat", story: "play-estate-agents", turn: 19, edits: STANDING_CUT, hand: false, note: "Constructed from the stored turn: Rory's credibility cut by 30 beside the milestone that colleagues recognize his judgment as dependable" },
  // --- Partial, left out of agreement ---
  { id: "stored-avalon-t23", story: "play-avalon", turn: 23, hand: "partial", note: "The Heart's complete outcome told as 'a first shared step toward living with the missing Heart', its milestone's own 'beginning a shared plan'; neither open nor a resolution named" },
  { id: "stored-kids-mouse-t5", story: "play-kids-mouse", turn: 5, hand: "partial", note: "One short paragraph (the retry, used as it came): the bedding 'begins to gather on the gardenward side', the watch at the kitchen door not told" },
  { id: "run-avalon-t16-variant-s2", output: "f769fca2af0384923391", hand: "partial", note: "The variant set Orin's relationship to Wary beside 'they part on good terms' and 'We are still dear to one another': a step down that fits the parting, or distrust the milestone doesn't say" },
  { id: "run-estate-agents-t15-production-s2", output: "609eb83f7196bed5cc0f", hand: "partial", note: "Production: the sale's mixed result ('neither agent has been selected') but 'nobody's got the sale yet' and 'the commission remains undecided'; the mixed resolution itself leaves the commission unresolved" },
  { id: "run-avalon-t23-production-s2", output: "b1dd6e96f611f2500113", hand: "partial", note: "Production: the authorization told as 'a real change in the city's course', but 'the first monitoring plan still needs an agreed oversight crew'" },
];

export type SettledAgreement = {
  check: typeof SETTLED_CHECK;
  decided: number;
  agree: number;
  falseFails: number;
  falsePasses: number;
  handPasses: number;
  handFails: number;
  pairs: number;
  pairsAgree: number;
  partial: { yes: number; no: number };
  reliable: boolean;
};

/** Agreement with the hand verdicts (sample 1), the samples' agreement, and the answers on partial items. */
export function scoreSettledCalibration(items: { id: string; hand: HandVerdict }[], judged: { itemId: string; samples: (boolean | undefined)[] }[]): SettledAgreement {
  const byItem = new Map(judged.map((j) => [j.itemId, j]));
  const a: SettledAgreement = { check: SETTLED_CHECK, decided: 0, agree: 0, falseFails: 0, falsePasses: 0, handPasses: 0, handFails: 0, pairs: 0, pairsAgree: 0, partial: { yes: 0, no: 0 }, reliable: false };
  for (const item of items) {
    const [first, second] = byItem.get(item.id)?.samples ?? [];
    if (first === undefined) continue;
    if (second !== undefined) {
      a.pairs++;
      if (second === first) a.pairsAgree++;
    }
    if (item.hand === "partial") {
      a.partial[first ? "yes" : "no"]++;
      continue;
    }
    a.decided++;
    if (item.hand) a.handPasses++;
    else a.handFails++;
    if (first === item.hand) a.agree++;
    else if (item.hand) a.falseFails++;
    else a.falsePasses++;
  }
  return { ...a, reliable: isReliable(a) };
}

// ---------------------------------------------------------------- the report

type Tally = { hits: number; n: number };
const pct = (n: number, d: number) => (d === 0 ? "–" : `${Math.round((100 * n) / d)}%`);
const tallyText = (t?: Tally) => (t ? `${t.hits} of ${t.n} (${pct(t.hits, t.n)})` : "–");
const pText = (p?: number) => (p === undefined ? "" : p < 0.001 ? " (p < 0.001)" : ` (p ${p.toFixed(3)})`);
const verdictText = (v: HandVerdict | boolean | undefined) => (v === undefined ? "–" : v === "partial" ? "partial" : v ? "yes" : "no");

function readingText(c: StageComparison): string {
  if (c.noise === undefined) return "no noise figure (the reference has one sample)";
  if (c.moved) return `moved ${c.moved}${pText(c.p)}`;
  if (c.beyondNoise) return `beyond the noise, not moved${pText(c.p)}`;
  return "within the noise";
}

function calibrationReading(a: SettledAgreement): string {
  if (a.reliable) return "reliable";
  const few = [a.handPasses < 3 ? "yes" : "", a.handFails < 3 ? "no" : ""].filter(Boolean);
  return few.length ? `not reliable (too few hand ${few.join(" and ")})` : "not reliable";
}

export type SettledFailure = { check: string; armKey: string; caseId: string; sample: number; outputId: string; slot?: string; evidence: string };

export type SettledCheckReport = {
  title: string;
  how: string;
  calibration?: SettledAgreement;
  items?: { id: string; hand: HandVerdict; note: string }[];
  judged?: { itemId: string; samples: (boolean | undefined)[]; evidence: { evidence?: string; lines: string[] }[] }[];
  calibrationNote?: string;
  readings: StageArmReading[];
  failures: SettledFailure[];
};

/** judged-settled.md: per check, the calibration, each arm's rate and the variant against production, the items, and the failures. */
export function renderSettledJudge(input: { checks: SettledCheckReport[]; spentUsd: number; generatedAt: Date; problems: string[] }): string {
  const lines = [
    "# Judged checks: the turn that completes an outcome, and the ending",
    "",
    `Generated ${input.generatedAt.toISOString()} from prep-calls.jsonl (outcomeSettledJudge.ts, prompt v${SETTLED_JUDGE_PROMPT_VERSION}; endingJudge.ts). A check is reliable when sample 1 agrees on at least 85% of the hand yes and of the hand no, each side holding at least 3, and two samples agree on at least 90%. A candidate reads against its reference on the (case, sample) pairs both have, with the reference's sample-1-against-sample-2 difference as the noise and the stop rule on top. Spent on these judge calls: $${input.spentUsd.toFixed(4)}.`,
  ];
  for (const report of input.checks) {
    lines.push("", `## ${report.title}`, "", `How: ${report.how}`, "");
    const c = report.calibration;
    if (c) {
      lines.push(
        "| Agree (sample 1) | Hand yes / no | Judged no where the hand says yes | Judged yes where the hand says no | Samples agree | On partial items (yes / no) | Reading |",
        "|---|---|---|---|---|---|---|",
        `| ${c.agree} of ${c.decided} (${pct(c.agree, c.decided)}) | ${c.handPasses} / ${c.handFails} | ${c.falseFails} | ${c.falsePasses} | ${c.pairs ? `${c.pairsAgree} of ${c.pairs}` : "–"} | ${c.partial.yes} / ${c.partial.no} | ${calibrationReading(c)} |`,
        ""
      );
    }
    if (report.calibrationNote) lines.push(report.calibrationNote, "");
    lines.push(
      "| Arm | Passing | Against | Arm on the shared pairs | Reference on them | Noise | Reading |",
      "|---|---|---|---|---|---|---|",
      ...report.readings.map((r) =>
        r.vsReference && r.referenceKey
          ? `| ${r.armKey} | ${tallyText(r.plans)} | ${r.referenceKey} | ${tallyText(r.vsReference.arm)} | ${tallyText(r.vsReference.reference)} | ${r.vsReference.noise === undefined ? "–" : `${Math.round(100 * r.vsReference.noise)} pts`} | ${readingText(r.vsReference)} |`
          : `| ${r.armKey} | ${tallyText(r.plans)} | – | – | – | – | – |`
      )
    );
    if (report.items?.length) {
      lines.push("", "| Item | Hand | Judged (samples) | Hand reading |", "|---|---|---|---|");
      for (const item of report.items) {
        const judged = report.judged?.find((j) => j.itemId === item.id);
        lines.push(`| ${item.id} | ${verdictText(item.hand)} | ${judged?.samples.map(verdictText).join("/") || "–"} | ${item.note} |`);
      }
      const disagreements = report.items.flatMap((item) => {
        const judged = report.judged?.find((j) => j.itemId === item.id);
        const first = judged?.samples[0];
        if (item.hand === "partial" || first === undefined || first === item.hand) return [];
        const said = judged?.evidence[0];
        return [`- ${item.id}: hand ${verdictText(item.hand)}, judged ${verdictText(first)}. ${(said?.lines ?? []).join("; ")}. Evidence: ${(said?.evidence ?? "").replace(/\s+/g, " ").trim()}`];
      });
      if (disagreements.length) lines.push("", "Where sample 1 disagrees with the hand:", "", ...disagreements);
    }
    if (report.failures.length) {
      lines.push("", "Judged failures of the arms:", "", ...report.failures.map((f) => `- ${f.armKey} ${f.caseId} s${f.sample}${f.slot ? ` ${f.slot}` : ""} (${f.outputId}): ${f.evidence.replace(/\s+/g, " ").trim()}`));
    }
  }
  if (input.problems.length) lines.push("", "## Problems", "", ...input.problems.map((p) => `- ${p}`));
  return `${lines.join("\n")}\n`;
}
