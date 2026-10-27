// The built-in journey (no --steps): the home page, signing in, the library,
// the fixture template opened with its card's Play button, starting a story,
// choosing a character, the first turn, one choice and the turn after it,
// with a screenshot at each step. A --steps module has the same shape:
// export default async (context) => {}, and may import this module's helpers.

import { PLACEHOLDER_MARK } from "../lib/fake-openai.mjs";

export const TURN_TIMEOUT = 120_000;

// The current beat's text: the one block the game marks as AI-generated (BeatContent.tsx)
export const NARRATIVE = '.narrative-container[data-ai-generated="true"]';

/**
 * The current turn's choices: the buttons after the beat's text that hold the
 * fake model's placeholder text. Scoped to the beat, since the character cards
 * before the first turn are buttons with placeholder text too.
 */
export function choiceButtons(page) {
  return page.locator(NARRATIVE).last().locator("xpath=following-sibling::*").getByRole("button").filter({ hasText: "(placeholder" });
}

/**
 * Run in the page: the texts of the enabled choice buttons after the beat's
 * text that are not in `old`, or null when there are none (so it can be waited on).
 */
export function newChoiceTexts(old) {
  const narratives = document.querySelectorAll('.narrative-container[data-ai-generated="true"]');
  const narrative = narratives[narratives.length - 1];
  const texts = [];
  for (let element = narrative?.nextElementSibling; element; element = element.nextElementSibling) {
    for (const button of element.querySelectorAll("button")) {
      const text = (button.textContent ?? "").trim();
      if (!button.disabled && text.includes("(placeholder") && !old.includes(text)) texts.push(text);
    }
  }
  return texts.length > 0 ? texts : null;
}

/** The character cards under a heading of the character selection (CharacterSelection.tsx). */
function characterCards(page, heading) {
  return page.getByRole("heading", { name: heading, exact: true }).locator("xpath=..").locator("[aria-pressed]");
}

/** Run in the page: whether a button reading `text` is enabled. */
function buttonEnabled(text) {
  return [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === text && !b.disabled);
}

/** A library card's title (TemplateCard.tsx), which is not itself a link. */
export function libraryCardTitle(page, title) {
  return page.getByRole("heading", { name: title, exact: true }).filter({ visible: true }).first();
}

/** A library card's Play button (TemplateCard.tsx), beside its title. Opens the template's page. */
export function playButton(page, title) {
  return libraryCardTitle(page, title).locator("xpath=..").getByRole("button", { name: "Play", exact: true });
}

/**
 * Opens a template from the library with its card's Play button. Where there
 * is no such button, or it doesn't lead to the template's page, that is a
 * finding, and the page opens by its address so the journey can go on.
 */
export async function openFromLibrary({ page, finding }, template) {
  const configure = `/templates/${template.id}/configure`;
  try {
    await playButton(page, template.title).click({ timeout: 15_000 });
    await page.waitForURL((url) => new URL(url).pathname === configure, { timeout: 15_000 });
  } catch {
    finding(`the Play button on the library card "${template.title}" did not open ${configure}; opening it by its address`);
    await page.goto(configure);
  }
}

/** Starts the story on a template's page; resolves with the Begin button once the server says the story is ready. */
export async function startStory(page) {
  await page.getByRole("button", { name: /^Start Story$/ }).click();
  // The button reads "Waiting..." until the server says the story is ready, then "Begin"
  const begin = page.getByRole("button", { name: /^Begin$/ });
  await begin.waitFor({ timeout: 60_000 });
  await page.waitForFunction(buttonEnabled, "Begin", { timeout: 60_000 });
  return begin;
}

/** Picks the first identity and background once the character selection shows; resolves with its Confirm button, enabled. */
export async function pickFirstCharacter(page) {
  const confirm = page.getByRole("button", { name: /^Confirm Selection$/ });
  await confirm.waitFor({ timeout: 60_000 });
  await characterCards(page, "Identity").first().click();
  await characterCards(page, "Background").first().click();
  await page.waitForFunction(buttonEnabled, "Confirm Selection");
  return confirm;
}

/** Waits for a turn's text and its choices; resolves with the choice buttons. */
export async function waitForTurn(page) {
  await page.locator(NARRATIVE, { hasText: PLACEHOLDER_MARK }).last().waitFor({ timeout: TURN_TIMEOUT });
  const choices = choiceButtons(page);
  await choices.first().waitFor({ timeout: TURN_TIMEOUT });
  return choices;
}

export default async function smoke({ page, login, shot, log, finding, fixture }) {
  log("home page");
  await page.goto("/");
  // Bounded: an open request (socket.io's long-polling) would keep the network from ever going idle
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => log("the home page's network did not go idle within 10s; going on"));
  await shot("home");

  log("sign in as the fixture player");
  await login();
  await shot("signed-in");

  log("library");
  await page.goto("/library");
  await libraryCardTitle(page, fixture.template.title).waitFor();
  await shot("library");

  log("open the fixture template with its card's Play button");
  await openFromLibrary({ page, finding }, fixture.template);
  await page.getByRole("button", { name: /^Start Story$/ }).waitFor();
  await shot("template");

  log("start a story");
  const begin = await startStory(page);
  await shot("story-ready");
  await begin.click();
  await page.waitForURL((url) => new URL(url).pathname.startsWith("/game/"));

  log("choose a character");
  const confirm = await pickFirstCharacter(page);
  await shot("character-selection");
  await confirm.click();

  log("first turn");
  const choices = await waitForTurn(page);
  await shot("first-turn");

  log("make a choice");
  const before = await page.evaluate(newChoiceTexts, []);
  if (!before) throw new Error("the first turn shows no choices to make");
  await choices.first().click();
  // The second turn: choices whose texts the first turn didn't have
  await page.waitForFunction(newChoiceTexts, before, { timeout: TURN_TIMEOUT });
  await shot("second-turn");
  log("journey done");
}
