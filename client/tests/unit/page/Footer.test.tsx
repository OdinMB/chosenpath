import { Footer } from "../../../src/page/components/Footer";
import { attribute, openingTag, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
}));

describe("Footer icon links", () => {
  it.each([
    ["https://odins.website", "Odin Mühlenbein's website"],
    ["https://www.linkedin.com/in/odinmuehlenbein/", "Odin Mühlenbein on LinkedIn"],
    ["https://ko-fi.com/OdinMB", "Support us on Ko-fi"],
  ])("names the icon-only link to %s and hides its icon", (href, name) => {
    const html = renderMarkup(<Footer />);

    const tag = openingTag(html, "a", "href", href);
    expect(attribute(tag, "aria-label")).toBe(name);
    // The link holds nothing but the icon, hidden from screen readers
    const inner = html.slice(html.indexOf(tag) + tag.length).split("</a>")[0];
    expect(inner).toMatch(/^<span aria-hidden="true"><svg[\s\S]*<\/svg><\/span>$/);
  });
});
