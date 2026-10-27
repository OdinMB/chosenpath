import { swapDocumentTitle } from "../../../src/shared/utils/documentTitle";

/*
 * A page that names the browser tab (and the PDF saved from it) for as long
 * as it is open, then gives the previous title back.
 */

describe("swapDocumentTitle", () => {
  it("sets the title and restores the previous one when undone", () => {
    const doc = { title: "Chosen Path" };

    const restore = swapDocumentTitle(doc, "2026-10-27 Seat cards");
    expect(doc.title).toBe("2026-10-27 Seat cards");

    restore();
    expect(doc.title).toBe("Chosen Path");
  });

  it("returns to the page's original title after several changes", () => {
    // As an effect does: undo the last title, then set the next one
    const doc = { title: "Chosen Path" };

    let restore = swapDocumentTitle(doc, "first");
    restore();
    restore = swapDocumentTitle(doc, "second");
    expect(doc.title).toBe("second");

    restore();
    expect(doc.title).toBe("Chosen Path");
  });
});
