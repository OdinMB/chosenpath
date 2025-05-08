import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import { UserStoryCodeAssociation, StoryMetadata } from "core/types/api.js";

/**
 * Get all story codes associated with a user
 */
export async function getUserStoryCodes(
  userId: string
): Promise<UserStoryCodeAssociation[]> {
  try {
    const db = getDb();

    const codes = await db.all<UserStoryCodeAssociation[]>(
      `SELECT 
        userId, storyId, playerSlot, code, createdAt, lastPlayedAt 
       FROM user_story_codes 
       WHERE userId = ?
       ORDER BY lastPlayedAt DESC`,
      userId
    );

    return codes || [];
  } catch (error) {
    Logger.Route.error(`Failed to get story codes for user ${userId}`, error);
    throw new Error("Failed to retrieve user story codes");
  }
}

/**
 * Associate a story code with a user
 */
export async function associateStoryCode(
  userId: string,
  storyId: string,
  playerSlot: string,
  code: string
): Promise<UserStoryCodeAssociation> {
  try {
    const db = getDb();
    const now = Date.now();

    // Check if story exists first
    const story = await db.get("SELECT id FROM stories WHERE id = ?", storyId);

    if (!story) {
      // Insert story metadata record with minimal information
      // The full story data remains in the file system
      await db.run(
        `INSERT INTO stories (id, title, createdAt, updatedAt, maxTurns, generateImages, creatorId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        storyId,
        "Unknown Story",
        now,
        now,
        10,
        true,
        null
      );
    }

    // Check if association already exists
    const existing = await db.get(
      `SELECT userId FROM user_story_codes 
       WHERE userId = ? AND storyId = ? AND playerSlot = ?`,
      userId,
      storyId,
      playerSlot
    );

    if (existing) {
      // Update existing association
      await db.run(
        `UPDATE user_story_codes 
         SET lastPlayedAt = ? 
         WHERE userId = ? AND storyId = ? AND playerSlot = ?`,
        now,
        userId,
        storyId,
        playerSlot
      );
    } else {
      // Create new association
      await db.run(
        `INSERT INTO user_story_codes 
         (userId, storyId, playerSlot, code, createdAt, lastPlayedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        userId,
        storyId,
        playerSlot,
        code,
        now,
        now
      );
    }

    // Return the association data
    return {
      userId,
      storyId,
      playerSlot,
      code,
      createdAt: now,
      lastPlayedAt: now,
    };
  } catch (error) {
    Logger.Route.error(
      `Failed to associate story code for user ${userId}`,
      error
    );
    throw new Error("Failed to associate story code with user");
  }
}

/**
 * Get all stories created by a user
 */
export async function getUserStories(userId: string): Promise<StoryMetadata[]> {
  try {
    const db = getDb();

    const stories = await db.all<StoryMetadata[]>(
      `SELECT 
        id, title, templateId, createdAt, updatedAt, maxTurns, generateImages, creatorId
       FROM stories 
       WHERE creatorId = ?
       ORDER BY updatedAt DESC`,
      userId
    );

    return stories || [];
  } catch (error) {
    Logger.Route.error(`Failed to get stories for user ${userId}`, error);
    throw new Error("Failed to retrieve user stories");
  }
}

/**
 * Update the last played time for a user's story code
 */
export async function updateLastPlayedTime(
  userId: string,
  storyId: string,
  playerSlot: string
): Promise<void> {
  try {
    const db = getDb();
    const now = Date.now();

    await db.run(
      `UPDATE user_story_codes 
       SET lastPlayedAt = ? 
       WHERE userId = ? AND storyId = ? AND playerSlot = ?`,
      now,
      userId,
      storyId,
      playerSlot
    );
  } catch (error) {
    Logger.Route.error(
      `Failed to update last played time for user ${userId}, story ${storyId}`,
      error
    );
    throw new Error("Failed to update last played time");
  }
}
