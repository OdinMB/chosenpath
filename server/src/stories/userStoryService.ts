import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import {
  StoryMetadata,
  ExtendedStoryMetadata,
  StoryPlayerEntry,
} from "core/types/api.js";

// DB Row Types for StoryMetadata and StoryPlayerEntry (if still needed by getStoryFeed or other functions)
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

// Interface for StoryPlayerDetail (used by getStoryPlayerByCode)
interface StoryPlayerDetailDbRow {
  story_id: string;
  player_slot: string;
  code: string;
  user_id: string | null;
  created_at: string;
  last_played_at: string | null;
}

interface StoryPlayerDetail {
  storyId: string;
  playerSlot: string;
  code: string;
  userId: string | null;
  createdAt: number;
  lastPlayedAt: number | null;
}

// DB Row Types for combined query
interface StoryFeedDbRow {
  id: string;
  title: string;
  template_id?: string;
  created_at: string; // story.created_at
  updated_at: string; // story.updated_at
  max_turns: number;
  generate_images: boolean;
  creator_id: string | null;
  current_beat: number;
  difficulty_title: string;
  difficulty_modifier: number;
  // Player fields (can be null if a story has no players or if LEFT JOIN doesn't match)
  sp_story_id: string | null;
  sp_player_slot: string | null;
  sp_code: string | null;
  sp_user_id: string | null;
  sp_last_played_at: string | null;
  sp_is_pending: boolean | null;
  sp_status: string | null; // Added status field
  sp_username: string | null; // Added for player username
}

/**
 * New consolidated function to get all relevant story data for a user or codes.
 */
export async function getStoryFeed(
  authUserId?: string,
  clientPlayerCodes?: string[],
  playerStatus: "active" | "archived" = "active"
): Promise<ExtendedStoryMetadata[]> {
  const pool = getDb();
  const finalQueryParams: (string | string[])[] = [];
  const unionClauses: string[] = [];

  let paramIdx = 1;
  if (authUserId) {
    finalQueryParams.push(authUserId);
    finalQueryParams.push(playerStatus);
    // Show stories where the user has the specified status participation
    unionClauses.push(
      `SELECT story_id FROM story_players WHERE user_id = $${paramIdx} AND status = $${
        paramIdx + 1
      }`
    );
    paramIdx += 2;
  }
  if (
    clientPlayerCodes &&
    clientPlayerCodes.length > 0 &&
    playerStatus === "active"
  ) {
    // Only check local codes for active stories (archived stories are user-specific)
    finalQueryParams.push(clientPlayerCodes);
    unionClauses.push(
      `SELECT story_id FROM story_players WHERE code = ANY($${paramIdx}::TEXT[]) AND status = 'active'`
    );
    paramIdx++;
  }

  if (unionClauses.length === 0) {
    Logger.Route.log(
      "getStoryFeed: No authUserId or clientPlayerCodes provided. Returning empty array."
    );
    return [];
  }

  const ctes = `WITH RelevantStoryIDs AS (
    ${unionClauses.join(
      " UNION \n    " /* Each UNION clause on a new line for readability */
    )}
  )
  `;

  const baseQuery = `
    ${ctes}
    SELECT
      s.id,
      s.title,
      s.template_id,
      s.created_at,
      s.updated_at,
      s.max_turns,
      s.generate_images,
      s.creator_id,
      s.current_beat,
      s.difficulty_title,
      s.difficulty_modifier,
      sp.story_id as sp_story_id,
      sp.player_slot as sp_player_slot,
      sp.code as sp_code,
      sp.user_id as sp_user_id,
      sp.last_played_at as sp_last_played_at,
      sp.is_pending as sp_is_pending,
      sp.status as sp_status,
      u.username as sp_username
    FROM stories s
    JOIN RelevantStoryIDs rsi ON s.id = rsi.story_id
    LEFT JOIN story_players sp ON s.id = sp.story_id
    LEFT JOIN users u ON sp.user_id = u.id
    ORDER BY s.updated_at DESC, s.id, sp.player_slot;
  `;

  const result = await pool.query<StoryFeedDbRow>(baseQuery, finalQueryParams);
  Logger.Route.log(`getStoryFeed query returned ${result.rowCount} rows.`);

  const storiesMap: Map<string, ExtendedStoryMetadata> = new Map();

  result.rows.forEach((row) => {
    let story = storiesMap.get(row.id);
    if (!story) {
      const createdAtNum = parseInt(row.created_at, 10);
      const updatedAtNum = parseInt(row.updated_at, 10);
      story = {
        id: row.id,
        title: row.title,
        templateId: row.template_id,
        difficultyLevel: {
          modifier: row.difficulty_modifier,
          title: row.difficulty_title,
        },
        createdAt: isNaN(createdAtNum) ? 0 : createdAtNum,
        updatedAt: isNaN(updatedAtNum) ? 0 : updatedAtNum,
        maxTurns: row.max_turns,
        generateImages: row.generate_images,
        creatorId: row.creator_id,
        currentBeat: row.current_beat,
        players: [],
      };
      storiesMap.set(row.id, story);
    }

    if (row.sp_story_id) {
      const lastPlayedAtNum = row.sp_last_played_at
        ? parseInt(row.sp_last_played_at, 10)
        : null;
      const isCurrentUsersPlayerEntry = authUserId
        ? row.sp_user_id === authUserId
        : false;

      // Determine if the code should be included
      let shouldIncludeCode = false;
      if (authUserId === row.creator_id || isCurrentUsersPlayerEntry) {
        shouldIncludeCode = true;
      } else if (
        clientPlayerCodes &&
        row.sp_code &&
        clientPlayerCodes.includes(row.sp_code)
      ) {
        shouldIncludeCode = true;
      }

      const playerEntry: StoryPlayerEntry = {
        storyId: row.sp_story_id,
        playerSlot: row.sp_player_slot!,
        code: shouldIncludeCode ? row.sp_code || undefined : undefined,
        userId: row.sp_user_id,
        lastPlayedAt:
          lastPlayedAtNum === null || isNaN(lastPlayedAtNum)
            ? null
            : lastPlayedAtNum,
        isPending: row.sp_is_pending || false,
        isCurrentUser: isCurrentUsersPlayerEntry,
        username: row.sp_username || undefined,
        status:
          (row.sp_status as "active" | "archived" | "deleted") || "active",
      };
      // Ensure player is not added multiple times if story appears due to multiple reasons in CTE (though JOIN rsi should handle distinct stories)
      if (!story.players.find((p) => p.playerSlot === playerEntry.playerSlot)) {
        story.players.push(playerEntry);
      }
    }
  });

  const extendedStories = Array.from(storiesMap.values());
  Logger.Route.log(`Returning ${extendedStories.length} stories in feed.`);
  return extendedStories;
}

/**
 * Get story player details by code (Kept for potential use by game joining logic)
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
 * Update the last played time for a user's story code (Kept for game logic)
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
