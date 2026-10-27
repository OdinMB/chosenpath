import { ShareLink } from "../../../../src/shared/components/ShareLink";
import { accessibleText, allByRole, renderMarkup } from "../../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);

/*
 * The share button on a World's page and in its editor is an icon: a screen
 * reader names it for what it shares, also where it shows no text.
 */

type WithWindow = { window?: unknown };

// The button builds its link from the page's address; Node has no window
beforeAll(() => {
  (globalThis as WithWindow).window = { location: { origin: "https://play.example" } };
});
afterAll(() => {
  delete (globalThis as WithWindow).window;
});

describe("ShareLink button name", () => {
  it("names the icon-only outline button on a World's page", () => {
    const html = renderMarkup(<ShareLink templateId="world-1" buttonVariant="primary-outline" />);

    expect(allByRole(html, "button").map((button) => button.name)).toEqual(["Share this World"]);
  });

  it("keeps the visible text in the name of the outline button that shows it", () => {
    const html = renderMarkup(
      <ShareLink templateId="world-1" buttonVariant="primary-outline" showText />
    );

    expect(allByRole(html, "button").map((button) => button.name)).toEqual(["Share this World"]);
    expect(accessibleText(html)).toBe("Share");
  });

  it("names the editor's icon button the way its hover text does", () => {
    const html = renderMarkup(<ShareLink templateId="world-1" />);

    expect(allByRole(html, "button")).toEqual([
      { name: "Share this World", title: "Share this World" },
    ]);
  });
});
