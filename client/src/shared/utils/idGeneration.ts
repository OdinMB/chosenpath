/**
 * Generates a unique ID from a name for use within a template
 * @param name The human-readable name to generate an ID from
 * @param existingIds Array of existing IDs to ensure uniqueness
 * @returns A unique, URL-safe ID based on the name
 */
export function generateIdFromName(name: string, existingIds: string[] = []): string {
  // Convert name to lowercase, remove special chars, replace spaces with underscores
  let baseId = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
    .substring(0, 30); // Reasonable length limit

  // Handle empty names or names with no valid characters
  if (!baseId) {
    baseId = 'unnamed';
  }

  // Ensure uniqueness within the template
  let finalId = baseId;
  let counter = 1;
  while (existingIds.includes(finalId)) {
    finalId = `${baseId}_${counter}`;
    counter++;
  }

  return finalId;
}

/**
 * Updates an existing ID when a name changes, preserving references
 * @param oldId The current ID (not used in generation, kept for backwards compatibility)
 * @param newName The new name to generate an ID from
 * @param existingIds Array of existing IDs (excluding the oldId)
 * @returns The new ID generated from the name
 */
export function updateIdFromName(oldId: string, newName: string, existingIds: string[]): string {
  return generateIdFromName(newName, existingIds.filter(id => id !== oldId));
}