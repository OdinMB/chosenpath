export type TagCategory = {
  name: string;
  tags: string[];
};

export const TAG_CATEGORIES: TagCategory[] = [
  {
    name: "Type",
    tags: ["Novella", "Simulation"],
  },
  {
    name: "Motivation",
    tags: ["Satire"],
  },
  {
    name: "Genre",
    tags: ["Adventure", "Crime", "Mystery"],
  },
  {
    name: "Setting",
    tags: ["Fantasy", "Sci-Fi", "Wild West"],
  },
  {
    name: "Tone",
    tags: ["Contemplative", "Humor", "Surreal"],
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
