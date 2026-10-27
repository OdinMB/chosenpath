// The built-in journey (no --steps): the home page, signing in, the library,
// the fixture template, starting a story, choosing a character, the first
// turn, one choice and the turn after it, with a screenshot at each step.
// A --steps module has the same shape: export default async (context) => {}.

import { PLACEHOLDER_MARK } from "../lib/fake-openai.mjs";

const TURN_TIMEOUT = 120_000;

// The current beat's text: the one block the game marks as AI-generated (BeatContent.tsx)
const NARRATIVE = '.narrative-container[data-ai-generated="true"]';

/**
 * The current turn's choices: the buttons after the beat's text that hold the
 * fake model's placeholder text. Scoped to the beat, since the character cards
 * before the first turn are buttons with placeholder text too.
 */
function choiceButtons(page) {
  return page.locator(NARRATIVE).last().locator("xpath=following-sibling::*").getByRole("button").filter({ hasText: "(placeholder" });
}

/**
 * Run in the page: the texts of the enabled choice buttons after the beat's
 * text that are not in `old`, or null when there are none (so it can be waited on).
 */
function newChoiceTexts(old) {
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

export default async function smoke({ page, login, shot, log, fixture }) {
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
  const card = page.getByText(fixture.template.title, { exact: false }).filter({ visible: true }).first();
  await card.waitFor();
  await shot("library");

  log("open the fixture template");
  await card.click();
  const configure = `/templates/${fixture.template.id}/configure`;
  try {
    await page.waitForURL((url) => new URL(url).pathname === configure, { timeout: 15_000 });
  } catch {
    log("the library card did not open the template; opening its page directly");
    await page.goto(configure);
  }
  const start = page.getByRole("button", { name: /^Start Story$/ });
  await start.waitFor();
  await shot("template");

  log("start a story");
  await start.click();
  // The button reads "Waiting..." until the server says the story is ready, then "Begin"
  const begin = page.getByRole("button", { name: /^Begin$/ });
  await begin.waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Begin" && !b.disabled), undefined, { timeout: 60_000 });
  await shot("story-ready");
  await begin.click();
  await page.waitForURL((url) => new URL(url).pathname.startsWith("/game/"));

  log("choose a character");
  const confirm = page.getByRole("button", { name: /^Confirm Selection$/ });
  await confirm.waitFor({ timeout: 60_000 });
  await characterCards(page, "Identity").first().click();
  await characterCards(page, "Background").first().click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Confirm Selection" && !b.disabled));
  await shot("character-selection");
  await confirm.click();

  log("first turn");
  await page.locator(NARRATIVE, { hasText: PLACEHOLDER_MARK }).last().waitFor({ timeout: TURN_TIMEOUT });
  const choices = choiceButtons(page);
  await choices.first().waitFor({ timeout: TURN_TIMEOUT });
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
