import { categoryFromTemplateTags } from "../../../../src/game/services/StoryStateFactory.js";

describe("categoryFromTemplateTags", () => {
  it("treats a template tagged Kids as a read-with-kids story, whatever the case", () => {
    expect(categoryFromTemplateTags(["Fiction", "Kids"])).toBe("read-with-kids");
    expect(categoryFromTemplateTags(["kids"])).toBe("read-with-kids");
  });

  it("gives other templates no category", () => {
    expect(categoryFromTemplateTags(["Fiction", "Satire"])).toBeUndefined();
    expect(categoryFromTemplateTags([])).toBeUndefined();
    expect(categoryFromTemplateTags(undefined)).toBeUndefined();
  });
});
