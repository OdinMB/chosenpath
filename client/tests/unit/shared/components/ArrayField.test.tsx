import { ArrayField } from "../../../../src/shared/components/ArrayField";
import { namesByRole, renderMarkup } from "../../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);

/*
 * A list field in the World editor (Rules, Tone, Facts, ...) adds an entry
 * with an icon-only "+" button: a screen reader names it for the list it adds
 * to, as it names the list's info icon and remove buttons. First paint.
 */

const none = () => undefined;

describe("ArrayField button names", () => {
  it("names the add button for the list its title names", () => {
    const html = renderMarkup(
      <ArrayField title="Rules" items={["Magic has a price"]} onChange={none} />
    );

    expect(namesByRole(html, "button")).toEqual(["Add to rules", "Remove rules 1"]);
  });

  it("names the buttons by the list's label when its title is markup", () => {
    const html = renderMarkup(
      <ArrayField
        title={<span>Switch and Thread Instructions</span>}
        label="Switch and Thread Instructions"
        tooltipText="When to switch threads"
        items={["Switch after a cliffhanger"]}
        onChange={none}
      />
    );

    expect(namesByRole(html, "button")).toEqual([
      "About switch and thread instructions",
      "Add to switch and thread instructions",
      "Remove switch and thread instructions 1",
    ]);
  });

  it("names the add button of a list with neither title nor label", () => {
    const html = renderMarkup(<ArrayField items={[]} onChange={none} />);

    expect(namesByRole(html, "button")).toEqual(["Add to the list"]);
  });

  it("leaves the name to the add button's text where it shows some", () => {
    const html = renderMarkup(
      <ArrayField title="Rules" items={[]} onChange={none} buttonText="Add a rule" />
    );

    expect(namesByRole(html, "button")).toEqual(["Add a rule"]);
  });

  it("shows no buttons on a read-only list", () => {
    const html = renderMarkup(
      <ArrayField title="Rules" items={["Magic has a price"]} readOnly />
    );

    expect(namesByRole(html, "button")).toEqual([]);
  });
});
