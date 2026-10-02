import type { Outcome, Stat, StatValueEntry, StoryState, Switch, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { playerParagraphs } from "./playerText.js";
import {
  chargedAgainLine,
  chargedOnOfferLine,
  choiceLine,
  countedLine,
  fixesLine,
  kidsLine,
  kidsWho,
  ownStatsLine,
  ownersRollLine,
  pacingLine,
  placesLine,
  readStory,
  resentLine,
  resultWordsLine,
  scoreboardLine,
  undoneLine,
  type ChapterReading,
  type GroupStepReading,
  type StoryReadings,
} from "./playthroughChecks.js";
import type { PlayPick, PlayRun, PlayTurn } from "./playthroughs.js";
import { contextLinesHtml, escapeHtml } from "./ratingHtml.js";

/** Each round's hand-read report, in the output folder (the pages point to it). */
export const PLAYTHROUGH_REPORTS: Record<number, string> = {
  1: "2026-09-30_playthroughs-report.md",
  2: "2026-09-30_playthroughs-2-report.md",
  3: "2026-10-01_playthroughs-3-report.md",
  4: "2026-10-02_playthroughs-4-report.md",
};

const reportOf = (round: number | undefined) => `DOCS/2026-09-26_gpt6-text-eval/${PLAYTHROUGH_REPORTS[round ?? 1] ?? PLAYTHROUGH_REPORTS[1]}`;

/*
 * Each played story (playthroughs.ts) as a page for the owner: offline HTML,
 * one file per story and an index, in the output folder's stories/ (not
 * committed). A page shows the setup (the characters chosen, the outcomes,
 * the stats, the world and its rules), then every turn in order: chapter
 * headers with their question, the outcome and stage they settle, their steps
 * and results; the switches with their directions; each player's turn as they
 * read it, the options with their mechanics as the game plays them (the same
 * lines as the rating pages', ratingMechanics.ts), the option the player
 * chose and why, its roll, and what the turn changes; each chapter's result
 * and milestone; the ending with each outcome as its milestones leave it; the
 * stats over the story; and the code's readings (playthroughChecks.ts). Since
 * round 2 a page also says where production sent a failed turn again (the
 * queue's resend, the player's Try again) and shows the judged options and
 * results checks. Since round 3 a page also flags a group step on a player's
 * own outcome that went another way than the owner's roll, shows under each
 * turn of a story read with a child how it reads against the band's limits,
 * and lists the pacing among the readings. Since round 4 a group chapter turn
 * shows the judged places check (round 3's too, once judged for the
 * comparison), and the readings follow money and counted stats. Every story
 * string goes through escapeHtml. No rating page: one version, no blinding.
 */

const e = escapeHtml;

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const usd = (value: number) => `$${value.toFixed(4)}`;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** A story's page file: its id, and the sample where it is not the first. */
export function storyFileName(run: Pick<PlayRun, "spec" | "sample">): string {
  return run.sample === 1 ? `${run.spec.id}.html` : `${run.spec.id}-s${run.sample}.html`;
}

const STYLE = `
:root { --bg: #f8f6f1; --fg: #1f1d1a; --muted: #6a655c; --line: #dfd9cd; --card: #ffffff; --accent: #2d5b87; --chosen: #edf4e8; --chosen-line: #5f8f4b; --warn: #94481b; --warn-bg: #fbece2; --chapter: #eef2f7; }
@media (prefers-color-scheme: dark) { :root { --bg: #141311; --fg: #ebe7df; --muted: #a29c91; --line: #34312b; --card: #1c1a17; --accent: #8fb6dd; --chosen: #1d2a19; --chosen-line: #7fae6a; --warn: #e6a176; --warn-bg: #33231a; --chapter: #1b2129; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 28px; line-height: 1.2; margin: 4px 0 8px; }
h2 { font-size: 20px; margin: 40px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 17px; margin: 0 0 6px; }
h4 { font-size: 15px; margin: 12px 0 6px; }
a { color: var(--accent); }
.kicker { text-transform: uppercase; letter-spacing: .06em; font-size: 12px; color: var(--muted); margin: 0; }
.lede { color: var(--muted); white-space: pre-wrap; }
.muted, .meta { color: var(--muted); font-size: 13px; }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 12px 0; font-size: 14px; }
dl.facts dt { color: var(--muted); }
dl.facts dd { margin: 0; }
nav a { margin-right: 12px; font-size: 14px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 12px 0; }
.chapter { background: var(--chapter); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin: 28px 0 12px; }
.switch { border-left: 3px solid var(--accent); padding: 8px 12px; margin: 20px 0 8px; background: var(--card); border-radius: 0 8px 8px 0; }
.turn { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; margin: 12px 0; }
.turn > header { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-bottom: 6px; }
.turn-no { font-weight: 700; }
.kind { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--accent); }
.prose p { font-family: Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.6; margin: 0 0 10px; }
ol.options { padding-left: 22px; margin: 8px 0; }
li.option { margin: 6px 0; padding: 6px 8px; border-radius: 6px; }
li.option.chosen { background: var(--chosen); border-left: 3px solid var(--chosen-line); }
li.option p { margin: 0; }
.pick { font-size: 13px; margin-top: 4px !important; }
ul.ctx-lines { margin: 4px 0 0; padding-left: 18px; font-size: 13px; color: var(--muted); }
ul.ctx-lines .k { color: var(--fg); }
.changes { border-top: 1px dashed var(--line); margin-top: 10px; padding-top: 6px; }
.changes h5 { margin: 0; font-size: 13px; }
.flag { background: var(--warn-bg); color: var(--warn); border-radius: 6px; padding: 4px 8px; font-size: 13px; margin: 6px 0; }
.result { background: var(--chosen); border-radius: 6px; padding: 8px 10px; margin: 8px 0 20px; font-size: 14px; }
table { border-collapse: collapse; width: 100%; font-size: 13px; margin: 8px 0; }
th, td { border: 1px solid var(--line); padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: var(--card); }
details summary { cursor: pointer; color: var(--muted); font-size: 13px; }
.picture { color: var(--muted); font-style: italic; }
.scroll { overflow-x: auto; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/** A story text's paragraphs as the player reads them, an image tag shown as a muted note. */
function prose(text: string): string {
  const paragraphs = playerParagraphs(text).map((paragraph) =>
    paragraph
      .split(/(\[image[^\]]*\])/g)
      .map((part) => (/^\[image/.test(part) ? `<span class="picture">${e(part)}</span>` : e(part)))
      .join("")
  );
  return `<div class="prose">${paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>`;
}

const nameOf = (state: StoryState | undefined, slot: string) => state?.players[slot]?.name || slot;

/** Every outcome by id: the shared ones, then each player's. */
function outcomesById(state: StoryState | undefined): Map<string, { outcome: Outcome; owner: string }> {
  const map = new Map<string, { outcome: Outcome; owner: string }>();
  for (const outcome of state?.sharedOutcomes ?? []) map.set(outcome.id, { outcome, owner: "shared" });
  for (const [slot, player] of Object.entries(state?.players ?? {})) for (const outcome of player.outcomes ?? []) if (!map.has(outcome.id)) map.set(outcome.id, { outcome, owner: slot });
  return map;
}

function valueShown(stat: Stat | undefined, value: unknown): string {
  if (value === undefined) return "–";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(empty)";
  if (typeof value === "number" && stat?.type === "percentage") return `${value}%`;
  if (typeof value === "number" && stat?.type === "opposites") return `${value}|${100 - value}`;
  return String(value);
}

// ---------------------------------------------------------------- the setup

function setupSection(run: PlayRun): string {
  const start = run.start;
  if (!start) return `<section id="setup"><h2>Setup</h2><p class="flag">The story never started: ${e(run.stopped)}</p></section>`;
  const guidelines = asObject(start.guidelines);
  const characters = Object.entries(start.players)
    .map(([slot, player]) => {
      const options = start.characterSelectionOptions[slot];
      const background = options?.possibleCharacterBackgrounds?.[player.backgroundChoice];
      return `<div class="card"><h4>${e(slot)}: ${e(player.name)}</h4><p class="meta">${e(background?.title ?? "")}${player.appearance ? ` · ${e(player.appearance)}` : ""}</p><p>${e(player.fluff ?? "")}</p><p class="muted">The other choices offered: ${e(
        (options?.possibleCharacterIdentities ?? [])
          .map((i) => i.name)
          .filter((n) => n !== player.name)
          .join(", ")
      )}; backgrounds ${e((options?.possibleCharacterBackgrounds ?? []).map((b) => b.title).join(", "))}</p></div>`;
    })
    .join("");
  const outcomeRows = [...outcomesById(start).values()]
    .map(({ outcome, owner }) => {
      const resolutions = Object.entries(asObject(outcome.possibleResolutions))
        .map(([key, text]) => `<li><span class="k">${e(key)}:</span> ${e(asString(text))}</li>`)
        .join("");
      return `<tr><td>${e(outcome.question)}<br><code class="muted">${e(outcome.id)}</code></td><td>${e(owner === "shared" ? "shared" : nameOf(start, owner))}</td><td>${outcome.intendedNumberOfMilestones}</td><td><ul class="ctx-lines">${resolutions}</ul></td></tr>`;
    })
    .join("");
  const stats = [...start.sharedStats.map((s) => ({ s, shared: true })), ...start.playerStats.map((s) => ({ s, shared: false }))]
    .map(({ s, shared }) => {
      const starts = shared
        ? valueShown(s, start.sharedStatValues.find((v) => v.statId === s.id)?.value)
        : Object.entries(start.players)
            .map(([slot, p]) => `${nameOf(start, slot)} ${valueShown(s, p.statValues.find((v) => v.statId === s.id)?.value)}`)
            .join("; ");
      const levers = [s.optionsToSacrifice && !/^none\b/i.test(s.optionsToSacrifice) ? `sacrifice: ${s.optionsToSacrifice}` : "", s.optionsToGainAsReward && !/^none\b/i.test(s.optionsToGainAsReward) ? `reward: ${s.optionsToGainAsReward}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<tr><td>${e(s.name)}${s.isVisible === false ? " <span class=\"muted\">(hidden)</span>" : ""}</td><td>${shared ? "shared" : "each player"}, ${e(s.type)}</td><td>${e(starts)}</td><td>${e(s.tooltip ?? "")}${levers ? `<br><span class="muted">${e(levers)}</span>` : ""}</td></tr>`;
    })
    .join("");
  const listOf = (items: unknown) => `<ul>${asArray(items).map((i) => `<li>${e(asString(i))}</li>`).join("")}</ul>`;
  return `<section id="setup">
<h2>Setup</h2>
<p class="muted">The setup production wrote for this premise (custom-story setup), and the characters the player picked.</p>
<h3>The characters</h3>${characters}
<h3>Outcomes</h3><div class="scroll"><table><tr><th>Question</th><th>Whose</th><th>Milestones</th><th>How it can end</th></tr>${outcomeRows}</table></div>
<h3>Stats</h3><div class="scroll"><table><tr><th>Stat</th><th>Kind</th><th>At the start</th><th>What it is</th></tr>${stats}</table></div>
<details><summary>The world, its rules and the chapter rules</summary>
<p>${e(asString(guidelines.world))}</p>
<h4>Rules</h4>${listOf(guidelines.rules)}
<h4>Tone</h4>${listOf(guidelines.tone)}
<h4>Conflicts</h4>${listOf(guidelines.conflicts)}
<h4>Story elements</h4><ul>${start.storyElements.map((el) => `<li><strong>${e(el.name)}</strong>: ${e(el.role)}</li>`).join("")}</ul>
<h4>Chapter types (for the planners)</h4>${listOf(guidelines.typesOfThreads)}
<h4>Switch rules (for the planners)</h4>${listOf(guidelines.switchAndThreadInstructions)}
<p class="muted">Difficulty: ${e(start.difficultyLevel?.title ?? "")} (${signed(start.difficultyLevel?.modifier ?? 0)})</p>
</details>
</section>`;
}

// ---------------------------------------------------------------- the story

function switchBlock(run: PlayRun, turn: PlayTurn, readings: StoryReadings): string {
  const plan = turn.plan;
  if (!plan || plan.kind !== "switch plan") return "";
  const outcomes = outcomesById(run.start);
  const switches = asArray<Switch>(asObject(plan.plan as SwitchAnalysis | undefined).switches);
  const pacing = readings.latePacing.find((p) => p.turn === turn.turn);
  const body = switches
    .map((sw) => {
      const who = asArray<string>(sw.players).map((slot) => nameOf(run.start, slot)).join(", ");
      if (sw.type === "flavor") {
        const outcome = outcomes.get(sw.outcomeId)?.outcome;
        return `<p><strong>${e(sw.title)}</strong> <span class="muted">(${e(who)}: one question on ${e(outcome?.question ?? sw.outcomeId)})</span><br>${e(sw.question)}</p>`;
      }
      return `<p><strong>${e(sw.title)}</strong> <span class="muted">(${e(who)}: a choice of directions)</span></p><ul>${asArray<string>(sw.topicChoices).map((d) => `<li>${e(d)}</li>`).join("")}</ul>`;
    })
    .join("");
  const told = pacing?.toldFit !== undefined ? ` (production told the planner ${pacing.toldFit})` : "";
  const binding = pacing
    ? ` · ${pacing.threadsFit} more ${pacing.threadsFit === 1 ? "chapter fits" : "chapters fit"}${told}, ${pacing.stillNeeded} milestone${pacing.stillNeeded === 1 ? "" : "s"} still needed${pacing.binding ? ": the late pacing binds" : ""}`
    : "";
  const retried = plan.calls.length > 1 ? `<p class="flag">The plan was asked for again: ${e(plan.calls[0].problem ?? plan.calls[0].lengthProblem ?? "")}</p>` : "";
  const failed = plan.failure ? `<p class="flag">The switch plan failed: ${e(plan.failure)}</p>` : "";
  const stuck = stuckLines(plan)
    .map((line) => `<p class="flag">${e(line)}</p>`)
    .join("");
  return `<div class="switch"><p class="kicker">The switch${e(binding)}</p>${body}${stuck}${retried}${failed}</div>`;
}

/** A plan production could not get past: each failed round's problems, and what the harness did. */
function stuckLines(plan: NonNullable<PlayTurn["plan"]>, repicks: PlayTurn["repicks"] = [], names: (slot: string) => string = (slot) => slot): string[] {
  const rounds = plan.failedRounds ?? [];
  if (rounds.length === 0) return [];
  const problems = [...new Set(rounds.flatMap((r) => r.calls.map((c) => c.problem).filter((p): p is string => Boolean(p))))];
  const repicked = repicks.length
    ? [
        `Asking again didn't help: the players' switch picks can't make one chapter. So the harness, not production, changed the pick${repicks.length === 1 ? "" : "s"}: ${repicks
          .map((r) => `${names(r.slot)} now takes direction ${r.to + 1} ("${r.text}") instead of direction ${r.from + 1}, the shared outcome another player picked`)
          .join("; ")}. Then production's planner ran once more.`,
      ]
    : [];
  return [
    `Production could not get past this turn: its ${plan.kind} could not be used twice, which fails the turn ("Unable to continue the story"), and nothing sends it again, so the players would be left waiting here. To read on, the harness asked production's planner again (${rounds.length} failed round${rounds.length === 1 ? "" : "s"} of its call and retry in all).`,
    ...problems.map((p) => `The plan check: ${p}`),
    ...repicked,
  ];
}

/** What production's plan check changed in the plan it used: players moved out of a second thread, threads dropped, a one-sided contest made a challenge. */
function planRepairLines(plan: NonNullable<PlayTurn["plan"]>, names: (slot: string) => string): string[] {
  const repairs = plan.calls.at(-1)?.repairs ?? [];
  const lines = repairs.flatMap((repair) => {
    const [kind, ...rest] = repair.replace(/^note /, "").split(": ");
    if (kind === "threadPlayerRepeated" && rest.length === 2) return [`${names(rest[1])} was also written into “${rest[0]}” and was taken out of it`];
    if (kind === "threadDropped") return [`“${rest.join(": ")}” was dropped, left without players`];
    if (kind === "contestOneSided") return [`“${rest.join(": ")}” had one side's players only and became their challenge`];
    return [];
  });
  return lines.length ? [`Production's plan check changed the plan: ${lines.join("; ")}.`] : [];
}

function chapterBlock(run: PlayRun, turn: PlayTurn, chapter: ChapterReading | undefined, readings: StoryReadings): string {
  const plan = turn.plan;
  if (!plan || plan.kind !== "chapter plan") return "";
  const outcomes = outcomesById(run.start);
  const threads = asArray<ThreadAnalysis["threads"][number]>(asObject(plan.plan as ThreadAnalysis | undefined).threads);
  // The lengths the plan's PACING printed and its check read: production's paced ones where the run recorded them (since
  // 2026-10-01; the .md's chapter table reads the same), else the allowed ones
  const lengths = plan.pacing.pacedLengths ?? plan.pacing.allowedLengths ?? [];
  const head = `<p class="kicker">Chapter ${chapter?.index ?? "?"} · turns ${chapter ? `${chapter.firstTurn}-${chapter.lastTurn}` : turn.turn} · ${asObject(plan.plan).duration ?? "?"} turns${lengths.length ? ` (allowed: ${lengths.join(", ")})` : ""}${plan.pacing.lastChapter ? " · the story's last chapter" : ""}</p>`;
  const body = threads
    .map((thread, i) => {
      const reading = chapter?.threads[i];
      const outcome = outcomes.get(thread.outcomeId)?.outcome;
      const framed = thread as typeof thread & { question?: unknown };
      const question = asString(framed.question) || thread.typeOfMilestone;
      const who = [...thread.playersSideA.map((s) => nameOf(run.start, s)), ...(thread.playersSideB.length ? ["against", ...thread.playersSideB.map((s) => nameOf(run.start, s))] : [])].join(" ");
      const stage = reading?.aftermath ? "its outcome is complete: an aftermath" : reading?.stage !== undefined ? `stage ${reading.stage} of ${reading.of}${reading.lastStage ? ", the last" : ""}` : "";
      const steps = thread.progression
        .map(
          (step) =>
            `<li><strong>${e(step.title)}</strong>: ${e(step.question)}<ul class="ctx-lines">${Object.entries(asObject(step.possibleResolutions))
              .map(([key, text]) => `<li><span class="k">${e(key)}:</span> ${e(asString(text))}</li>`)
              .join("")}</ul></li>`
        )
        .join("");
      const milestones = Object.entries(asObject(thread.possibleMilestones))
        .map(([key, text]) => `<li><span class="k">${e(key)}:</span> ${e(asString(text))}</li>`)
        .join("");
      const judged = reading?.judge ? `<p class="${reading.judge.verdict === false ? "flag" : "muted"}">Judged, stays within its stage: ${reading.judge.verdict === undefined ? "no answer" : reading.judge.verdict ? "yes" : "no"}${reading.judge.evidence ? ` (${e(reading.judge.evidence)})` : ""}</p>` : "";
      return `<h3>Chapter ${chapter?.index ?? "?"}: ${e(thread.title)}</h3>
<p><strong>${e(question)}</strong></p>
<p class="meta">${e(who)} · pushes “${e(outcome?.question ?? thread.outcomeId)}”${stage ? `, ${e(stage)}` : ""} · ${e(thread.typeOfThread)}</p>
<details open><summary>The planned steps and results</summary><ol>${steps}</ol><p class="muted">Possible milestones</p><ul class="ctx-lines">${milestones}</ul></details>${judged}`;
    })
    .join("");
  const names = (slot: string) => nameOf(run.start, slot);
  const lostPicks = readings.switchPicks
    .filter((p) => p.turn === turn.turn && !p.kept)
    .map((p) => {
      const picked = outcomes.get(p.pickedOutcome ?? "")?.outcome.question ?? p.pickedOutcome;
      const placed = outcomes.get(p.placedOn ?? "")?.outcome.question ?? p.placedOn;
      return `${names(p.slot)}'s switch pick is not followed: the pick was about “${picked}”, and the plan puts ${names(p.slot)} in “${p.thread ?? "no thread"}”, about “${placed}”${p.repickedTo !== undefined ? " (after the harness re-picked it)" : ""}.`;
    });
  const flags = [
    ...stuckLines(plan, turn.repicks, names),
    ...(chapter && !chapter.lengthAllowed ? [`Its length is not one PACING allows (${chapter.duration} turns; allowed ${lengths.join(", ")}).`] : []),
    ...(plan.calls.length > 1 ? [`The plan was asked for again: ${plan.calls[0].problem ?? plan.calls[0].lengthProblem ?? ""}`] : []),
    ...planRepairLines(plan, names),
    ...lostPicks,
    ...(plan.failure ? [`The chapter plan failed: ${plan.failure}`] : []),
  ];
  const results = readings.choices.results.find((c) => c.turn === turn.turn);
  const judged = results
    ? `<p class="${results.verdict === false ? "flag" : "muted"}">Judged, the results fit the chapter's kind: ${results.verdict === undefined ? "no answer" : results.verdict ? "yes" : "no"}${results.evidence ? ` (${e(results.evidence)})` : ""}</p>`
    : "";
  return `<section class="chapter">${head}${body}${judged}${flags.map((f) => `<p class="flag">${e(f)}</p>`).join("")}</section>`;
}

function chapterResult(run: PlayRun, chapter: ChapterReading): string {
  const parts = chapter.threads.map((t) => {
    const who = [...t.sideA, ...t.sideB].map((s) => nameOf(run.start, s)).join(", ");
    const written = t.milestoneText ? ` The turn after it (turn ${t.milestoneTurn}) records the milestone: “${e(t.milestoneText)}”` : " No milestone was written for it.";
    const planned = t.plannedMilestone ? ` <span class="muted">(The game's result line: ${e(t.plannedMilestone)})</span>` : "";
    return `<p><strong>Chapter result${chapter.threads.length > 1 ? ` (${e(who)})` : ""}:</strong> ${e(t.resolution ?? "not resolved")}.${written}${planned}${t.milestoneLanded ? "" : ` <span class="flag">It did not land on ${e(t.outcomeId)}.</span>`}</p>`;
  });
  return `<div class="result">${parts.join("")}</div>`;
}

function pickLine(pick: PlayPick, step: GroupStepReading | undefined): string {
  const odds = pick.details
    ? `; odds favorable ${Math.round(pick.details.distribution.favorable)}%, mixed ${Math.round(pick.details.distribution.mixed)}%, unfavorable ${Math.round(pick.details.distribution.unfavorable)}%${pick.details.roll !== undefined ? `, rolled ${pick.details.roll.toFixed(1)}` : ""} on ${signed(pick.details.points)} points`
    : "";
  const repicked =
    pick.repickedTo !== undefined
      ? ` <span class="flag">The harness later changed this pick to choice ${pick.repickedTo + 1}, where the next chapter could not be planned from it (see the chapter below).</span>`
      : "";
  // A group thread's step has one result for everyone in it, which may not be this choice's own
  const used = step && step.result !== null && step.result !== pick.resolution ? ` The step's result for everyone in the thread: <strong>${e(step.result)}</strong>.` : "";
  const overridden =
    step?.ownerOverridden && step.owner === pick.slot ? ` <span class="flag">The game used another result: another player's choice decided this step, on this player's own outcome.</span>` : "";
  const notOwners = step?.ownersRoll === "not counted" && step.owner === pick.slot ? ` <span class="flag">${e("The step went another way than the owner's own roll, on the owner's own outcome.")}</span>` : "";
  return `<p class="pick"><strong>Chosen</strong> (the player's policy: ${e(pick.rule)}, ${e(pick.why)}). Its own result: <strong>${e(pick.resolution ?? "–")}</strong>${e(odds)}.${used}${overridden}${notOwners}${repicked}</p>`;
}

function beatBlock(run: PlayRun, turn: PlayTurn, slot: string, readings: StoryReadings): string {
  const beat = asObject(asObject(turn.reply)[slot]);
  // The game shows an ending without options or interludes (turn doc M21), whatever the reply wrote
  const ending = turn.kind === "ending";
  const options = ending ? [] : asArray<Loose>(beat.options);
  const mechanics = turn.mechanics?.choices[slot] ?? [];
  const pick = turn.picks.find((p) => p.slot === slot);
  const step = readings.groupSteps.find((s) => s.turn === turn.turn && s.picks.some((p) => p.slot === slot));
  const optionItems = options
    .map((option, i) => {
      const chosen = pick?.option === i;
      const lines = mechanics[i] ? contextLinesHtml([mechanics[i]]) : "";
      return `<li class="option${chosen ? " chosen" : ""}"><p>${e(asString(option.text))}</p>${lines}${chosen && pick ? pickLine(pick, step) : ""}</li>`;
    })
    .join("");
  const interludes = ending ? [] : asArray<Loose>(beat.interludes);
  const multi = Object.keys(asObject(run.start?.players)).length > 1;
  const judged = readings.choices.options.find((c) => c.turn === turn.turn && c.slot === slot);
  const verdict = !judged
    ? ""
    : judged.verdict === false
      ? `<p class="flag">Judged: the options don't each carry out the result at their position${judged.evidence ? ` (${e(judged.evidence)})` : ""}</p>`
      : `<p class="muted">Judged: ${judged.verdict ? "each option carries out the result at its position" : "no answer"}${judged.evidence ? ` (${e(judged.evidence)})` : ""}</p>`;
  // A story read with a child: this text against its age band's limits
  const read = readings.kids?.turns.find((t) => t.turn === turn.turn && t.slot === slot);
  const kids =
    readings.kids && read
      ? `<p class="${read.passes ? "muted" : "flag"}">${e(
          `For ${kidsWho(readings.kids)}: ${read.words} words, ${read.wordsPerSentence.toFixed(1)} words a sentence, grade ${read.grade.toFixed(1)}: ${read.passes ? "within" : "outside"} the band's limits.`
        )}</p>`
      : "";
  return `<div class="beat">
<h4>${multi ? `${e(nameOf(run.start, slot))}: ` : ""}${e(asString(beat.title))}</h4>
${prose(asString(beat.text))}
${kids}
${options.length ? `<ol class="options">${optionItems}</ol>` : ending ? "" : `<p class="flag">No options: the player could not go on.</p>`}
${verdict}
${interludes.length ? `<details><summary>Shown while the next turn was written</summary><ul>${interludes.map((i) => `<li>${e(asString(i.text))}</li>`).join("")}</ul></details>` : ""}
</div>`;
}

/** Where production sent a failed turn again: each failed send's reason, then how the turn got written (or didn't). */
function sendLines(turn: PlayTurn): string[] {
  const failed = turn.failedSends ?? [];
  if (failed.length === 0) return [];
  const which = (send: string) => (send === "first" ? "the first send" : send === "resend" ? "its resend" : `the ${send}`);
  const reasons = `Production's turn failed (${failed.map((s) => `${which(s.send)}: ${s.failure}`).join("; ")})`;
  const told = failed.some((s) => s.send.includes("resend"));
  if (!told) return [`${reasons}; the queue sent it once more, and that worked.`];
  const wrote =
    !turn.reply
      ? "no send wrote it, and the story stops here"
      : turn.sentBy === "after repick"
        ? "the harness then changed the stuck players' switch picks and sent the turn once more (not production's step)"
        : `${turn.sentBy?.includes("resend") ? "that Try again's resend" : "that Try again"} wrote it`;
  const pressed = failed.some((s) => s.send.startsWith("try again")) || turn.sentBy?.startsWith("try again") ? " and pressed Try again" : "";
  return [`${reasons}. The players saw “Unable to continue the story. Please try again.”${pressed}; ${wrote}.`];
}

function turnNotes(turn: PlayTurn): string {
  const notes = [
    ...sendLines(turn),
    ...(turn.calls.length > 1 ? [`Asked for again: ${turn.calls[0].problem ?? "the first reply could not be used"}`] : []),
    ...turn.calls.filter((c) => c.sends.length > 1).map((c) => `Re-sent ${c.sends.length - 1} time(s): ${c.sends.map((s) => s.outcome).join(", ")}`),
    ...(turn.repairs.length ? [`The game repaired: ${turn.repairs.join("; ")}`] : []),
    ...turn.unfit.map((u) => `A stat change that doesn't fit its stat: ${u.name} (${u.kinds.join("; ")})`),
    ...turn.levers.filter((l) => l.status !== "applied").map((l) => `The previous ${l.kind}${l.stat ? ` of ${l.stat.name}` : ""} was ${l.status === "notApplied" ? "not applied" : l.status}`),
  ];
  return notes.map((n) => `<p class="flag">${e(n)}</p>`).join("");
}

/** The judged places check on a group chapter turn (round 4 on, and round 3's for the comparison): its verdict, evidence and the people it listed. */
function placesBlock(turn: PlayTurn, readings: StoryReadings): string {
  const judged = readings.places.find((p) => p.turn === turn.turn);
  if (!judged) return "";
  const evidence = judged.evidence ? ` (${judged.evidence})` : "";
  const verdict =
    judged.verdict === false
      ? `<p class="flag">${e(`Judged: someone or something is in two places across the players' texts${evidence}`)}</p>`
      : `<p class="muted">${e(`Judged: ${judged.verdict ? "everyone and everything is in one place across the players' texts" : "no answer on the places across the players' texts"}${evidence}`)}</p>`;
  const lines = judged.lines.length ? `<ul class="ctx-lines">${judged.lines.map((l) => `<li>${e(l)}</li>`).join("")}</ul>` : "";
  return `${verdict}${lines}`;
}

function turnBlock(run: PlayRun, turn: PlayTurn, readings: StoryReadings): string {
  const slots = Object.keys(asObject(run.start?.players));
  const failed = !turn.reply ? `<p class="flag">No turn: ${e(run.stopped)}</p>` : "";
  return `<article class="turn" id="turn-${turn.turn}">
<header><span class="turn-no">Turn ${turn.turn}</span><span class="kind">${e(turn.kind)}</span><span class="meta">wait ${seconds(turn.waitMs)} · ${usd(turn.costUsd)}</span></header>
${turn.reply ? slots.map((slot) => beatBlock(run, turn, slot, readings)).join("") : failed}
${placesBlock(turn, readings)}
${turn.mechanics ? `<div class="changes"><h5>What this turn changes</h5>${contextLinesHtml(turn.mechanics.changes)}</div>` : ""}
${turnNotes(turn)}
</article>`;
}

function storySection(run: PlayRun, readings: StoryReadings): string {
  const parts: string[] = [];
  for (const turn of run.turns) {
    const chapter = readings.chapters.find((c) => c.firstTurn === turn.turn);
    parts.push(switchBlock(run, turn, readings), chapterBlock(run, turn, chapter, readings), turnBlock(run, turn, readings));
    const ended = readings.chapters.find((c) => c.lastTurn === turn.turn);
    if (ended) parts.push(chapterResult(run, ended));
  }
  if (!run.complete) parts.push(`<p class="flag">The story stopped: ${e(run.stopped)}</p>`);
  return `<section id="story"><h2>The story, turn by turn</h2>${parts.join("\n")}</section>`;
}

function endingSection(run: PlayRun, readings: StoryReadings): string {
  if (!readings.ending) return "";
  const outcomes = outcomesById(run.end);
  const rows = readings.ending.states
    .map((s) => {
      const outcome = outcomes.get(s.id)?.outcome;
      const recorded = (outcome?.milestones ?? []).map((m) => `<li>${e(m)}</li>`).join("");
      return `<tr><td>${e(outcome?.question ?? s.id)}<br><code class="muted">${e(s.id)}</code></td><td>${e(s.owner === "shared" ? "shared" : nameOf(run.start, s.owner))}</td><td>${s.milestones} of ${s.intended}</td><td>${s.complete ? "complete" : "unfinished"}</td><td><ul class="ctx-lines">${recorded}</ul></td></tr>`;
    })
    .join("");
  const judged = readings.ending.judged
    .map((j) => `<li>${e(nameOf(run.start, j.label))}: ${j.verdict === undefined ? "no answer" : j.verdict ? "each outcome told as its milestones leave it" : "not every outcome told as its milestones leave it"}${j.evidence ? ` — ${e(j.evidence)}` : ""}${j.lines.length ? `<ul class="ctx-lines">${j.lines.map((l) => `<li>${e(l)}</li>`).join("")}</ul>` : ""}</li>`)
    .join("");
  return `<section id="ending"><h2>The ending</h2>
<p class="muted">The ending is turn ${readings.ending.turn} above. Each outcome as its milestones leave it after the ending (production's own reading, which the ending's request states):</p>
<div class="scroll"><table><tr><th>Outcome</th><th>Whose</th><th>Milestones</th><th>Standing</th><th>Milestones recorded</th></tr>${rows}</table></div>
${judged ? `<p class="muted">The judged check (does the ending tell every outcome as its milestones leave it?):</p><ul>${judged}</ul>` : ""}
</section>`;
}

function statsSection(run: PlayRun): string {
  const start = run.start;
  const end = run.end;
  if (!start || !end) return "";
  const value = (values: StatValueEntry[] | undefined, id: string) => values?.find((v) => v.statId === id)?.value;
  const rows = [
    ...start.sharedStats.map((s) => `<tr><td>${e(s.name)} (shared)</td><td>${e(valueShown(s, value(start.sharedStatValues, s.id)))}</td><td>${e(valueShown(s, value(end.sharedStatValues, s.id)))}</td></tr>`),
    ...start.playerStats.flatMap((s) =>
      Object.keys(start.players).map(
        (slot) => `<tr><td>${e(s.name)} (${e(nameOf(start, slot))})</td><td>${e(valueShown(s, value(start.players[slot]?.statValues, s.id)))}</td><td>${e(valueShown(s, value(end.players[slot]?.statValues, s.id)))}</td></tr>`
      )
    ),
  ].join("");
  return `<section id="stats"><h2>Stats at the start and the end</h2><div class="scroll"><table><tr><th>Stat</th><th>Start</th><th>End</th></tr>${rows}</table></div></section>`;
}

function readingsSection(run: PlayRun, readings: StoryReadings): string {
  const r = readings;
  const items = [
    `Ends on its turn count: ${r.endsOnTurnCount.ok ? "yes" : "no"} (${r.endsOnTurnCount.turnsBeforeEnding} turns${r.endsOnTurnCount.endingTurn ? `, the ending at turn ${r.endsOnTurnCount.endingTurn}` : ", no ending"}).`,
    `Chapters: ${r.chapters.length}; lengths PACING allows: ${r.chapters.filter((c) => c.lengthAllowed).length} of ${r.chapters.length}; milestones that landed on their outcome: ${r.chapters.flatMap((c) => c.threads).filter((t) => t.milestoneLanded).length} of ${r.chapters.flatMap((c) => c.threads).length}.`,
    `Late pacing: ${r.latePacing.filter((p) => p.binding).length} of ${r.latePacing.length} switches bind; at those, the next chapter pushed an outcome that still needed milestones: ${r.latePacing.filter((p) => p.binding && p.nextNeeded).length}.`,
    pacingLine(r),
    `Sacrifices and rewards against the owner's rule: ${
      r.leverFlags.length
        ? r.leverFlags.map((f) => `chapter ${f.chapter} (${f.slot}): ${f.rule} at turn ${f.turns.join(", ")}`).join("; ")
        : "no chapter offered a second reward or sacrifice or a reward after its first step, and none offered rewards in consecutive chapters"
    }.`,
    `Levers the player took, paid on the next turn: ${r.leversPaid.counts.applied} of ${Object.values(r.leversPaid.counts).reduce((a, b) => a + b, 0)}${
      r.leversPaid.counts.sharedOnce ? `; ${r.leversPaid.counts.sharedOnce} more rode on one change of a shared stat that paid another player's (${r.leversPaid.sharedOnce.map((s) => `turn ${s.turn}, ${s.stat}`).join("; ")})` : ""
    }.`,
    chargedAgainLine(r),
    chargedOnOfferLine(r),
    undoneLine(r),
    resultWordsLine(r),
    `Setup design checks that failed (read afresh): ${r.setupChecksFailed.length ? r.setupChecksFailed.join(", ") : "none"}.`,
    `Stat changes that don't fit their stat: ${r.unfit.length}.`,
    ...(r.players > 1
      ? [
          `Group exploration steps where another player's choice decided the owner's own outcome: ${r.groupSteps.filter((s) => s.ownerOverridden).map((s) => `turn ${s.turn}`).join(", ") || "none"} (of ${r.groupSteps.filter((s) => s.kind === "exploration").length} group exploration steps).`,
          `Switch picks the next chapter did not follow: ${r.switchPicks.filter((p) => !p.kept).map((p) => `turn ${p.turn} (${p.slot})`).join(", ") || "none"} (of ${r.switchPicks.length}).`,
          ownersRollLine(r) ?? "",
        ]
      : []),
    ...(r.kids ? [kidsLine(r) ?? ""] : []),
    ...(r.repairs.stuckTurns.length ? [`Turns production could not get past (the harness asked the planner again): ${r.repairs.stuckTurns.map((s) => `turn ${s.turn} (${s.kind})`).join(", ")}.`] : []),
    `Turns production sent again: ${r.repairs.resentTurns.length ? r.repairs.resentTurns.map(resentLine).join("; ") : "none"}.`,
    `Production's fixes that fired: ${fixesLine(r)}.`,
    `Repairs: plans retried ${r.repairs.planRetries.length}, one-paragraph turns retried ${r.repairs.shortTextRetries.length} (the retry one paragraph too and used: ${r.repairs.shortTextUsedAsIs.length}), turns without options retried ${r.repairs.optionsRetries.length}, calls re-sent ${r.repairs.resends.length}, beat repairs ${Object.values(r.repairs.beatRepairs).reduce((a, b) => a + b, 0)}.`,
    ownStatsLine(r),
    countedLine(r),
    scoreboardLine(r),
    ...(r.places.length ? [`${placesLine(r) ?? ""}.`] : []),
    ...(r.choices.options.length || r.choices.results.length
      ? [
          `Judged: ${choiceLine("option sets that carry out the result at each position", r.choices.options, (c) => `turn ${c.turn} ${c.slot}`)}.`,
          `Judged: ${choiceLine("chapter plans whose results fit their kind", r.choices.results, (c) => `turn ${c.turn}`)}.`,
        ]
      : []),
    `Waits over their allowance: ${r.waits.flatMap((w) => w.over.map((t) => `turn ${t} (${w.kind})`)).join(", ") || "none"}${r.waitsLeftOut.length ? `; left out of the waits, where the players were told the turn failed or production could not get past it: ${r.waitsLeftOut.map((t) => `turn ${t}`).join(", ")}` : ""}.`,
    `Cost: ${usd(r.cost.storyUsd)} over ${r.cost.calls} calls (judged checks ${usd(r.cost.judgeUsd)}).`,
  ];
  return `<section id="readings"><h2>What the code read</h2><ul>${items.map((i) => `<li>${e(i)}</li>`).join("")}</ul><p class="muted">The report reads the story by hand as well: ${e(reportOf(run.round))}.</p></section>`;
}

/** One played story as a page. */
export function storyPage(run: PlayRun): string {
  const readings = readStory(run);
  const title = run.start?.title || run.spec.id;
  const facts: [string, string][] = [
    ["Players", `${run.input.playerCount} (${Object.keys(run.start?.players ?? {}).map((slot) => nameOf(run.start, slot)).join(", ")})`],
    ["Game mode", run.input.gameMode],
    ["Length", `${run.input.maxTurns} turns`],
    ["Played", `${run.turns.length} turns${run.complete ? ", to the ending" : `; stopped: ${run.stopped}`}`],
    ["Premise", run.spec.premiseId ?? run.spec.premise?.source ?? ""],
    ["Cost", `${usd(readings.cost.storyUsd)} over ${readings.cost.calls} calls`],
  ];
  const body = `<header>
<p class="kicker">A whole story on production's ${(run.round ?? 1) > 1 ? `current code (round ${run.round})` : "own code"} · ${e(run.spec.tests)}</p>
<h1>${e(title)}</h1>
<p class="lede">${e(run.input.premise)}</p>
<dl class="facts">${facts.map(([k, v]) => `<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join("")}</dl>
<nav><a href="index.html">All stories</a><a href="#setup">Setup</a><a href="#story">The story</a>${readings.ending ? '<a href="#ending">The ending</a>' : ""}<a href="#stats">Stats</a><a href="#readings">What the code read</a></nav>
<p class="muted">The player is automated: a sacrifice or reward whenever one is offered (never twice in a row), otherwise the stat-backed, the riskiest and the most sensible option in turn; exploration choices rotate${(run.round ?? 1) > 1 ? "; where a turn fails twice, it presses Try again once" : ""}. The game's own dice, on a seeded source. No images, no pregeneration.</p>
</header>
${setupSection(run)}
${storySection(run, readings)}
${endingSection(run, readings)}
${statsSection(run)}
${readingsSection(run, readings)}`;
  return page(title, body);
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** The stories' index: each story's page and its main facts; a later round's links the first round's pages and names its own report. */
export function indexPage(runs: PlayRun[], generatedAt: Date, round = 1): string {
  const rows = runs
    .map((run) => {
      const r = readStory(run);
      return `<tr><td><a href="${e(storyFileName(run))}">${e(run.start?.title || run.spec.id)}</a><br><span class="muted">${e(run.spec.tests)}</span></td><td>${run.input.playerCount}</td><td>${e(run.input.gameMode)}</td><td>${run.input.maxTurns} turns</td><td>${run.complete ? "yes" : `no: ${e(run.stopped)}`}</td><td>${r.endsOnTurnCount.ok ? "yes" : "no"}</td><td>${r.chapters.length}</td><td>${usd(r.cost.storyUsd)}</td></tr>`;
    })
    .join("");
  const count = `${COUNT_WORDS[runs.length] ?? String(runs.length)} ${runs.length === 1 ? "story" : "stories"}`;
  const heading = round > 1 ? `Round ${round}: ${count} on production's current code` : `${count[0].toUpperCase()}${count.slice(1)} on production's own code`;
  const earlier =
    round > 3
      ? `<p class="muted">The earlier rounds' pages, played before the fixes since: <a href="../index.html">round 1</a> (production's code of the morning of 30 September), <a href="../round2/index.html">round 2</a> (its code of the evening of 30 September) and <a href="../round3/index.html">round 3</a> (its code of the evening of 1 October, before decision A).</p>`
      : round > 2
      ? `<p class="muted">The earlier rounds' pages, played before the fixes since: <a href="../index.html">round 1</a> (production's code of the morning of 30 September) and <a href="../round2/index.html">round 2</a> (its code of the evening of 30 September).</p>`
      : round > 1
        ? `<p class="muted">The first round's pages, played before the fixes since (production's code of the morning of 30 September): <a href="../index.html">round 1</a>.</p>`
        : "";
  const body = `<header>
<p class="kicker">Whole-story playthroughs${round > 1 ? `, round ${round}` : ""}</p>
<h1>${heading}</h1>
<p class="lede">Each story was set up and played to its end the way the game plays it on this branch: production's own requests, models, checks and repairs, with an automated player. Written ${e(generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC.</p>
${earlier}
</header>
<div class="scroll"><table><tr><th>Story</th><th>Players</th><th>Mode</th><th>Length</th><th>Reached the ending</th><th>On its turn count</th><th>Chapters</th><th>Cost</th></tr>${rows}</table></div>
<p class="muted">These pages show production's own turns, one version each; they are not rating pages. The report is ${e(reportOf(round))}.</p>`;
  return page(round > 1 ? `Playthroughs, round ${round}` : "Playthroughs", body);
}
