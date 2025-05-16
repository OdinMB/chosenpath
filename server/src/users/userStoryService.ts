import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import {
  UserStoryCodeAssociation,
  StoryMetadata,
  ExtendedStoryMetadata,
  StoryPlayerEntry,
} from "core/types/api.js";

// ---- Intermediate DB Row Types (lowercase) ----
interface UserStoryCodeDbRow {
  userid: string;
  storyid: string;
  playerslot: string;
  code: string;
  createdat: string;
  lastplayedat: string | null;
}

interface StoryMetadataDbRow {
  id: string;
  title: string;
  templateid?: string;
  createdat: string;
  updatedat: string;
  maxturns: number;
  generateimages: boolean;
  creatorid: string | null;
}

interface StoryPlayerEntryDbRow {
  storyid: string;
  playerslot: string;
  code: string;
  userid: string | null;
  lastplayedat: string | null;
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
// DB row version for getStoryPlayerByCode query
interface StoryPlayerDetailDbRow {
  storyid: string;
  playerslot: string;
  code: string;
  userid: string | null;
  createdat: string;
  lastplayedat: string | null;
}
// ---- End Intermediate DB Row Types ----

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
        $1 AS userid, 
        sp.storyid, 
        sp.playerslot, 
        sp.code, 
        s.createdat, 
        sp.lastplayedat 
       FROM story_players sp
       JOIN stories s ON sp.storyid = s.id
       WHERE sp.userid = $2
       ORDER BY sp.lastplayedat DESC`,
      [userId, userId]
    );
    return result.rows.map((row) => {
      const createdAtNum = parseInt(row.createdat, 10);
      const lastPlayedAtNum = row.lastplayedat
        ? parseInt(row.lastplayedat, 10)
        : null;
      return {
        userId: row.userid,
        storyId: row.storyid,
        playerSlot: row.playerslot,
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
        sp.storyid, 
        sp.playerslot, 
        sp.code, 
        sp.userid, 
        s.createdat, 
        sp.lastplayedat
       FROM story_players sp
       JOIN stories s ON sp.storyid = s.id
       WHERE sp.code = $1`,
      [code]
    );
    const row = result.rows[0];
    if (!row) return null;

    const createdAtNum = parseInt(row.createdat, 10);
    const lastPlayedAtNum = row.lastplayedat
      ? parseInt(row.lastplayedat, 10)
      : null;

    return {
      storyId: row.storyid,
      playerSlot: row.playerslot,
      code: row.code,
      userId: row.userid,
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

    // Check if story exists first
    const storyResult = await pool.query<{ id: string; createdat: string }>(
      "SELECT id, createdat FROM stories WHERE id = $1",
      [storyId]
    );
    const storyDbRow = storyResult.rows[0];
    let storyCreatedAtForDto = now;

    if (!storyDbRow) {
      await pool.query(
        `INSERT INTO stories (id, title, createdat, updatedat, maxturns, generateimages, creatorid)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [storyId, "Unknown Story", now, now, 10, true, null]
      );
    } else {
      const parsedCreatedAt = parseInt(storyDbRow.createdat, 10);
      storyCreatedAtForDto = isNaN(parsedCreatedAt) ? 0 : parsedCreatedAt;
    }

    const existingPlayerResult = await pool.query(
      `SELECT code FROM story_players WHERE code = $1`,
      [code]
    );
    const existingPlayer = existingPlayerResult.rows[0];

    if (existingPlayer) {
      await pool.query(
        `UPDATE story_players SET userid = $1, lastplayedat = $2 WHERE code = $3`,
        [userId, now, code]
      );
    } else {
      await pool.query(
        `INSERT INTO story_players (storyid, playerslot, code, userid, lastplayedat)
         VALUES ($1, $2, $3, $4, $5)`,
        [storyId, playerSlot, code, userId, now]
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
      `SELECT id, title, templateid, createdat, updatedat, maxturns, generateimages, creatorid
       FROM stories WHERE creatorid = $1`,
      [userId]
    );
    const createdStories: StoryMetadata[] = createdStoriesResult.rows.map(
      (row) => {
        const createdAtNum = parseInt(row.createdat, 10);
        const updatedAtNum = parseInt(row.updatedat, 10);
        return {
          id: row.id,
          title: row.title,
          templateId: row.templateid,
          createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
          updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
          maxTurns: row.maxturns,
          generateImages: row.generateimages,
          creatorId: row.creatorid,
        };
      }
    );
    Logger.Route.log(`Created stories: ${createdStories.length}`);

    const playedStoriesResult = await pool.query<StoryMetadataDbRow>(
      `SELECT DISTINCT s.id, s.title, s.templateid, s.createdat, s.updatedat, s.maxturns, s.generateimages, s.creatorid,
        sp.lastplayedat AS "sp_lastplayedat_for_ordering"
       FROM stories s
       JOIN story_players sp ON s.id = sp.storyid
       WHERE sp.userid = $1 AND (s.creatorid IS NULL OR s.creatorid != $2)
       ORDER BY "sp_lastplayedat_for_ordering" DESC`,
      [userId, userId]
    );
    const playedStories: StoryMetadata[] = playedStoriesResult.rows.map(
      (row) => {
        const createdAtNum = parseInt(row.createdat, 10);
        const updatedAtNum = parseInt(row.updatedat, 10);
        return {
          id: row.id,
          title: row.title,
          templateId: row.templateid,
          createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
          updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
          maxTurns: row.maxturns,
          generateImages: row.generateimages,
          creatorId: row.creatorid,
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
          `SELECT storyid, playerslot, code, userid, lastplayedat
           FROM story_players WHERE storyid = $1 ORDER BY playerslot`,
          [story.id]
        );
        playersDto = playersResult.rows.map((prow) => {
          const lastPlayedAtNum = prow.lastplayedat
            ? parseInt(prow.lastplayedat, 10)
            : null;
          return {
            storyId: prow.storyid,
            playerSlot: prow.playerslot,
            code: prow.code,
            userId: prow.userid,
            lastPlayedAt:
              lastPlayedAtNum === null || isNaN(lastPlayedAtNum)
                ? null
                : lastPlayedAtNum,
          };
        });
      } else {
        const playersResult = await pool.query<StoryPlayerEntryDbRow>(
          `SELECT storyid, playerslot, code, userid, lastplayedat
           FROM story_players WHERE storyid = $1 AND userid = $2 ORDER BY playerslot`,
          [story.id, userId]
        );
        playersDto = playersResult.rows.map((prow) => {
          const lastPlayedAtNum = prow.lastplayedat
            ? parseInt(prow.lastplayedat, 10)
            : null;
          return {
            storyId: prow.storyid,
            playerSlot: prow.playerslot,
            code: prow.code,
            userId: prow.userid,
            lastPlayedAt:
              lastPlayedAtNum === null || isNaN(lastPlayedAtNum)
                ? null
                : lastPlayedAtNum,
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
        storyid: string;
        lastplayed: string | null;
      }>(
        `SELECT storyid, MAX(lastplayedat) as lastplayed
         FROM story_players WHERE storyid = ANY($1::TEXT[]) GROUP BY storyid`,
        [allStoryIds]
      );
      for (const record of lastPlayedTimesResult.rows) {
        if (record.lastplayed !== null) {
          const lastPlayedNum = parseInt(record.lastplayed, 10);
          if (!isNaN(lastPlayedNum)) {
            lastPlayedMap[record.storyid] = lastPlayedNum;
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
        id, title, templateid, createdat, updatedat, maxturns, generateimages, creatorid
       FROM stories 
       WHERE creatorid = $1
       ORDER BY updatedat DESC`,
      [userId]
    );

    return (
      result.rows.map((row) => {
        const createdAtNum = parseInt(row.createdat, 10);
        const updatedAtNum = parseInt(row.updatedat, 10);
        return {
          id: row.id,
          title: row.title,
          templateId: row.templateid,
          createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
          updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
          maxTurns: row.maxturns,
          generateImages: row.generateimages,
          creatorId: row.creatorid,
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
        s.id, s.title, s.templateid, s.createdat, s.updatedat, s.maxturns, s.generateimages, s.creatorid
       FROM stories s
       JOIN story_players sp ON s.id = sp.storyid
       WHERE sp.userid = $1
       ORDER BY sp.lastplayedat DESC`,
      [userId]
    );

    return (
      result.rows.map((row) => {
        const createdAtNum = parseInt(row.createdat, 10);
        const updatedAtNum = parseInt(row.updatedat, 10);
        return {
          id: row.id,
          title: row.title,
          templateId: row.templateid,
          createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
          updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
          maxTurns: row.maxturns,
          generateImages: row.generateimages,
          creatorId: row.creatorid,
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

    // Update the story_players record
    await pool.query(
      `UPDATE story_players 
       SET lastPlayedAt = $1 
       WHERE storyId = $2 AND playerSlot = $3 AND userId = $4`,
      [now, storyId, playerSlot, userId]
    );
  } catch (error) {
    Logger.Route.error(
      `Failed to update last played time for user ${userId}, story ${storyId}`,
      error
    );
    throw new Error("Failed to update last played time");
  }
}
