import { DEFAULT_DIFFICULTY_LEVELS } from "core/utils/difficultyUtils";
import { DifficultySlider } from "../../../src/page/components/DifficultySlider";
import { attribute, openingTag, renderMarkup } from "../../helpers/staticMarkup";

describe("DifficultySlider", () => {
  const selected = DEFAULT_DIFFICULTY_LEVELS[1];

  it("is labelled by its visible label and reads out the level's name", () => {
    const html = renderMarkup(
      <DifficultySlider
        selectedDifficultyLevel={selected}
        availableDifficultyLevels={DEFAULT_DIFFICULTY_LEVELS}
        onChange={jest.fn()}
      />
    );

    const slider = openingTag(html, "input", "type", "range");
    const sliderId = attribute(slider, "id") ?? "";
    expect(sliderId).not.toBe("");
    expect(openingTag(html, "label", "for", sliderId)).not.toBe("");
    expect(attribute(slider, "value")).toBe("1");
    expect(attribute(slider, "aria-valuetext")).toBe(selected.title);
  });
});
