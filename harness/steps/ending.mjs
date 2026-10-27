// A single-player story to its ending (--steps harness/steps/ending.mjs):
// the fixture player opens the single-player World from the library, starts
// a story, chooses a character and plays every turn, a screenshot of each,
// until the story's ending, which it screenshots too; then the account's
// story list, where the finished story is. With --story-length 3 that is
// three choices. A turn that offers another number of choices than the beat
// schema asks for, an ending after another number of choices than the World
// has turns, or one not titled as the fake model titles it, is a finding.
// Other journeys can import playToEnd, for one player's page or for every
// seat of a group.

import { PLACEHOLDER_MARK } from "../lib/fake-openai.mjs";
import { ENDING_TITLE } from "../lib/fake-story.mjs";
import { TURN_TIMEOUT, choiceButtons, libraryCardTitle, openFromLibrary, pickFirstCharacter, startStory, waitForTurn } from "./smoke.mjs";

/** How long a beat with no choices must stay so to count as the ending (the choices of a new beat follow it by a render). */
export const ENDING_SETTLE_MS = 1_500;

/** The choices a turn offers: the beat schema asks for "Exactly 3 choices for the player". */
export const CHOICES_PER_TURN = 3;

/**
 * Run in the page: the latest beat as the game shows it (BeatHistory.tsx's
 * "Beat n of m", with " (Next)" while the next one is written; BeatContent.tsx's
 * title heading, its text, marked as AI-generated, and the enabled choice
 * buttons after it).
 */
export function beatOnScreen(mark) {
  const counter = [...document.querySelectorAll("span")]
    .map((span) => (span.textContent ?? "").trim())
    .map((text) => text.match(/^Beat (\d+) of (\d+)( \(Next\))?$/))
    .find(Boolean);
  const narratives = document.querySelectorAll('.narrative-container[data-ai-generated="true"]');
  const narrative = narratives[narratives.length - 1];
  const heading = narrative?.previousElementSibling;
  const choices = [];
  for (let element = narrative?.nextElementSibling; element; element = element.nextElementSibling) {
    for (const button of element.querySelectorAll("button")) {
      const text = (button.textContent ?? "").trim();
      if (!button.disabled && text.includes("(placeholder")) choices.push(text);
    }
  }
  return {
    beat: counter ? Number(counter[1]) : 0,
    of: counter ? Number(counter[2]) : 0,
    writing: Boolean(counter?.[3]),
    title: heading?.tagName === "H2" ? (heading.textContent ?? "").trim() : "",
    text: Boolean(narrative && (narrative.textContent ?? "").includes(mark)),
    choices,
  };
}

/**
 * Run in the page: whether a beat after `after` is on screen, written and the
 * latest, with the fake model's text. It reads the counter as beatOnScreen
 * does, not through a shared helper: Playwright sends a page function to the
 * browser on its own, without what this module defines around it.
 */
function newBeatShown({ mark, after }) {
  const counter = [...document.querySelectorAll("span")]
    .map((span) => (span.textContent ?? "").trim())
    .map((text) => text.match(/^Beat (\d+) of (\d+)( \(Next\))?$/))
    .find(Boolean);
  if (!counter || counter[3] || Number(counter[1]) <= after || counter[1] !== counter[2]) return false;
  const narratives = document.querySelectorAll('.narrative-container[data-ai-generated="true"]');
  const narrative = narratives[narratives.length - 1];
  return Boolean(narrative && (narrative.textContent ?? "").includes(mark));
}

/**
 * Waits for the beat after `after` on a page; resolves with it as beatOnScreen
 * reads it. A beat that shows no choices is read again after ENDING_SETTLE_MS,
 * since a new beat's choices come a render after its text.
 */
export async function nextBeat(page, after) {
  await page.waitForFunction(newBeatShown, { mark: PLACEHOLDER_MARK, after }, { timeout: TURN_TIMEOUT });
  let beat = await page.evaluate(beatOnScreen, PLACEHOLDER_MARK);
  if (beat.choices.length === 0) {
    await page.waitForTimeout(ENDING_SETTLE_MS);
    beat = await page.evaluate(beatOnScreen, PLACEHOLDER_MARK);
  }
  return beat;
}

/**
 * Plays a story from the turn on screen to its ending: on every turn each
 * page takes a screenshot (`turn-<n>`, `<label>-turn-<n>` with several pages)
 * and makes a choice, the option at (turn - 1) mod their number unless
 * `choose` says otherwise, so the turns take different options. A page per
 * seat for a group: every seat chooses before any waits. A turn offering
 * another number of choices than CHOICES_PER_TURN goes to `finding`.
 * Resolves with the choices made, the ending's beat and each page's ending as
 * beatOnScreen reads it, once every page shows a beat with no choices; throws
 * when that takes more than `maxChoices`, or when some seats end and others don't.
 */
export async function playToEnd({
  pages,
  shot,
  log,
  finding = () => {},
  maxChoices,
  labels = pages.map((_, i) => `seat-${i + 1}`),
  choose = (turn, count) => (turn - 1) % count,
}) {
  const name = (i, what) => (pages.length > 1 ? `${labels[i]}-${what}` : what);
  let beats = [];
  for (const page of pages) {
    await waitForTurn(page);
    beats.push(await page.evaluate(beatOnScreen, PLACEHOLDER_MARK));
  }
  for (let turn = 1; turn <= maxChoices; turn++) {
    for (const [i, page] of pages.entries()) {
      const count = beats[i].choices.length;
      if (count !== CHOICES_PER_TURN) finding(`${name(i, `turn ${turn}`)} (beat ${beats[i].beat}) offers ${count} choices, not ${CHOICES_PER_TURN}`);
      const choice = choose(turn, count);
      log(`${name(i, `turn ${turn}`)}: beat ${beats[i].beat}, choice ${choice + 1} of ${count}`);
      await shot(name(i, `turn-${turn}`), page);
      await choiceButtons(page).nth(choice).click();
    }
    const next = [];
    for (const [i, page] of pages.entries()) next.push(await nextBeat(page, beats[i].beat));
    beats = next;
    const ended = beats.filter((beat) => beat.choices.length === 0).length;
    if (ended === pages.length) return { choices: turn, beat: beats[0].beat, endings: beats };
    if (ended > 0) throw new Error(`after ${turn} choices ${ended} of ${pages.length} seats show a beat with no choices, the others go on`);
  }
  throw new Error(`the story did not end within ${maxChoices} choices`);
}

/**
 * What is wrong with a story played to its end on a World of `maxTurns`
 * turns, as findings: an ending after another number of choices than the
 * World has turns, on another beat than the one after its last turn, or
 * without the ending's title the fake model writes.
 */
export function endingProblems({ played, maxTurns }) {
  const problems = [];
  if (played.choices !== maxTurns) problems.push(`the story ended after ${played.choices} choices; the World has ${maxTurns} turns`);
  if (played.beat !== maxTurns + 1) problems.push(`the ending is beat ${played.beat}, not ${maxTurns + 1}, the beat after the World's last turn`);
  for (const ending of played.endings ?? []) {
    if (ending.title !== ENDING_TITLE) problems.push(`the ending's title reads "${ending.title}", not "${ENDING_TITLE}"`);
  }
  return problems;
}

export default async function ending({ page, login, shot, log, finding, fixture }) {
  const template = fixture.template;
  log(`single-player World "${template.title}": ${template.maxTurns} turns`);

  log("sign in as the fixture player");
  await login();

  log("library");
  await page.goto("/library");
  await libraryCardTitle(page, template.title).waitFor();

  log("open the World with its card's Play button");
  await openFromLibrary({ page, finding }, template);

  log("start a story");
  const begin = await startStory(page);
  await begin.click();
  await page.waitForURL((url) => new URL(url).pathname.startsWith("/game/"));

  log("choose a character");
  const confirm = await pickFirstCharacter(page);
  await confirm.click();

  log("play every turn");
  // The engine ends a story on the beat after its last turn; a few more choices before failing, in case it doesn't
  const played = await playToEnd({ pages: [page], shot, log, finding, maxChoices: template.maxTurns + 4 });
  log(`the ending is beat ${played.beat}, "${played.endings[0].title}", after ${played.choices} choices; the World has ${template.maxTurns} turns`);
  for (const problem of endingProblems({ played, maxTurns: template.maxTurns })) finding(problem);
  await shot("ending");

  log("the account's stories, the finished one among them");
  await page.goto("/users/my-stories");
  await page.getByRole("heading", { name: "My Stories", exact: true }).waitFor();
  await page
    .getByText(template.title)
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => log(`"${template.title}" did not show on My Stories within 15s`));
  await shot("my-stories");
  log("journey done");
}
