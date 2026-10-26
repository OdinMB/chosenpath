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

  it("draws the join link as an inline QR code that stays on one page", () => {
    const html = renderMarkup(<SeatCard card={CARD} />);

    expect(html).toMatch(/<svg[^>]*>/);
    expect(html).toContain("<title>QR code for https://join.example/game/AB12CD</title>");
    expect(html).toMatch(/<article[^>]*class="[^"]*break-inside-avoid/);
  });
});
