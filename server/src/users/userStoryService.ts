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
        ? as userId, sp.storyId, sp.playerSlot, sp.code, s.createdAt, sp.lastPlayedAt 
       FROM story_players sp
       JOIN stories s ON sp.storyId = s.id
       WHERE sp.userId = ?
       ORDER BY sp.lastPlayedAt DESC`,
      userId,
      userId
    );

    return codes || [];
  } catch (error) {
    Logger.Route.error(`Failed to get story codes for user ${userId}`, error);
    throw new Error("Failed to retrieve user story codes");
  }
}

/**
 * Get story player details by code
 */
export async function getStoryPlayerByCode(code: string) {
  try {
    const db = getDb();

    return await db.get(
      `SELECT sp.storyId, sp.playerSlot, sp.code, sp.userId, s.createdAt, sp.lastPlayedAt
       FROM story_players sp
       JOIN stories s ON sp.storyId = s.id
       WHERE sp.code = ?`,
      code
    );
  } catch (error) {
    Logger.Route.error(`Failed to get story player for code ${code}`, error);
    throw new Error("Failed to retrieve story player information");
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
    const story = await db.get(
      "SELECT id, createdAt FROM stories WHERE id = ?",
      storyId
    );
    let storyCreatedAt = now;

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
    } else {
      storyCreatedAt = story.createdAt;
    }

    // Check if player record already exists
    const existingPlayer = await db.get(
      `SELECT code FROM story_players WHERE code = ?`,
      code
    );

    if (existingPlayer) {
      // Update existing player record
      await db.run(
        `UPDATE story_players
         SET userId = ?, lastPlayedAt = ?
         WHERE code = ?`,
        userId,
        now,
        code
      );
    } else {
      // Create new player record
      await db.run(
        `INSERT INTO story_players
         (storyId, playerSlot, code, userId, lastPlayedAt)
         VALUES (?, ?, ?, ?, ?)`,
        storyId,
        playerSlot,
        code,
        userId,
        now
      );
    }

    // Return the association data
    return {
      userId,
      storyId,
      playerSlot,
      code,
      createdAt: storyCreatedAt,
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
 * Get stories where the user is a player
 */
export async function getStoriesWithUser(
  userId: string
): Promise<StoryMetadata[]> {
  try {
    const db = getDb();

    const stories = await db.all<StoryMetadata[]>(
      `SELECT DISTINCT
        s.id, s.title, s.templateId, s.createdAt, s.updatedAt, s.maxTurns, s.generateImages, s.creatorId
       FROM stories s
       JOIN story_players sp ON s.id = sp.storyId
       WHERE sp.userId = ?
       ORDER BY sp.lastPlayedAt DESC`,
      userId
    );

    return stories || [];
  } catch (error) {
    Logger.Route.error(`Failed to get stories with user ${userId}`, error);
    throw new Error("Failed to retrieve stories with user");
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

    // Update the story_players record
    await db.run(
      `UPDATE story_players 
       SET lastPlayedAt = ? 
       WHERE storyId = ? AND playerSlot = ? AND userId = ?`,
      now,
      storyId,
      playerSlot,
      userId
    );
  } catch (error) {
    Logger.Route.error(
      `Failed to update last played time for user ${userId}, story ${storyId}`,
      error
    );
    throw new Error("Failed to update last played time");
  }
}
