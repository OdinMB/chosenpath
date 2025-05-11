import express from "express";
import { getAllUsers, deleteUserById } from "users/userService.js";
import { verifyAdmin } from "users/authMiddleware.js";
import { Logger } from "shared/logger.js";
import { sendSuccess, sendError, sendNotFound } from "shared/responseUtils.js";

const router = express.Router();

/**
 * Get all users
 * GET /admin/users
 */
router.get("/admin/users", verifyAdmin(), async (req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";

  try {
    Logger.Admin.log("Getting all users");
    const users = await getAllUsers();
    return sendSuccess(res, { users }, requestId);
  } catch (error) {
    Logger.Admin.error("Failed to get users", error);
    return sendError(
      res,
      "An error occurred while fetching users",
      500,
      requestId
    );
  }
});

/**
 * Delete a user
 * DELETE /admin/users/:userId
 */
router.delete("/admin/users/:userId", verifyAdmin(), async (req, res) => {
  const requestId = (req.query.requestId as string) || "unknown";
  const { userId } = req.params;

  try {
    Logger.Admin.log(`Deleting user: ${userId}`);
    const deleted = await deleteUserById(userId);

    if (!deleted) {
      return sendNotFound(res, "User not found", requestId);
    }

    return sendSuccess(
      res,
      { message: "User deleted successfully" },
      requestId
    );
  } catch (error) {
    Logger.Admin.error(`Failed to delete user: ${userId}`, error);
    return sendError(
      res,
      "An error occurred while deleting the user",
      500,
      requestId
    );
  }
});

export default router;
