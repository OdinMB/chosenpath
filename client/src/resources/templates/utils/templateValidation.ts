import { StoryTemplate, CharacterBackground } from "core/types";
import { TemplateImageManifest } from "core/types/api";

export interface ValidationIssue {
  type: "error" | "warning" | "info";
  category: "stats" | "backgrounds" | "general" | "images";
  message: string;
  affectedItems?: string[];
  autoFixable?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  stats: {
    totalIssues: number;
    errors: number;
    warnings: number;
    info: number;
  };
}

/**
 * Validates template integrity and identifies potential issues
 */
export const validateTemplateIntegrity = (
  template: StoryTemplate,
  imageManifest?: TemplateImageManifest
): ValidationResult => {
  const issues: ValidationIssue[] = [];

  // Check if template is sparse and add warning
  issues.push(...validateTemplateCompleteness(template));

  // Validate stat definitions
  issues.push(...validateStatDefinitions(template));

  // Validate background completeness
  issues.push(...validateBackgroundCompleteness(template));

  // Validate stat references
  issues.push(...validateStatReferences(template));

  // Validate image requirements if manifest is provided
  // Check images regardless of containsImages flag to catch missing required images
  if (imageManifest) {
    issues.push(...validateImageRequirements(template, imageManifest));
  }

  // Calculate statistics
  const stats = {
    totalIssues: issues.length,
    errors: issues.filter((i) => i.type === "error").length,
    warnings: issues.filter((i) => i.type === "warning").length,
    info: issues.filter((i) => i.type === "info").length,
  };

  return {
    isValid: stats.errors === 0,
    issues,
    stats,
  };
};

/**
 * Validates template completeness (checks if template is sparse)
 */
const validateTemplateCompleteness = (
  template: StoryTemplate
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  const noStoryElements = (template.storyElements || []).length === 0;
  const noGuidelines =
    !template.guidelines ||
    (!template.guidelines.world &&
      (!template.guidelines.rules || template.guidelines.rules.length === 0) &&
      (!template.guidelines.tone || template.guidelines.tone.length === 0) &&
      (!template.guidelines.conflicts ||
        template.guidelines.conflicts.length === 0) &&
      (!template.guidelines.decisions ||
        template.guidelines.decisions.length === 0));

  // Check for named player identities (using same logic as useTemplateForm)
  const hasNamedIdentity = Object.keys(template).some((key) => {
    if (!key.startsWith("player")) return false;
    const player = (template as unknown as Record<string, unknown>)[key] as
      | {
          possibleCharacterIdentities?: Array<{ name?: string }>;
        }
      | undefined;
    const identities = player?.possibleCharacterIdentities || [];
    return identities.some(
      (id) => id?.name && String(id.name).trim().length > 0
    );
  });

  // Check for meaningful stats (same logic as useTemplateForm)
  const noStats =
    (!template.sharedStats || template.sharedStats.length === 0) &&
    (!template.playerStats || template.playerStats.length === 0);

  const noPlayerIdentityNames = !hasNamedIdentity;
  const isSparse =
    noStoryElements || noPlayerIdentityNames || noGuidelines || noStats;

  if (isSparse) {
    issues.push({
      type: "warning",
      category: "general",
      message:
        "This World needs a bit more love before it's playable. Add some story elements, guidelines, and player identities to make this World ready for play.",
      affectedItems: [],
      autoFixable: false,
    });
  }

  return issues;
};

/**
 * Validates stat definitions for consistency and completeness
 */
const validateStatDefinitions = (
  template: StoryTemplate
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const allStats = [...template.playerStats, ...template.sharedStats];

  // Check for duplicate stat IDs
  const statIds = allStats.map((stat) => stat.id);
  const duplicateIds = statIds.filter(
    (id, index) => statIds.indexOf(id) !== index
  );
  if (duplicateIds.length > 0) {
    issues.push({
      type: "error",
      category: "stats",
      message: `Duplicate stat IDs found: ${[...new Set(duplicateIds)].join(
        ", "
      )}`,
      affectedItems: duplicateIds,
      autoFixable: false,
    });
  }

  // Check for missing initialValue on universal player stats
  template.playerStats.forEach((stat) => {
    if (
      stat.partOfPlayerBackgrounds === false &&
      (stat.initialValue === undefined || stat.initialValue === null)
    ) {
      issues.push({
        type: "error",
        category: "stats",
        message: `Player stat "${stat.name}" has partOfPlayerBackgrounds=false but no initialValue`,
        affectedItems: [stat.id],
        autoFixable: true,
      });
    }
  });

  // Check for invalid stat types
  allStats.forEach((stat) => {
    const validTypes = [
      "string",
      "string[]",
      "percentage",
      "opposites",
      "number",
    ];
    if (!validTypes.includes(stat.type)) {
      issues.push({
        type: "error",
        category: "stats",
        message: `Stat "${stat.name}" has invalid type: ${stat.type}`,
        affectedItems: [stat.id],
        autoFixable: false,
      });
    }
  });

  // Check for missing stat groups
  const usedGroups = new Set(allStats.map((stat) => stat.group));
  const definedGroups = new Set(template.statGroups);
  const missingGroups = Array.from(usedGroups).filter(
    (group) => !definedGroups.has(group)
  );
  if (missingGroups.length > 0) {
    issues.push({
      type: "warning",
      category: "stats",
      message: `Stats reference undefined groups: ${missingGroups.join(", ")}`,
      affectedItems: missingGroups,
      autoFixable: true,
    });
  }

  return issues;
};

/**
 * Validates that all character backgrounds have complete stat coverage
 */
const validateBackgroundCompleteness = (
  template: StoryTemplate
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Get stats that should be in backgrounds
  const backgroundStatIds = template.playerStats
    .filter((stat) => stat.partOfPlayerBackgrounds !== false)
    .map((stat) => stat.id);

  if (backgroundStatIds.length === 0) {
    return issues; // No background stats to validate
  }

  // Check each player's backgrounds
  Object.entries(template).forEach(([key, playerOptions]) => {
    if (
      key.startsWith("player") &&
      typeof playerOptions === "object" &&
      "possibleCharacterBackgrounds" in playerOptions
    ) {
      const typedPlayerOptions = playerOptions as {
        possibleCharacterBackgrounds: CharacterBackground[];
      };
      typedPlayerOptions.possibleCharacterBackgrounds.forEach((background) => {
        const existingStatIds = background.initialPlayerStatValues.map(
          (sv) => sv.statId
        );

        // Check for missing stats
        const missingStats = backgroundStatIds.filter(
          (id) => !existingStatIds.includes(id)
        );
        if (missingStats.length > 0) {
          issues.push({
            type: "error",
            category: "backgrounds",
            message: `Background "${
              background.title
            }" in ${key} is missing stats: ${missingStats.join(", ")}`,
            affectedItems: [background.title],
            autoFixable: true,
          });
        }

        // Check for orphaned stats (stats that shouldn't be in backgrounds)
        const orphanedStats = existingStatIds.filter(
          (id) => !backgroundStatIds.includes(id)
        );
        if (orphanedStats.length > 0) {
          issues.push({
            type: "warning",
            category: "backgrounds",
            message: `Background "${
              background.title
            }" has orphaned stats: ${orphanedStats.join(", ")}`,
            affectedItems: [background.title],
            autoFixable: true,
          });
        }

        // Check for duplicate stat entries within background
        const duplicateStatIds = existingStatIds.filter(
          (id, index) => existingStatIds.indexOf(id) !== index
        );
        if (duplicateStatIds.length > 0) {
          issues.push({
            type: "error",
            category: "backgrounds",
            message: `Background "${
              background.title
            }" has duplicate stat entries: ${Array.from(
              new Set(duplicateStatIds)
            ).join(", ")}`,
            affectedItems: [background.title],
            autoFixable: true,
          });
        }
      });
    }
  });

  return issues;
};

/**
 * Validates that all stat references are valid
 */
const validateStatReferences = (template: StoryTemplate): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const allStatIds = new Set(
    [...template.playerStats, ...template.sharedStats].map((stat) => stat.id)
  );

  // Check background stat references
  Object.entries(template).forEach(([key, playerOptions]) => {
    if (
      key.startsWith("player") &&
      typeof playerOptions === "object" &&
      "possibleCharacterBackgrounds" in playerOptions
    ) {
      const typedPlayerOptions = playerOptions as {
        possibleCharacterBackgrounds: CharacterBackground[];
      };
      typedPlayerOptions.possibleCharacterBackgrounds.forEach((background) => {
        background.initialPlayerStatValues.forEach((sv) => {
          if (!allStatIds.has(sv.statId)) {
            issues.push({
              type: "error",
              category: "stats",
              message: `Background "${background.title}" references non-existent stat: ${sv.statId}`,
              affectedItems: [background.title, sv.statId],
              autoFixable: true,
            });
          }
        });
      });
    }
  });

  return issues;
};

/**
 * Attempts to auto-fix fixable validation issues
 */
export const autoFixTemplate = (
  template: StoryTemplate,
  issues: ValidationIssue[]
): StoryTemplate => {
  const fixedTemplate = { ...template };
  const fixableIssues = issues.filter((issue) => issue.autoFixable);

  console.log(`Auto-fixing ${fixableIssues.length} template issues`);

  // Process each fixable issue
  fixableIssues.forEach((issue) => {
    // Fix missing initialValue on universal player stats
    if (
      issue.category === "stats" &&
      issue.message.includes(
        "partOfPlayerBackgrounds=false but no initialValue"
      )
    ) {
      fixedTemplate.playerStats = fixedTemplate.playerStats.map((stat) => {
        if (
          issue.affectedItems?.includes(stat.id) &&
          stat.partOfPlayerBackgrounds === false &&
          (stat.initialValue === undefined || stat.initialValue === null)
        ) {
          const defaultValue =
            stat.type === "string" ? "" : stat.type === "string[]" ? [] : 50;
          console.log(`Fixed missing initialValue for stat ${stat.name}`);
          return { ...stat, initialValue: defaultValue };
        }
        return stat;
      });
    }

    // Fix missing stat groups
    if (
      issue.category === "stats" &&
      issue.message.includes("Stats reference undefined groups")
    ) {
      const usedGroups = new Set(
        [...fixedTemplate.playerStats, ...fixedTemplate.sharedStats].map(
          (stat) => stat.group
        )
      );
      const definedGroups = new Set(fixedTemplate.statGroups);
      const missingGroups = Array.from(usedGroups).filter(
        (group) =>
          !definedGroups.has(group) && issue.affectedItems?.includes(group)
      );
      if (missingGroups.length > 0) {
        fixedTemplate.statGroups = [
          ...fixedTemplate.statGroups,
          ...missingGroups,
        ];
        console.log(`Added missing stat groups: ${missingGroups.join(", ")}`);
      }
    }

    // Fix missing stats in backgrounds
    if (
      issue.category === "backgrounds" &&
      issue.message.includes("is missing stats:")
    ) {
      const backgroundStatIds = fixedTemplate.playerStats
        .filter((stat) => stat.partOfPlayerBackgrounds !== false)
        .map((stat) => stat.id);

      Object.entries(fixedTemplate).forEach(([key, playerOptions]) => {
        if (
          key.startsWith("player") &&
          typeof playerOptions === "object" &&
          "possibleCharacterBackgrounds" in playerOptions
        ) {
          const typedPlayerOptions = playerOptions as {
            possibleCharacterBackgrounds: CharacterBackground[];
          };

          const updatedPlayerOptions = {
            ...typedPlayerOptions,
            possibleCharacterBackgrounds:
              typedPlayerOptions.possibleCharacterBackgrounds.map(
                (background) => {
                  if (issue.affectedItems?.includes(background.title)) {
                    const existingStatIds =
                      background.initialPlayerStatValues.map((sv) => sv.statId);
                    const missingStats = backgroundStatIds.filter(
                      (id) => !existingStatIds.includes(id)
                    );

                    const newStatValues = [
                      ...background.initialPlayerStatValues,
                    ];
                    missingStats.forEach((statId) => {
                      const stat = fixedTemplate.playerStats.find(
                        (s) => s.id === statId
                      );
                      if (stat) {
                        let defaultValue: number | string | string[];
                        if (stat.type === "string") {
                          defaultValue = "";
                        } else if (stat.type === "string[]") {
                          defaultValue = [];
                        } else {
                          defaultValue = 50;
                        }
                        newStatValues.push({
                          statId,
                          value: defaultValue,
                        });
                      }
                    });

                    return {
                      ...background,
                      initialPlayerStatValues: newStatValues,
                    };
                  }
                  return background;
                }
              ),
          };
          Object.assign(fixedTemplate, { [key]: updatedPlayerOptions });
        }
      });
    }

    // Fix orphaned stats in backgrounds
    if (
      issue.category === "backgrounds" &&
      issue.message.includes("has orphaned stats:")
    ) {
      const backgroundStatIds = fixedTemplate.playerStats
        .filter((stat) => stat.partOfPlayerBackgrounds !== false)
        .map((stat) => stat.id);

      Object.entries(fixedTemplate).forEach(([key, playerOptions]) => {
        if (
          key.startsWith("player") &&
          typeof playerOptions === "object" &&
          "possibleCharacterBackgrounds" in playerOptions
        ) {
          const typedPlayerOptions = playerOptions as {
            possibleCharacterBackgrounds: CharacterBackground[];
          };

          const updatedPlayerOptions = {
            ...typedPlayerOptions,
            possibleCharacterBackgrounds:
              typedPlayerOptions.possibleCharacterBackgrounds.map(
                (background) => {
                  if (issue.affectedItems?.includes(background.title)) {
                    return {
                      ...background,
                      initialPlayerStatValues:
                        background.initialPlayerStatValues.filter((sv) =>
                          backgroundStatIds.includes(sv.statId)
                        ),
                    };
                  }
                  return background;
                }
              ),
          };
          Object.assign(fixedTemplate, { [key]: updatedPlayerOptions });
        }
      });
    }
  });

  return fixedTemplate;
};

/**
 * Validates image requirements when containsImages is enabled
 */
const validateImageRequirements = (
  _template: StoryTemplate,
  manifest: TemplateImageManifest
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  // Create single consolidated missing images warning
  const missingItems: string[] = [];
  const affectedItems: string[] = [];

  // Check cover image
  if (manifest.missingImages.cover) {
    missingItems.push("cover");
    affectedItems.push("cover");
  }

  // Check missing player identity images
  if (manifest.missingImages.playerIdentities.length > 0) {
    // Group missing identities by player slot and count
    const missingByPlayer = manifest.missingImages.playerIdentities.reduce(
      (acc, { playerSlot }) => {
        acc[playerSlot] = (acc[playerSlot] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Create display names with counts if more than one identity is missing per player
    Object.entries(missingByPlayer).forEach(([playerSlot, count]) => {
      const playerName = playerSlot.replace("player", "Player ");
      if (count === 1) {
        missingItems.push(`${playerName} identity`);
      } else {
        missingItems.push(`${playerName} (${count} identities)`);
      }
      affectedItems.push(playerSlot);
    });
  }

  // Check missing story element images
  if (manifest.missingImages.storyElements.length > 0) {
    const elementCount = manifest.missingImages.storyElements.length;
    missingItems.push(
      `Element${elementCount > 1 ? "s" : ""} (${elementCount})`
    );
    affectedItems.push(...manifest.missingImages.storyElements);
  }

  // Add single warning if any images are missing
  if (missingItems.length > 0) {
    issues.push({
      type: "warning",
      category: "images",
      message: `Missing images: ${missingItems.join(", ")}`,
      affectedItems,
      autoFixable: false,
    });
  }

  return issues;
};
