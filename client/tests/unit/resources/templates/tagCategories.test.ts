import {
  TAG_CATEGORIES,
  findTagCategory,
  groupTagsByCategories,
  sortTagsByCategory,
} from "../../../../src/resources/templates/tagCategories";

describe("findTagCategory", () => {
  it("names the category a tag belongs to", () => {
    expect(findTagCategory("Kids")).toBe("Category");
    expect(findTagCategory("Mystery")).toBe("Genre");
    expect(findTagCategory("Sci-Fi")).toBe("Setting");
    expect(findTagCategory("Cozy")).toBe("Tone");
  });

  it("returns null for a tag in no category", () => {
    expect(findTagCategory("Western")).toBeNull();
  });
});

describe("groupTagsByCategories", () => {
  it("puts each tag under its category and the rest under Other", () => {
    expect(
      groupTagsByCategories(["Cozy", "Fantasy", "Kids", "Mystery", "Western", "Dark"])
    ).toEqual({
      Category: ["Kids"],
      Genre: ["Mystery"],
      Setting: ["Fantasy"],
      Tone: ["Cozy", "Dark"],
      Other: ["Western"],
    });
  });

  it("lists the categories in their defined order, Other last, and leaves out empty ones", () => {
    const groups = groupTagsByCategories(["Western", "Tense", "Learning"]);

    expect(Object.keys(groups)).toEqual(["Category", "Tone", "Other"]);
  });

  it("returns no categories for no tags", () => {
    expect(groupTagsByCategories([])).toEqual({});
  });
});

describe("sortTagsByCategory", () => {
  it("orders tags by category: Category, Genre, Setting, Tone, then uncategorised", () => {
    expect(
      sortTagsByCategory(["Western", "Cozy", "Fantasy", "Mystery", "Kids"])
    ).toEqual(["Kids", "Mystery", "Fantasy", "Cozy", "Western"]);
  });

  it("keeps the given order within a category and among uncategorised tags", () => {
    expect(
      sortTagsByCategory(["Zombie", "Tense", "Cozy", "Alien", "Dark"])
    ).toEqual(["Tense", "Cozy", "Dark", "Zombie", "Alien"]);
  });

  it("returns a new array and leaves the given one unchanged", () => {
    const tags = ["Cozy", "Kids"];

    const sorted = sortTagsByCategory(tags);

    expect(sorted).toEqual(["Kids", "Cozy"]);
    expect(tags).toEqual(["Cozy", "Kids"]);
  });

  it("knows the categories the library groups tags by", () => {
    expect(TAG_CATEGORIES.map((category) => category.name)).toEqual([
      "Category",
      "Genre",
      "Setting",
      "Tone",
    ]);
  });
});
