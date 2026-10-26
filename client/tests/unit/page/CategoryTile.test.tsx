import { CategoryTile } from "../../../src/page/components/CategoryTile";
import { accessibleText, openingTag, renderMarkup } from "../../helpers/staticMarkup";

describe("CategoryTile", () => {
  it("is a button named once by its title, its image decorative", () => {
    const html = renderMarkup(
      <CategoryTile image="/category-fiction.jpeg" title="Enjoy Fiction" onClick={jest.fn()} />
    );

    expect(html).toMatch(/^<div[^>]*role="button"/);
    expect(openingTag(html, "img", "src", "/category-fiction.jpeg")).toContain('alt=""');
    expect(accessibleText(html)).toBe("Enjoy Fiction");
  });
});
