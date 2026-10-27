import { ExpandableItem } from "../../../../src/shared/components/ExpandableItem";
import { StatGroupEditor } from "../../../../src/resources/templates/components/StatGroupEditor";
import { StatListItem } from "../../../../src/resources/templates/components/StatListItem";
import type { Stat } from "core/types";
import { attribute, renderMarkup } from "../../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
// The stat form reads import.meta.env too; a collapsed stat never shows it
jest.mock("../../../../src/resources/templates/components/StatEditor", () => ({
  StatEditor: () => null,
}));

/*
 * An expandable item's buttons say which item they act on ("Edit Tags"), also
 * when its title is markup rather than text: then its label names it, where
 * the title used to be read out as "Edit [object Object]". First paint, so
 * collapsed.
 */

const none = () => undefined;

/** The accessible names of the markup's buttons that carry an aria-label, in order. */
const buttonNames = (html: string) =>
  Array.from(html.matchAll(/<button\b[^>]*>/g), (match) => attribute(match[0], "aria-label")).filter(
    (name): name is string => name !== undefined
  );

const icon = <svg />;

describe("ExpandableItem button names", () => {
  it("names each button after a title in plain text", () => {
    const html = renderMarkup(
      <ExpandableItem
        id="background_0"
        title="Sasha Reed"
        data={{}}
        editingSet={new Set()}
        setEditing={none}
        onDelete={none}
        onSave={none}
        renderEditForm={() => null}
        actionIcons={[{ icon, onClick: none }]}
      />
    );

    expect(buttonNames(html)).toEqual(["Edit Sasha Reed", "Action for Sasha Reed", "Remove Sasha Reed"]);
  });

  it("names each button by its label when the title is markup, and still shows the markup", () => {
    const html = renderMarkup(
      <ExpandableItem
        id="tags"
        title={<span className="font-semibold">Tags</span>}
        label="Tags"
        data={{}}
        editingSet={new Set()}
        setEditing={none}
        onDelete={none}
        onSave={none}
        renderEditForm={() => null}
        actionIcons={[{ icon, onClick: none }]}
      />
    );

    expect(buttonNames(html)).toEqual(["Edit Tags", "Action for Tags", "Remove Tags"]);
    expect(html).toContain('<span class="font-semibold">Tags</span>');
    expect(html).not.toContain("[object Object]");
  });

  it("keeps an action icon's own name", () => {
    const html = renderMarkup(
      <ExpandableItem
        id="identity_0"
        title="Juno Marsh"
        data={{}}
        editingSet={new Set()}
        setEditing={none}
        onDelete={none}
        onSave={none}
        renderEditForm={() => null}
        actionIcons={[{ icon, onClick: none, ariaLabel: "Generate new image for Juno Marsh" }]}
      />
    );

    expect(buttonNames(html)).toContain("Generate new image for Juno Marsh");
  });

  it("names the expand button of a read-only item after it", () => {
    const html = renderMarkup(
      <ExpandableItem
        id="tags"
        title={<span className="font-semibold">Tags</span>}
        label="Tags"
        data={{}}
        editingSet={new Set()}
        setEditing={none}
        onDelete={none}
        onSave={none}
        renderEditForm={() => null}
        readOnly
      />
    );

    expect(buttonNames(html)).toEqual(["Expand Tags"]);
  });
});

function stat(name: string): Stat {
  return {
    type: "percentage",
    name,
    id: "shared_courage",
    possibleValues: "",
    effectOnPoints: [],
    optionsToSacrifice: "None",
    optionsToGainAsReward: "None",
    canBeChangedInBeatResolutions: true,
    narrativeImplications: [],
    adjustmentsAfterThreads: [],
    isVisible: true,
    partOfPlayerBackgrounds: false,
    initialValue: 50,
    tooltip: "",
    group: "Spirit",
  };
}

describe("the World editor's items whose titles are markup", () => {
  it("names a stat's buttons after the stat", () => {
    const html = renderMarkup(
      <StatListItem stat={stat("Courage")} type="shared" index={0} onEdit={none} onConvert={none} onDelete={none} />
    );

    expect(buttonNames(html)).toEqual(["Edit Courage", "Convert Courage to player stat", "Remove Courage"]);
  });

  it("names a stat group's buttons after the group", () => {
    const html = renderMarkup(
      <StatGroupEditor
        statGroups={["Spirit"]}
        onChange={none}
        sharedStats={[{ id: "shared_courage", name: "Courage", group: "Spirit" }]}
      />
    );

    expect(buttonNames(html)).toEqual(expect.arrayContaining(["Edit Spirit", "Remove Spirit"]));
    expect(html).not.toContain("[object Object]");
  });
});
