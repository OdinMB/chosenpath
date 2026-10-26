import { SeatCard } from "../../../src/users/stories/SeatCard";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";

/*
 * A printed seat card is all a student gets: it has to carry the group, the
 * code, the link and a scannable QR code of the link, on one piece of paper.
 */

const CARD = {
  storyId: "story-1",
  storyTitle: "The Lighthouse",
  groupNumber: 4,
  code: "AB12CD",
  joinLink: "https://join.example/game/AB12CD",
};

describe("SeatCard", () => {
  it("prints the group, the story, the code and the join link", () => {
    const text = accessibleText(renderMarkup(<SeatCard card={CARD} />));

    expect(text).toContain("Group 4");
    expect(text).toContain("The Lighthouse");
    expect(text).toContain("AB12CD");
    expect(text).toContain("https://join.example/game/AB12CD");
  });

  it("draws the join link as an inline QR code that stays on one page", () => {
    const html = renderMarkup(<SeatCard card={CARD} />);

    expect(html).toMatch(/<svg[^>]*>/);
    expect(html).toContain("<title>QR code for https://join.example/game/AB12CD</title>");
    expect(html).toMatch(/<article[^>]*class="[^"]*break-inside-avoid/);
  });
});
