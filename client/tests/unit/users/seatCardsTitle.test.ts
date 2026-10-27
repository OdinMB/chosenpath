import { seatCardsDocumentTitle } from "../../../src/users/stories/seatCardsTitle";

/*
 * Seat cards are saved as a PDF through the browser's print dialog, which
 * names the file after the page's title: the date and the story's name, so a
 * folder of saved cards says which is which.
 */

// 27 October 2026, late evening in local time (months count from 0)
const EVENING = new Date(2026, 9, 27, 23, 45);

describe("seatCardsDocumentTitle", () => {
  it("names the shared title once when every card's story has it", () => {
    expect(seatCardsDocumentTitle(["The Lighthouse", "The Lighthouse", "The Lighthouse"], EVENING)).toBe(
      "2026-10-27 Seat cards - The Lighthouse"
    );
  });

  it("names the first story and how many others when the titles differ", () => {
    const titles = ["The Lighthouse", "The Lighthouse", "Gitopia", "Moon Base", "Gitopia"];

    expect(seatCardsDocumentTitle(titles, EVENING)).toBe(
      "2026-10-27 Seat cards - The Lighthouse and 2 more"
    );
    expect(seatCardsDocumentTitle(["Gitopia", "Moon Base"], EVENING)).toBe(
      "2026-10-27 Seat cards - Gitopia and 1 more"
    );
  });

  it("uses the local date, padded, whatever the time of day", () => {
    expect(seatCardsDocumentTitle(["A"], new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05 Seat cards - A");
  });

  it("names no story while none is selected", () => {
    expect(seatCardsDocumentTitle([], EVENING)).toBe("2026-10-27 Seat cards");
  });

  it("leaves out characters a file name can't carry", () => {
    expect(seatCardsDocumentTitle(['Who? Me: "A/B" <test> | C\\D*', "x"], EVENING)).toBe(
      "2026-10-27 Seat cards - Who Me A B test C D and 1 more"
    );
    // Control characters and trailing dots, which Windows drops or refuses
    expect(seatCardsDocumentTitle(["Line\none\ttwo..."], EVENING)).toBe(
      "2026-10-27 Seat cards - Line one two"
    );
  });

  it("names no story when nothing of its title is left", () => {
    expect(seatCardsDocumentTitle(["???", "???"], EVENING)).toBe("2026-10-27 Seat cards");
  });

  it("shortens a very long title so the file name stays usable", () => {
    const title = seatCardsDocumentTitle(["A".repeat(300)], EVENING);

    expect(title.startsWith("2026-10-27 Seat cards - AAA")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(120);
  });
});
