export type TagCategory = {
  name: string;
  tags: string[];
};

export const TAG_CATEGORIES: TagCategory[] = [
  {
    name: "Category",
    tags: ["Fiction", "Kids", "Satire", "Pretend to be"],
  },
  {
    name: "Genre",
    tags: [
      "Adventure",
      "Comedy",
      "Crime",
      "Drama",
      "Mystery",
      "Romance",
      "Slice of Life",
    ],
  },
  {
    name: "Setting",
    tags: ["Fantasy", "Glamour", "Reality", "Sci-Fi", "Wild West"],
  },
  {
    name: "Tone",
    tags: [
      "Contemplative",
      "Cozy",
      "Dark",
      "Exciting",
      "Hopeful",
      "Humorous",
      "Steamy",
      "Surreal",
      "Tense",
    ],
  },
];

/**
 * Find the category a tag belongs to
 * @param tag Tag to find category for
 * @returns Category name or null if not found
 */
export function findTagCategory(tag: string): string | null {
  for (const category of TAG_CATEGORIES) {
    if (category.tags.includes(tag)) {
      return category.name;
    }
  }
  return null;
}

/**
 * Group tags by their categories
 * @param tags List of tags to group
 * @returns Object with category names as keys and arrays of tags as values
 */
export function groupTagsByCategories(
  tags: string[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  // Initialize categories
  for (const category of TAG_CATEGORIES) {
    result[category.name] = [];
  }

  // Add "Other" category for uncategorized tags
  result["Other"] = [];

  // Distribute tags to their categories
  for (const tag of tags) {
    const category = findTagCategory(tag);
    if (category) {
      result[category].push(tag);
    } else {
      result["Other"].push(tag);
    }
  }

  // Remove empty categories
  Object.keys(result).forEach((key) => {
    if (result[key].length === 0) {
      delete result[key];
    }
  });

  return result;
}

/**
 * Sort tags according to the order of categories in TAG_CATEGORIES
 * Format tags come first, then Motivation tags, then Genre tags, etc.
 * Tags not in any category come last
 * @param tags Array of tags to sort
 * @returns Sorted array of tags
 */
export function sortTagsByCategory(tags: string[]): string[] {
  // Create a map of category indices for fast lookup
  const categoryIndices: Record<string, number> = {};
  TAG_CATEGORIES.forEach((category, index) => {
    categoryIndices[category.name] = index;
  });

  // Sort the tags based on their category's index
  return [...tags].sort((a, b) => {
    const categoryA = findTagCategory(a);
    const categoryB = findTagCategory(b);

    // If neither tag has a category, maintain original order
    if (!categoryA && !categoryB) return 0;

    // Uncategorized tags should come last
    if (!categoryA) return 1;
    if (!categoryB) return -1;

    // Sort by category index
    return categoryIndices[categoryA] - categoryIndices[categoryB];
  });
}
