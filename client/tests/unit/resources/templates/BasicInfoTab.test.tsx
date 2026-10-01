import { KID_AGES_HINT } from "core/types";
import type { KidAges } from "core/types";
import { BasicInfoTab } from "../../../../src/resources/templates/components/BasicInfoTab";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);

/*
 * The template editor's read-with-kids setting (the owner's decision of
 * 2026-10-01): a template tagged Kids gets the same ages field as the setup
 * form, one age or a range, and its stories inherit it. First paint only.
 */

function render(tags: string[], kidAges?: KidAges | null): string {
  const none = () => undefined;
  return renderMarkup(
    <BasicInfoTab
      title="The Burrow"
      setTitle={none}
      teaser=""
      setTeaser={none}
      playerCountMin={1}
      playerCountMax={2}
      setPlayerCountMin={none}
      setPlayerCountMax={none}
      handleGameModeChange={none}
      maxTurnsMin={10}
      maxTurnsMax={15}
      setMaxTurnsMin={none}
      setMaxTurnsMax={none}
      tags={tags}
      showOnWelcomeScreen={false}
      difficultyLevels={[]}
      handleDifficultyLevelsChange={none}
      getMinPlayerOptions={() => [1]}
      getMaxPlayerOptions={() => [1, 2]}
      getMinTurnsOptions={() => [10]}
      getMaxTurnsOptions={() => [15]}
      gameModeOptions={[{ value: 0, label: "Shared Goals" }]}
      getGameModeValue={() => 0}
      kidAges={kidAges}
      handleKidAgesChange={none}
    />
  );
}

const ageInput = (html: string) => /<input[^>]*id="template-kid-ages"[^>]*>/.exec(html)?.[0];

describe("BasicInfoTab: the children's ages on a Kids template", () => {
  it("shows the field with the template's ages on a template tagged Kids", () => {
    const html = render(["Fiction", "Kids"], { min: 6, max: 8 });
    expect(accessibleText(html)).toContain("Children's ages");
    expect(ageInput(html)).toContain('value="6-8"');
    expect(ageInput(html)).toContain('placeholder="5 or 8-10"');
    expect(accessibleText(html)).not.toContain(KID_AGES_HINT);
  });

  it("shows one age as the age alone, and an empty field where the template has none", () => {
    expect(ageInput(render(["kids"], { min: 7, max: 7 }))).toContain('value="7"');
    expect(ageInput(render(["Kids"], null))).toContain('value=""');
    expect(ageInput(render(["Kids"]))).toContain('value=""');
  });

  it("has no ages field on a template not tagged Kids", () => {
    const html = render(["Fiction"], { min: 6, max: 8 });
    expect(ageInput(html)).toBeUndefined();
    expect(accessibleText(html)).not.toContain("Children's ages");
  });
});
