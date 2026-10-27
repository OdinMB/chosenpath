// A group story (--steps harness/steps/group.mjs): the fixture player opens
// the group World from the library, starts a story for its most seats,
// prints the seat cards and reads their join links; then each seat joins
// from its card's link in a browser context of its own, as players on their
// own devices would, chooses a character and plays the first turn and the
// one after it. A card whose link or QR code leads anywhere but the front
// door is a finding, and that seat joins by its code instead.

import { TURN_TIMEOUT, libraryCardTitle, newChoiceTexts, openFromLibrary, pickFirstCharacter, startStory, waitForTurn } from "./smoke.mjs";

const SEAT_CARD = 'article[aria-label^="Seat card"]';

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Run in the page: whether the seat cards page shows `count` cards. */
function seatCardsShown(count) {
  return document.querySelectorAll('article[aria-label^="Seat card"]').length >= count;
}

/** What a seat card shows (SeatCard.tsx): its label, its text link, its QR code's link and the QR code's title. */
async function readSeatCard(card) {
  return {
    label: (await card.getAttribute("aria-label")) ?? "",
    link: (await card.locator('a:not([aria-hidden="true"])').getAttribute("href")) ?? "",
    qrLink: (await card.locator('a[aria-hidden="true"]').getAttribute("href")) ?? "",
    qrTitle: (await card.locator("svg title").textContent()) ?? "",
  };
}

export default async function group({ page, baseUrl, login, shot, log, finding, newPage, fixture }) {
  const template = fixture.groupTemplate;
  const seats = template.playerCountMax;
  log(`group World "${template.title}": ${template.playerCountMin}-${seats} players, ${template.gameMode}`);

  log("sign in as the fixture player");
  await login();

  log("library");
  await page.goto("/library");
  await libraryCardTitle(page, template.title).waitFor();
  await shot("library");

  log("open the group World with its card's Play button");
  await openFromLibrary({ page, finding }, template);
  const slider = page.locator("#player-count");
  await slider.waitFor();
  // The slider's largest value, as a keyboard sets it
  await slider.focus();
  await page.keyboard.press("End");
  await page.getByText(`Number of Players: ${seats}`, { exact: true }).waitFor();
  await shot("group-template");

  log(`start a story for ${seats} players`);
  await startStory(page);
  await shot("group-codes");

  log("seat cards");
  await page.goto("/users/seat-cards");
  await page.getByRole("checkbox", { name: new RegExp(escapeRegExp(template.title)) }).first().check();
  await page.waitForFunction(seatCardsShown, seats);
  await shot("seat-cards");

  const links = [];
  const cards = page.locator(SEAT_CARD);
  for (let i = 0; i < seats; i++) {
    const card = await readSeatCard(cards.nth(i));
    log(`seat card ${i + 1}: ${card.label}; links to ${card.link}`);
    if (!card.label.includes(`seat ${i + 1} of ${seats}`)) finding(`seat card ${i + 1} reads "${card.label}", not seat ${i + 1} of ${seats}`);
    if (card.qrLink !== card.link || !card.qrTitle.includes(card.link)) finding(`seat card ${i + 1}'s QR code holds another link than its text link`);
    const code = card.link.split("/").filter(Boolean).pop() ?? "";
    if (!card.link.startsWith(`${baseUrl}/game/`)) {
      finding(`seat card ${i + 1} links to ${card.link}, not to the front door; that seat joins by its code`);
      links.push(`${baseUrl}/game/${code}`);
    } else {
      links.push(card.link);
    }
  }

  // Each seat on a device of its own: a new browser context, no account
  const players = [];
  for (const [i, link] of links.entries()) {
    log(`seat ${i + 1} joins from its card's link`);
    const player = await newPage();
    await player.goto(link);
    const confirm = await pickFirstCharacter(player);
    await shot(`seat-${i + 1}-character`, player);
    await confirm.click();
    players.push(player);
  }

  log("first turn, every seat");
  const firstChoices = [];
  for (const [i, player] of players.entries()) {
    await waitForTurn(player);
    await shot(`seat-${i + 1}-first-turn`, player);
    const texts = await player.evaluate(newChoiceTexts, []);
    if (!texts) throw new Error(`seat ${i + 1}'s first turn shows no choices to make`);
    firstChoices.push(texts);
  }

  log("every seat makes a choice");
  for (const player of players) await (await waitForTurn(player)).first().click();

  log("second turn, every seat");
  for (const [i, player] of players.entries()) {
    await player.waitForFunction(newChoiceTexts, firstChoices[i], { timeout: TURN_TIMEOUT });
    await shot(`seat-${i + 1}-second-turn`, player);
  }
  log("journey done");
}
