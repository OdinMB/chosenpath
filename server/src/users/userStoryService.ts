import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import {
  UserStoryCodeAssociation,
  StoryMetadata,
  ExtendedStoryMetadata,
  StoryPlayerEntry,
} from "core/types/api.js";

// DB Row Types now reflect snake_case from the database
interface UserStoryCodeDbRow {
  user_id: string;
  story_id: string;
  player_slot: string;
  code: string;
  created_at: string;
  last_played_at: string | null;
  is_pending: boolean;
}

interface StoryMetadataDbRow {
  id: string;
  title: string;
  template_id?: string;
  created_at: string;
  updated_at: string;
  max_turns: number;
  generate_images: boolean;
  creator_id: string | null;
  current_beat: number;
}

interface StoryPlayerEntryDbRow {
  story_id: string;
  player_slot: string;
  code: string;
  user_id: string | null;
  last_played_at: string | null;
  is_pending: boolean;
}

interface StoryPlayerDetailDbRow {
  story_id: string;
  player_slot: string;
  code: string;
  user_id: string | null;
  created_at: string;
  last_played_at: string | null;
}

interface StoryPlayerDetail {
  // DTO remains camelCase
  storyId: string;
  playerSlot: string;
  code: string;
  userId: string | null;
  createdAt: number;
  lastPlayedAt: number | null;
}

// For the ad-hoc return type of getStoryPlayerByCode (camelCase DTO-like structure)
interface StoryPlayerDetail {
  storyId: string;
  playerSlot: string;
  code: string;
  userId: string | null;
  createdAt: number; // from stories table
  lastPlayedAt: number | null; // from story_players table
}

/**
 * Get all story codes associated with a user
 */
export async function getUserStoryCodes(
  userId: string
): Promise<UserStoryCodeAssociation[]> {
  try {
    const pool = getDb();
    const result = await pool.query<UserStoryCodeDbRow>(
      `SELECT 
        $1 AS user_id, 
        sp.story_id, 
        sp.player_slot, 
        sp.code, 
        s.created_at, 
        sp.last_played_at,
        sp.is_pending
       FROM story_players sp
       JOIN stories s ON sp.story_id = s.id
       WHERE sp.user_id = $2
       ORDER BY sp.last_played_at DESC NULLS LAST`, // Added NULLS LAST for robust sorting
      [userId, userId]
    );
    return result.rows.map((row) => {
      const createdAtNum = parseInt(row.created_at, 10);
      const lastPlayedAtNum = row.last_played_at
        ? parseInt(row.last_played_at, 10)
        : null;
      return {
        userId: row.user_id,
        storyId: row.story_id,
        playerSlot: row.player_slot,
        code: row.code,
        createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
        lastPlayedAt:
          lastPlayedAtNum === null || isNaN(lastPlayedAtNum)
            ? null
            : lastPlayedAtNum,
      };
    });
  } catch (error) {
    Logger.Route.error(`Failed to get story codes for user ${userId}`, error);
    throw new Error("Failed to retrieve user story codes");
  }
}

/**
 * Get story player details by code
 */
export async function getStoryPlayerByCode(
  code: string
): Promise<StoryPlayerDetail | null> {
  try {
    const pool = getDb();
    const result = await pool.query<StoryPlayerDetailDbRow>(
      `SELECT 
        sp.story_id, 
        sp.player_slot, 
        sp.code, 
        sp.user_id, 
        s.created_at, 
        sp.last_played_at
       FROM story_players sp
       JOIN stories s ON sp.story_id = s.id
       WHERE sp.code = $1`,
      [code]
    );
    const row = result.rows[0];
    if (!row) return null;

    const createdAtNum = parseInt(row.created_at, 10);
    const lastPlayedAtNum = row.last_played_at
      ? parseInt(row.last_played_at, 10)
      : null;

    return {
      storyId: row.story_id,
      playerSlot: row.player_slot,
      code: row.code,
      userId: row.user_id,
      createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
      lastPlayedAt:
        lastPlayedAtNum === null || isNaN(lastPlayedAtNum)
          ? null
          : lastPlayedAtNum,
    };
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
    const pool = getDb();
    const now = Date.now();

    const storyResult = await pool.query<{ id: string; created_at: string }>( // snake_case
      "SELECT id, created_at FROM stories WHERE id = $1",
      [storyId]
    );
    const storyDbRow = storyResult.rows[0];
    let storyCreatedAtForDto = now;

    if (!storyDbRow) {
      // This logic might be too simplistic, assumes default for missing story
      await pool.query(
        `INSERT INTO stories (id, title, created_at, updated_at, max_turns, generate_images, creator_id, current_turn)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [storyId, "Unknown Story", now, now, 10, true, null, 0]
      );
    } else {
      const parsedCreatedAt = parseInt(storyDbRow.created_at, 10); // snake_case
      storyCreatedAtForDto = isNaN(parsedCreatedAt) ? 0 : parsedCreatedAt;
    }

    const existingPlayerResult = await pool.query(
      `SELECT code FROM story_players WHERE code = $1`,
      [code]
    );
    const existingPlayer = existingPlayerResult.rows[0];

    if (existingPlayer) {
      await pool.query(
        `UPDATE story_players SET user_id = $1, last_played_at = $2 WHERE code = $3`,
        [userId, now, code]
      );
    } else {
      await pool.query(
        `INSERT INTO story_players (story_id, player_slot, code, user_id, last_played_at, is_pending)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [storyId, playerSlot, code, userId, now, true] // Default is_pending to true
      );
    }

    return {
      userId: userId,
      storyId: storyId,
      playerSlot: playerSlot,
      code: code,
      createdAt: storyCreatedAtForDto,
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
 * Get all stories related to a user (both as creator and as player)
 */
export async function getAllUserRelatedStories(
  userId: string
): Promise<ExtendedStoryMetadata[]> {
  try {
    const pool = getDb();

    const createdStoriesResult = await pool.query<StoryMetadataDbRow>(
      `SELECT id, title, template_id, created_at, updated_at, max_turns, generate_images, creator_id, current_beat
       FROM stories WHERE creator_id = $1`,
      [userId]
    );
    const createdStories: StoryMetadata[] = createdStoriesResult.rows.map(
      (row) => {
        const createdAtNum = parseInt(row.created_at, 10);
        const updatedAtNum = parseInt(row.updated_at, 10);
        return {
          id: row.id,
          title: row.title,
          templateId: row.template_id,
          createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
          updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
          maxTurns: row.max_turns,
          generateImages: row.generate_images,
          creatorId: row.creator_id,
          currentBeat: row.current_beat,
        };
      }
    );
    Logger.Route.log(`Created stories: ${createdStories.length}`);

    const playedStoriesResult = await pool.query<StoryMetadataDbRow>(
      `SELECT DISTINCT s.id, s.title, s.template_id, s.created_at, s.updated_at, s.max_turns, s.generate_images, s.creator_id, s.current_beat,
        sp.last_played_at AS sp_last_played_at_for_ordering,
        sp.is_pending
       FROM stories s
       JOIN story_players sp ON s.id = sp.story_id
       WHERE sp.user_id = $1 AND (s.creator_id IS NULL OR s.creator_id != $2)
       ORDER BY sp_last_played_at_for_ordering DESC NULLS LAST`,
      [userId, userId]
    );
    const playedStories: StoryMetadata[] = playedStoriesResult.rows.map(
      (row) => {
        const createdAtNum = parseInt(row.created_at, 10);
        const updatedAtNum = parseInt(row.updated_at, 10);
        return {
          id: row.id,
          title: row.title,
          templateId: row.template_id,
          createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
          updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
          maxTurns: row.max_turns,
          generateImages: row.generate_images,
          creatorId: row.creator_id,
          currentBeat: row.current_beat,
        };
      }
    );
    Logger.Route.log(`Played stories: ${playedStories.length}`);

    const stories: StoryMetadata[] = [...createdStories, ...playedStories];
    const createdStoryIds = new Set(createdStories.map((s) => s.id));
    const extendedStories: ExtendedStoryMetadata[] = [];

    for (const story of stories) {
      const isCreator = createdStoryIds.has(story.id);
      let playersDto: StoryPlayerEntry[];

      if (isCreator) {
        const playersResult = await pool.query<StoryPlayerEntryDbRow>(
          `SELECT story_id, player_slot, code, user_id, last_played_at, is_pending
           FROM story_players WHERE story_id = $1 ORDER BY player_slot`,
          [story.id]
        );
        playersDto = playersResult.rows.map((prow) => {
          const lastPlayedAtNum = prow.last_played_at
            ? parseInt(prow.last_played_at, 10)
            : null;
          return {
            storyId: prow.story_id,
            playerSlot: prow.player_slot,
            code: prow.code,
            userId: prow.user_id,
            lastPlayedAt:
              lastPlayedAtNum === null || isNaN(lastPlayedAtNum)
                ? null
                : lastPlayedAtNum,
            isPending: prow.is_pending,
          };
        });
      } else {
        const playersResult = await pool.query<StoryPlayerEntryDbRow>(
          `SELECT story_id, player_slot, code, user_id, last_played_at, is_pending
           FROM story_players WHERE story_id = $1 AND user_id = $2 ORDER BY player_slot`,
          [story.id, userId]
        );
        playersDto = playersResult.rows.map((prow) => {
          const lastPlayedAtNum = prow.last_played_at
            ? parseInt(prow.last_played_at, 10)
            : null;
          return {
            storyId: prow.story_id,
            playerSlot: prow.player_slot,
            code: prow.code,
            userId: prow.user_id,
            lastPlayedAt:
              lastPlayedAtNum === null || isNaN(lastPlayedAtNum)
                ? null
                : lastPlayedAtNum,
            isPending: prow.is_pending,
          };
        });
      }
      extendedStories.push({
        ...story,
        players: playersDto || [],
      });
    }

    const allStoryIds = extendedStories.map((s) => s.id);
    const lastPlayedMap: Record<string, number> = {};

    if (allStoryIds.length > 0) {
      const lastPlayedTimesResult = await pool.query<{
        story_id: string; // snake_case
        last_played: string | null; // snake_case
      }>(
        `SELECT story_id, MAX(last_played_at) as last_played
         FROM story_players WHERE story_id = ANY($1::TEXT[]) GROUP BY story_id`,
        [allStoryIds]
      );
      for (const record of lastPlayedTimesResult.rows) {
        if (record.last_played !== null) {
          // snake_case
          const lastPlayedNum = parseInt(record.last_played, 10); // snake_case
          if (!isNaN(lastPlayedNum)) {
            lastPlayedMap[record.story_id] = lastPlayedNum; // snake_case
          }
        }
      }
    }

    extendedStories.sort((a, b) => {
      const aLastPlayed = lastPlayedMap[a.id] || a.updatedAt;
      const bLastPlayed = lastPlayedMap[b.id] || b.updatedAt;
      return bLastPlayed - aLastPlayed;
    });

    Logger.Route.log(
      `getAllUserRelatedStories for user ${userId}: Found ${
        extendedStories.length || 0
      } stories`
    );
    if (extendedStories.length > 0) {
      const storyIdsToLog = extendedStories.map((s) => s.id).join(", ");
      Logger.Route.log(`Story IDs: ${storyIdsToLog}`);
    }
    return extendedStories;
  } catch (error) {
    Logger.Route.error(
      `Failed to get related stories for user ${userId}`,
      error
    );
    throw new Error("Failed to retrieve user's related stories");
  }
}

/**
 * Get all stories created by a user
 */
export async function getUserStories(userId: string): Promise<StoryMetadata[]> {
  try {
    const pool = getDb();
    const result = await pool.query<StoryMetadataDbRow>(
      `SELECT 
        id, title, template_id, created_at, updated_at, max_turns, generate_images, creator_id, current_beat
       FROM stories 
       WHERE creator_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );

    return (
      result.rows.map((row) => {
        const createdAtNum = parseInt(row.created_at, 10);
        const updatedAtNum = parseInt(row.updated_at, 10);
        return {
          id: row.id,
          title: row.title,
          templateId: row.template_id,
          createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
          updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
          maxTurns: row.max_turns,
          generateImages: row.generate_images,
          creatorId: row.creator_id,
          currentBeat: row.current_beat,
        };
      }) || []
    );
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
    const pool = getDb();
    const result = await pool.query<StoryMetadataDbRow>(
      `SELECT DISTINCT
        s.id, s.title, s.template_id, s.created_at, s.updated_at, s.max_turns, s.generate_images, s.creator_id, s.current_beat
       FROM stories s
       JOIN story_players sp ON s.id = sp.story_id
       WHERE sp.user_id = $1
       ORDER BY sp.last_played_at DESC NULLS LAST`, // Added NULLS LAST
      [userId]
    );

    return (
      result.rows.map((row) => {
        const createdAtNum = parseInt(row.created_at, 10);
        const updatedAtNum = parseInt(row.updated_at, 10);
        return {
          id: row.id,
          title: row.title,
          templateId: row.template_id,
          createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
          updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
          maxTurns: row.max_turns,
          generateImages: row.generate_images,
          creatorId: row.creator_id,
          currentBeat: row.current_beat,
        };
      }) || []
    );
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
    const pool = getDb();
    const now = Date.now();

    await pool.query(
      `UPDATE story_players 
       SET last_played_at = $1 
       WHERE story_id = $2 AND player_slot = $3 AND user_id = $4`,
      [now, storyId, playerSlot, userId]
    );
    // Also update the parent story's updated_at timestamp
    await pool.query(`UPDATE stories SET updated_at = $1 WHERE id = $2`, [
      now,
      storyId,
    ]);
  } catch (error) {
    Logger.Route.error(
      `Failed to update last played time for user ${userId}, story ${storyId}`,
      error
    );
    throw new Error("Failed to update last played time");
  }
}
