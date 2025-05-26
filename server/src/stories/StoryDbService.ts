import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import { PlayerSlot } from "core/types/index.js";

// Interface for player info retrieved from DB
export interface StoryPlayerDbInfo {
  storyId: string;
  playerSlot: PlayerSlot;
  // Add other fields if needed by callers, e.g., userId, is_pending
}

// Interface for the data returned by getStoryOverviewList
export interface StoryDbOverviewItem {
  id: string;
  title: string | null;
  created_at: number; // As epoch milliseconds
  updated_at: number; // As epoch milliseconds
  current_beat: number; // Renamed from current_turn
  max_turns: number;
  template_id: string | null;
  player_count: number;
  difficulty_title: string;
  difficulty_modifier: number;
}

class StoryDbService {
  async createStoryEntry(
    id: string,
    title: string | null,
    templateId: string | null,
    maxTurns: number,
    generateImages: boolean,
    creatorId: string | undefined,
    difficultyTitle: string | null,
    difficultyModifier: number | null,
    initialBeat: number = 0
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const query = `
      INSERT INTO stories (id, title, template_id, created_at, updated_at, max_turns, generate_images, creator_id, current_beat, difficulty_title, difficulty_modifier)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `; // Renamed current_turn to current_beat in SQL
    try {
      await db.query(query, [
        id,
        title,
        templateId,
        now, // created_at
        now, // updated_at
        maxTurns,
        generateImages,
        creatorId,
        initialBeat, // Renamed from initialTurn
        difficultyTitle,
        difficultyModifier,
      ]);
      Logger.Transaction.log(`Created story entry in DB: ${id}`);
    } catch (error) {
      Logger.Transaction.error(
        `Error creating story entry in DB for ${id}:`,
        error
      );
      throw error; // Re-throw to be handled by caller
    }
  }

  async createStoryPlayerEntry(
    storyId: string,
    playerSlot: PlayerSlot,
    code: string,
    // userId?: string, // userId is initially null, can be updated later if a user claims a slot
    initialIsPending: boolean = true
  ): Promise<void> {
    const db = getDb();
    // lastPlayedAt is initially null and will be set upon first action
    const query = `
      INSERT INTO story_players (story_id, player_slot, code, user_id, last_played_at, is_pending)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    try {
      await db.query(query, [
        storyId,
        playerSlot,
        code,
        null, // userId
        null, // lastPlayedAt
        initialIsPending,
      ]);
      Logger.Transaction.log(
        `Created story player entry in DB for story ${storyId}, slot ${playerSlot}`
      );
    } catch (error) {
      Logger.Transaction.error(
        `Error creating story player entry in DB for ${storyId}, slot ${playerSlot}:`,
        error
      );
      throw error;
    }
  }

  async bulkCreateStoryPlayerEntries(
    storyId: string,
    playerCodes: Record<string, string>,
    initialIsPending: boolean = true
  ): Promise<void> {
    const db = getDb();
    const playerInsertQuery = `
      INSERT INTO story_players (story_id, player_slot, code, user_id, last_played_at, is_pending)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    // Note: pg library doesn't directly support batching multiple inserts into one query
    // like some ORMs. A transaction is appropriate here.
    try {
      await db.query("BEGIN");
      Logger.Transaction.log(
        `BEGIN: Bulk create story player entries for story ${storyId}`
      );
      for (const [slot, code] of Object.entries(playerCodes)) {
        await db.query(playerInsertQuery, [
          storyId,
          slot as PlayerSlot,
          code,
          null, // userId
          null, // lastPlayedAt
          initialIsPending,
        ]);
      }
      await db.query("COMMIT");
      Logger.Transaction.log(
        `COMMIT: Bulk create story player entries for story ${storyId}`
      );
      Logger.Transaction.log(
        `Bulk created story player entries in DB for story ${storyId}`
      );
    } catch (error) {
      await db.query("ROLLBACK");
      Logger.Transaction.error(
        `ROLLBACK: Bulk create story player entries for story ${storyId}`,
        error
      );
      Logger.Transaction.error(
        `Error bulk creating story player entries in DB for ${storyId}:`,
        error
      );
      throw error;
    }
  }

  async updateStoryTitle(storyId: string, title: string): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const query =
      "UPDATE stories SET title = $1, updated_at = $2 WHERE id = $3";
    try {
      await db.query(query, [title, now, storyId]);
      Logger.Transaction.log(`Updated story title in DB for: ${storyId}`);
    } catch (error) {
      Logger.Transaction.error(
        `Error updating story title in DB for ${storyId}:`,
        error
      );
      throw error;
    }
  }

  async updateStoryBeatAndTimestamp(
    // Renamed from updateStoryTurnAndTimestamp
    storyId: string,
    currentBeat: number // Renamed from currentTurn
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();
    // This function is for when the story file itself is updated, reflecting a new turn.
    // GameQueueProcessor will call a separate function to update player statuses and story.updated_at for player actions.
    const query =
      "UPDATE stories SET current_beat = $1, updated_at = $2 WHERE id = $3"; // Renamed current_turn to current_beat
    try {
      await db.query(query, [currentBeat, now, storyId]);
      Logger.Transaction.log(
        `Updated story beat to ${currentBeat} and timestamp in DB for: ${storyId}` // Updated log message
      );
    } catch (error) {
      Logger.Transaction.error(
        `Error updating story beat and timestamp in DB for ${storyId}:`, // Updated log message
        error
      );
      throw error;
    }
  }

  async updatePlayerStatus(
    storyId: string,
    playerSlot: PlayerSlot,
    isPending: boolean
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const playerQuery =
      "UPDATE story_players SET is_pending = $1, last_played_at = $2 WHERE story_id = $3 AND player_slot = $4";
    const storyQuery = "UPDATE stories SET updated_at = $1 WHERE id = $2";
    try {
      await db.query("BEGIN");
      Logger.Transaction.log(
        `BEGIN: Update player ${playerSlot} status for story ${storyId}`
      );
      await db.query(playerQuery, [isPending, now, storyId, playerSlot]);
      await db.query(storyQuery, [now, storyId]); // Update story's updated_at to reflect this activity
      await db.query("COMMIT");
      Logger.Transaction.log(
        `COMMIT: Update player ${playerSlot} status for story ${storyId}`
      );
      Logger.Transaction.log(
        `Updated player ${playerSlot} status to isPending=${isPending} and story ${storyId} updated_at in DB.`
      );
    } catch (error) {
      await db.query("ROLLBACK");
      Logger.Transaction.error(
        `ROLLBACK: Update player ${playerSlot} status for story ${storyId}`,
        error
      );
      Logger.Transaction.error(
        `Error updating player ${playerSlot} status or story ${storyId} updated_at in DB:`,
        error
      );
      throw error;
    }
  }

  async setAllPlayersPending(
    storyId: string,
    playerSlots: PlayerSlot[]
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const playerQuery =
      "UPDATE story_players SET is_pending = TRUE, last_played_at = $1 WHERE story_id = $2 AND player_slot = $3";
    const storyQuery = "UPDATE stories SET updated_at = $1 WHERE id = $2";
    try {
      await db.query("BEGIN");
      Logger.Transaction.log(
        `BEGIN: Set all players pending for story ${storyId}`
      );
      for (const slot of playerSlots) {
        await db.query(playerQuery, [now, storyId, slot]);
      }
      await db.query(storyQuery, [now, storyId]); // Update story's updated_at
      await db.query("COMMIT");
      Logger.Transaction.log(
        `COMMIT: Set all players pending for story ${storyId}`
      );
      Logger.Transaction.log(
        `Set all players in story ${storyId} to is_pending=TRUE and updated story updated_at.`
      );
    } catch (error) {
      await db.query("ROLLBACK");
      Logger.Transaction.error(
        `ROLLBACK: Set all players pending for story ${storyId}`,
        error
      );
      Logger.Transaction.error(
        `Error setting all players pending for story ${storyId}:`,
        error
      );
      throw error;
    }
  }

  async getStoryPlayerByCode(
    code: string
  ): Promise<StoryPlayerDbInfo | undefined> {
    const db = getDb();
    const query =
      "SELECT story_id, player_slot FROM story_players WHERE code = $1";
    try {
      const result = await db.query(query, [code]);
      if (result.rows.length > 0) {
        const { story_id, player_slot } = result.rows[0];
        return { storyId: story_id, playerSlot: player_slot as PlayerSlot };
      }
      return undefined;
    } catch (error) {
      Logger.Transaction.error(
        `Error fetching story player by code ${code}:`,
        error
      );
      throw error;
    }
  }

  async getStoryPlayerCodes(
    storyId: string
  ): Promise<Record<PlayerSlot, string> | undefined> {
    const db = getDb();
    const query =
      "SELECT player_slot, code FROM story_players WHERE story_id = $1";
    try {
      const result = await db.query(query, [storyId]);
      if (result.rows.length > 0) {
        const codes: Record<PlayerSlot, string> = {} as Record<
          PlayerSlot,
          string
        >;
        result.rows.forEach((row) => {
          codes[row.player_slot as PlayerSlot] = row.code;
        });
        Logger.Transaction.log(`Fetched player codes for story ${storyId}`);
        return codes;
      }
      Logger.Transaction.log(`No player codes found for story ${storyId}`);
      return undefined;
    } catch (error) {
      Logger.Transaction.error(
        `Error fetching player codes for story ${storyId}:`,
        error
      );
      throw error;
    }
  }

  async assignUserToPlayerSlot(
    storyId: string,
    playerSlot: PlayerSlot,
    userId: string
  ): Promise<void> {
    const db = getDb();
    const query =
      "UPDATE story_players SET user_id = $1 WHERE story_id = $2 AND player_slot = $3";
    try {
      await db.query(query, [userId, storyId, playerSlot]);
      Logger.Transaction.log(
        `Assigned user ${userId} to player slot ${playerSlot} for story ${storyId} in DB.`
      );
    } catch (error) {
      Logger.Transaction.error(
        `Error assigning user ${userId} to player slot ${playerSlot} for story ${storyId} in DB:`,
        error
      );
      throw error;
    }
  }

  async getStoryOverviewList(): Promise<StoryDbOverviewItem[]> {
    const db = getDb();
    // player_count is returned as a string by COUNT, so cast to INTEGER
    const query = `
      SELECT
        s.id,
        s.title,
        s.created_at,
        s.updated_at,
        s.current_beat,
        s.max_turns,
        s.template_id,
        s.difficulty_title,
        s.difficulty_modifier,
        COUNT(sp.player_slot) as player_count
      FROM stories s
      LEFT JOIN story_players sp ON s.id = sp.story_id
      GROUP BY s.id, s.title, s.created_at, s.updated_at, s.current_beat, s.max_turns, s.template_id, s.difficulty_title, s.difficulty_modifier
      ORDER BY s.updated_at DESC;
    `;
    try {
      const result = await db.query(query);
      // Ensure timestamps are numbers (epoch ms) as defined in StoryDbOverviewItem
      return result.rows.map((row) => ({
        ...row,
        created_at: parseInt(row.created_at, 10),
        updated_at: parseInt(row.updated_at, 10),
      }));
    } catch (error) {
      Logger.Transaction.error("Error fetching story overview list:", error);
      throw error;
    }
  }

  async deleteStoryWithPlayers(storyId: string): Promise<void> {
    const db = getDb();
    try {
      await db.query("BEGIN");
      Logger.Transaction.log(
        `BEGIN: Delete story and players for story_id: ${storyId}`
      );

      // Delete from story_players first due to potential foreign key constraints
      // (though current schema might use ON DELETE CASCADE, explicit is safer)
      const deletePlayersResult = await db.query(
        "DELETE FROM story_players WHERE story_id = $1",
        [storyId]
      );
      Logger.Transaction.log(
        `Deleted ${deletePlayersResult.rowCount} player(s) for story_id: ${storyId}`
      );

      // Then delete from stories
      const deleteStoryResult = await db.query(
        "DELETE FROM stories WHERE id = $1",
        [storyId]
      );

      if (deleteStoryResult.rowCount === 0) {
        // This could mean the story didn't exist, or an issue occurred.
        // If story_players were deleted but story wasn't, transaction will rollback.
        Logger.Transaction.warn(
          `Story with id: ${storyId} not found in stories table for deletion, or already deleted.`
        );
      } else {
        Logger.Transaction.log(`Deleted story from stories table: ${storyId}`);
      }

      await db.query("COMMIT");
      Logger.Transaction.log(
        `COMMIT: Successfully deleted story and players for story_id: ${storyId}`
      );
    } catch (error) {
      await db.query("ROLLBACK");
      Logger.Transaction.error(
        `ROLLBACK: Error deleting story ${storyId} and its players:`,
        error
      );
      throw error;
    }
  }

  async updateStoryGeneratedDetails(
    storyId: string,
    title: string | null,
    difficultyTitle: string | null,
    difficultyModifier: number | null
  ): Promise<void> {
    const db = getDb();
    const now = Date.now();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    let placeholderIndex = 1;

    if (title !== null && title !== undefined) {
      updates.push(`title = $${placeholderIndex++}`);
      values.push(title);
    }
    if (difficultyTitle !== null && difficultyTitle !== undefined) {
      updates.push(`difficulty_title = $${placeholderIndex++}`);
      values.push(difficultyTitle);
    }
    if (difficultyModifier !== null && difficultyModifier !== undefined) {
      updates.push(`difficulty_modifier = $${placeholderIndex++}`);
      values.push(difficultyModifier);
    }

    if (updates.length === 0) {
      Logger.Transaction.log(
        `No details to update in DB for story: ${storyId}`
      );
      return; // Nothing to update
    }

    values.push(now); // for updated_at
    values.push(storyId); // for WHERE id =

    const query = `
      UPDATE stories
      SET ${updates.join(", ")}, updated_at = $${placeholderIndex++}
      WHERE id = $${placeholderIndex}
    `;

    try {
      await db.query(query, values);
      Logger.Transaction.log(
        `Updated generated details in DB for story: ${storyId}`
      );
    } catch (error) {
      Logger.Transaction.error(
        `Error updating generated details in DB for ${storyId}:`,
        error
      );
      throw error;
    }
  }
}

export const storyDbService = new StoryDbService();
