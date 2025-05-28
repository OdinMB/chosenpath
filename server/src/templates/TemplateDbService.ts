import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import { GameMode, PublicationStatusType } from "core/types/index.js";

// Database record type for templates
export interface TemplateDB {
  id: string;
  creatorId: string | null;
  publicationStatus: PublicationStatusType;
  carouselOrder: number | null;
  containsImages: boolean;
  title: string;
  teaser: string;
  gameMode: GameMode;
  tags: string;
  playerCountMin: number;
  playerCountMax: number;
  maxTurnsMin: number;
  maxTurnsMax: number;
  showOnWelcomeScreen: boolean;
  orderValue: number;
  createdAt: number;
  updatedAt: number;
}

// Helper to map snake_case DB row to camelCase TemplateDB
function mapRowToTemplateDB(row: any): TemplateDB {
  return {
    id: row.id,
    creatorId: row.creator_id,
    publicationStatus: row.publication_status as PublicationStatusType,
    carouselOrder: row.carousel_order,
    containsImages: row.contains_images,
    title: row.title,
    teaser: row.teaser,
    gameMode: row.game_mode as GameMode,
    tags: row.tags,
    playerCountMin: row.player_count_min,
    playerCountMax: row.player_count_max,
    maxTurnsMin: row.max_turns_min,
    maxTurnsMax: row.max_turns_max,
    showOnWelcomeScreen: row.show_on_welcome_screen,
    orderValue: row.order_value,
    createdAt: parseInt(row.created_at, 10),
    updatedAt: parseInt(row.updated_at, 10),
  };
}

class TemplateDbService {
  /**
   * Get all template entries from the database, ordered by updated_at DESC
   */
  async getAllTemplateEntries(): Promise<TemplateDB[]> {
    const pool = getDb();
    try {
      const result = await pool.query(
        `SELECT id, creator_id, publication_status, carousel_order, contains_images, 
                title, teaser, game_mode, tags, player_count_min, player_count_max, 
                max_turns_min, max_turns_max, show_on_welcome_screen, order_value, 
                created_at, updated_at 
         FROM templates 
         ORDER BY updated_at DESC`
      );
      Logger.Transaction.log(
        `Fetched ${result.rows.length} template entries from DB`
      );
      return result.rows.map(mapRowToTemplateDB);
    } catch (error) {
      Logger.Transaction.error("Error fetching all template entries:", error);
      throw error;
    }
  }

  /**
   * Get template entries by publication status
   */
  async getTemplateEntriesByStatus(
    status: PublicationStatusType
  ): Promise<TemplateDB[]> {
    const pool = getDb();
    try {
      const result = await pool.query(
        `SELECT id, creator_id, publication_status, carousel_order, contains_images, 
                title, teaser, game_mode, tags, player_count_min, player_count_max, 
                max_turns_min, max_turns_max, show_on_welcome_screen, order_value, 
                created_at, updated_at 
         FROM templates 
         WHERE publication_status = $1 
         ORDER BY updated_at DESC`,
        [status]
      );
      Logger.Transaction.log(
        `Fetched ${result.rows.length} template entries with status ${status} from DB`
      );
      return result.rows.map(mapRowToTemplateDB);
    } catch (error) {
      Logger.Transaction.error(
        `Error fetching template entries by status ${status}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get template entries for carousel (where carousel_order is not null)
   */
  async getCarouselTemplateEntries(): Promise<TemplateDB[]> {
    const pool = getDb();
    try {
      const result = await pool.query(
        `SELECT id, creator_id, publication_status, carousel_order, contains_images, 
                title, teaser, game_mode, tags, player_count_min, player_count_max, 
                max_turns_min, max_turns_max, show_on_welcome_screen, order_value, 
                created_at, updated_at 
         FROM templates 
         WHERE carousel_order IS NOT NULL 
         ORDER BY carousel_order ASC`
      );
      Logger.Transaction.log(
        `Fetched ${result.rows.length} carousel template entries from DB`
      );
      return result.rows.map(mapRowToTemplateDB);
    } catch (error) {
      Logger.Transaction.error(
        "Error fetching carousel template entries:",
        error
      );
      throw error;
    }
  }

  /**
   * Get template entries by creator
   */
  async getTemplateEntriesByCreator(creatorId: string): Promise<TemplateDB[]> {
    const pool = getDb();
    try {
      const result = await pool.query(
        `SELECT id, creator_id, publication_status, carousel_order, contains_images, 
                title, teaser, game_mode, tags, player_count_min, player_count_max, 
                max_turns_min, max_turns_max, show_on_welcome_screen, order_value, 
                created_at, updated_at 
         FROM templates 
         WHERE creator_id = $1 
         ORDER BY updated_at DESC`,
        [creatorId]
      );
      Logger.Transaction.log(
        `Fetched ${result.rows.length} template entries for creator ${creatorId} from DB`
      );
      return result.rows.map(mapRowToTemplateDB);
    } catch (error) {
      Logger.Transaction.error(
        `Error fetching template entries by creator ${creatorId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Find a template entry by ID
   */
  async findTemplateEntryById(id: string): Promise<TemplateDB | undefined> {
    const pool = getDb();
    try {
      const result = await pool.query(
        `SELECT id, creator_id, publication_status, carousel_order, contains_images, 
                title, teaser, game_mode, tags, player_count_min, player_count_max, 
                max_turns_min, max_turns_max, show_on_welcome_screen, order_value, 
                created_at, updated_at 
         FROM templates 
         WHERE id = $1`,
        [id]
      );
      if (result.rows[0]) {
        Logger.Transaction.log(`Found template entry ${id} in DB`);
        return mapRowToTemplateDB(result.rows[0]);
      } else {
        Logger.Transaction.log(`Template entry ${id} not found in DB`);
        return undefined;
      }
    } catch (error) {
      Logger.Transaction.error(
        `Error finding template entry by id ${id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create a new template entry in the database
   */
  async createTemplateEntry(templateData: {
    id: string;
    creatorId?: string | null;
    publicationStatus: PublicationStatusType;
    carouselOrder?: number | null;
    containsImages: boolean;
    title: string;
    teaser: string;
    gameMode: GameMode;
    tags: string[];
    playerCountMin: number;
    playerCountMax: number;
    maxTurnsMin: number;
    maxTurnsMax: number;
    showOnWelcomeScreen: boolean;
    orderValue: number;
  }): Promise<TemplateDB> {
    const pool = getDb();
    const now = Date.now();
    const tagsString = templateData.tags.join(",");

    const query = `
      INSERT INTO templates (
        id, creator_id, publication_status, carousel_order, contains_images, 
        title, teaser, game_mode, tags, player_count_min, player_count_max, 
        max_turns_min, max_turns_max, show_on_welcome_screen, order_value, 
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const values = [
      templateData.id,
      templateData.creatorId || null,
      templateData.publicationStatus,
      templateData.carouselOrder || null,
      templateData.containsImages,
      templateData.title,
      templateData.teaser,
      templateData.gameMode,
      tagsString,
      templateData.playerCountMin,
      templateData.playerCountMax,
      templateData.maxTurnsMin,
      templateData.maxTurnsMax,
      templateData.showOnWelcomeScreen,
      templateData.orderValue,
      now,
      now,
    ];

    try {
      const result = await pool.query(query, values);
      Logger.Transaction.log(
        `Created template entry: ${templateData.title} (${templateData.id})`
      );
      return mapRowToTemplateDB(result.rows[0]);
    } catch (error) {
      Logger.Transaction.error(
        `Error creating template entry ${templateData.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update a template entry in the database
   */
  async updateTemplateEntry(
    id: string,
    updates: Partial<{
      creatorId: string | null;
      publicationStatus: PublicationStatusType;
      carouselOrder: number | null;
      containsImages: boolean;
      title: string;
      teaser: string;
      gameMode: GameMode;
      tags: string[];
      playerCountMin: number;
      playerCountMax: number;
      maxTurnsMin: number;
      maxTurnsMax: number;
      showOnWelcomeScreen: boolean;
      orderValue: number;
    }>
  ): Promise<TemplateDB | undefined> {
    const pool = getDb();
    const now = Date.now();

    // Build dynamic update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        // Handle special case for tags array
        if (key === "tags" && Array.isArray(value)) {
          updateFields.push(`tags = $${paramIndex}`);
          values.push(value.join(","));
        } else {
          // Convert camelCase to snake_case for database fields
          const dbField = key.replace(/([A-Z])/g, "_$1").toLowerCase();
          updateFields.push(`${dbField} = $${paramIndex}`);
          values.push(value);
        }
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      // No fields to update, just return existing record
      return await this.findTemplateEntryById(id);
    }

    // Always update the updated_at field
    updateFields.push(`updated_at = $${paramIndex}`);
    values.push(now);
    paramIndex++;

    // Add the ID for the WHERE clause
    values.push(id);

    const query = `
      UPDATE templates 
      SET ${updateFields.join(", ")} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await pool.query(query, values);
      if (result.rows[0]) {
        Logger.Transaction.log(`Updated template entry: ${id}`);
        return mapRowToTemplateDB(result.rows[0]);
      } else {
        Logger.Transaction.log(`Template entry ${id} not found for update`);
        return undefined;
      }
    } catch (error) {
      Logger.Transaction.error(`Error updating template entry ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a template entry by ID
   */
  async deleteTemplateEntryById(id: string): Promise<boolean> {
    const pool = getDb();
    try {
      const result = await pool.query("DELETE FROM templates WHERE id = $1", [
        id,
      ]);
      if (result.rowCount && result.rowCount > 0) {
        Logger.Transaction.log(`Deleted template entry ${id}`);
        return true;
      } else {
        Logger.Transaction.log(`Template entry ${id} not found for deletion`);
        return false;
      }
    } catch (error) {
      Logger.Transaction.error(`Error deleting template entry ${id}:`, error);
      throw error;
    }
  }

  /**
   * Check if a template entry exists
   */
  async templateEntryExists(id: string): Promise<boolean> {
    const pool = getDb();
    try {
      const result = await pool.query(
        "SELECT 1 FROM templates WHERE id = $1 LIMIT 1",
        [id]
      );
      const exists = result.rows.length > 0;
      Logger.Transaction.log(`Template entry ${id} exists check: ${exists}`);
      return exists;
    } catch (error) {
      Logger.Transaction.error(
        `Error checking if template entry ${id} exists:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update carousel order for multiple templates
   */
  async updateCarouselOrders(
    updates: Array<{ id: string; carouselOrder: number | null }>
  ): Promise<void> {
    const pool = getDb();
    const now = Date.now();

    // Use a transaction for consistency
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      Logger.Transaction.log(
        `BEGIN: Update carousel orders for ${updates.length} templates`
      );

      for (const update of updates) {
        await client.query(
          "UPDATE templates SET carousel_order = $1, updated_at = $2 WHERE id = $3",
          [update.carouselOrder, now, update.id]
        );
      }

      await client.query("COMMIT");
      Logger.Transaction.log(
        `COMMIT: Updated carousel orders for ${updates.length} templates`
      );
    } catch (error) {
      await client.query("ROLLBACK");
      Logger.Transaction.error(
        `ROLLBACK: Update carousel orders for ${updates.length} templates`,
        error
      );
      Logger.Transaction.error(
        `Error updating carousel orders for templates:`,
        error
      );
      throw error;
    } finally {
      client.release();
    }
  }
}

export const templateDbService = new TemplateDbService();
