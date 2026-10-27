import { SeatCard } from "../../../src/users/stories/SeatCard";
import type { SeatCardData } from "../../../src/users/stories/seatCards";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";
import { AUDIENCE_WORDS } from "../../helpers/genericWording";

/*
 * A printed seat card is all a player gets: it has to say which story and
 * which seat it is, and carry the code, the link and a scannable QR code of
 * the link, on one piece of paper.
 */

const CARD: SeatCardData = {
  storyId: "story-1",
  storyTitle: "The Lighthouse",
  storyNumber: 4,
  seatNumber: 2,
  seatCount: 3,
  code: "AB12CD",
  joinLink: "https://join.example/game/AB12CD",
};

describe("SeatCard", () => {
  it("prints the story's number, its title, the code and the join link", () => {
    const text = accessibleText(renderMarkup(<SeatCard card={CARD} />));

    expect(text).toContain("Story 4");
    expect(text).toContain("The Lighthouse");
    expect(text).toContain("AB12CD");
    expect(text).toContain("https://join.example/game/AB12CD");
  });

  it("names the seat when the story has more than one", () => {
    const html = renderMarkup(<SeatCard card={CARD} />);

    expect(accessibleText(html)).toContain("Seat 2 of 3");
    expect(html).toContain('aria-label="Seat card, story 4, seat 2 of 3, code AB12CD"');
  });

  it("leaves the seat out for a story with one seat", () => {
    const html = renderMarkup(<SeatCard card={{ ...CARD, seatNumber: 1, seatCount: 1 }} />);

    expect(accessibleText(html)).not.toMatch(/Seat \d/);
    expect(html).toContain('aria-label="Seat card, story 4, code AB12CD"');
  });

  it("names no audience or group", () => {
    expect(accessibleText(renderMarkup(<SeatCard card={CARD} />))).not.toMatch(AUDIENCE_WORDS);
  });

  it("makes the join link and the QR code real links, so a saved PDF keeps them clickable", () => {
    const html = renderMarkup(<SeatCard card={CARD} />);

    const links = [...html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(links.map(([, href]) => href)).toEqual([
      "https://join.example/game/AB12CD",
      "https://join.example/game/AB12CD",
    ]);
    // The QR code's link is one more way to click, not a second tab stop
    const [qrLink, textLink] = links;
    expect(qrLink?.[2]).toMatch(/<svg/);
    expect(qrLink?.[0]).toMatch(/tabindex="-1"/);
    expect(qrLink?.[0]).toMatch(/aria-hidden="true"/);
    expect(accessibleText(textLink?.[2] ?? "")).toBe("https://join.example/game/AB12CD");
  });

  it("draws the join link as an inline QR code that stays on one page", () => {
    const html = renderMarkup(<SeatCard card={CARD} />);

    expect(html).toMatch(/<svg[^>]*>/);
    expect(html).toContain("<title>QR code for https://join.example/game/AB12CD</title>");
    expect(html).toMatch(/<article[^>]*class="[^"]*break-inside-avoid/);
  });
});
