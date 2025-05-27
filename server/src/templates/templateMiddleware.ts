import express from "express";
import { Logger } from "shared/logger.js";
import { StoryTemplate } from "core/types/index.js";

// Extend StoryTemplate to add missing property
interface TemplateWithCreator extends StoryTemplate {
  createdBy?: string;
  creatorId?: string;
}
import { sendError } from "shared/responseUtils.js";
import { TemplateService } from "./TemplateService.js";

const templateService = new TemplateService();

/**
 * Check if user has permission to access a template
 * Permission is granted if:
 * 1. User has 'templates_see_all' permission, OR
 * 2. User is the creator of the template
 *
 * @param templateId Template ID to check
 * @param userId User ID making the request
 * @param userPermissions Array of user permissions
 * @returns Boolean indicating if user has access
 */
export async function hasTemplateAccess(
  templateId: string,
  userId: string | undefined,
  userPermissions: string[] = []
): Promise<boolean> {
  // Admin with templates_see_all can access any template
  if (userPermissions.includes("templates_see_all")) {
    return true;
  }

  // Must have a user ID to check ownership
  if (!userId) {
    return false;
  }

  // Get the template
  const template = await templateService.getTemplateById(templateId);
  if (!template) {
    return false;
  }

  // Check if user is the creator
  // Templates might have either createdBy or creatorId field
  // Cast to our extended type
  const templateWithCreator = template as unknown as TemplateWithCreator;
  return (
    templateWithCreator.createdBy === userId ||
    templateWithCreator.creatorId === userId
  );
}

/**
 * Middleware to check if user can access a specific template
 * Gets templateId from route params
 */
export function verifyTemplateAccess() {
  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const { id } = req.params;
    const requestId =
      (req.query.requestId as string) || req.body?.requestId || "unknown";

    if (!id) {
      return sendError(res, "Template ID is required", 400, requestId);
    }

    try {
      const hasAccess = await hasTemplateAccess(
        id,
        req.user?.id,
        req.userPermissions || []
      );

      if (!hasAccess) {
        Logger.Route.warn(
          `User ${
            req.user?.id || "anonymous"
          } attempted to access template ${id} without permission`
        );
        return sendError(
          res,
          "You don't have permission to access this template",
          403,
          requestId
        );
      }

      next();
    } catch (error) {
      Logger.Route.error(`Error checking template access for ${id}`, error);
      return sendError(res, "Failed to verify template access", 500, requestId);
    }
  };
}

/**
 * Middleware to verify that a user can change the publication status
 * If the template has publication status "Published", user must have templates_publish permission
 */
export function verifyPublicationStatusPermission(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const requestId = req.body?.requestId || "unknown";
  const template = req.body?.template;

  // If template doesn't have publication status set, continue
  if (!template?.publicationStatus) {
    return next();
  }

  // If the template has publication status "Published", check permissions
  if (template.publicationStatus === "published") {
    // Check if user has templates_publish permission
    if (!req.userPermissions?.includes("templates_publish")) {
      Logger.Route.warn(
        `User ${req.user?.id} attempted to publish a template without permission`
      );
      return sendError(
        res,
        "Insufficient permissions to publish templates",
        403,
        requestId
      );
    }
  }

  next();
}

/**
 * Middleware to verify that a user can change the welcome screen settings
 * If the template has showOnWelcomeScreen or order attributes, user must have templates_carousel permission
 */
export function verifyCarouselPermission(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const requestId = req.body?.requestId || "unknown";
  const template = req.body?.template;

  // If template doesn't have welcome screen settings, continue
  if (
    template?.showOnWelcomeScreen === undefined &&
    template?.order === undefined
  ) {
    return next();
  }

  // Check if user has templates_carousel permission
  if (!req.userPermissions?.includes("templates_carousel")) {
    Logger.Route.warn(
      `User ${req.user?.id} attempted to modify welcome screen settings without permission`
    );
    return sendError(
      res,
      "Insufficient permissions to manage welcome screen carousel",
      403,
      requestId
    );
  }

  next();
}

/**
 * Middleware to verify that a user can generate images
 * User must have templates_images permission
 */
export function verifyImageGenerationPermission(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const requestId = req.body?.requestId || "unknown";

  // Check if user has templates_images permission
  if (!req.userPermissions?.includes("templates_images")) {
    Logger.Route.warn(
      `User ${req.user?.id} attempted to generate images without permission`
    );
    return sendError(
      res,
      "Insufficient permissions to generate images",
      403,
      requestId
    );
  }

  next();
}

/**
 * Middleware to verify a user can edit a template
 * User must either:
 * 1. Have 'templates_edit_all' permission, OR
 * 2. Be the creator of the template
 */
export function verifyTemplateEditAccess() {
  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const { id } = req.params;
    const requestId = req.body?.requestId || "unknown";

    if (!id) {
      return sendError(res, "Template ID is required", 400, requestId);
    }

    // If user has edit_all permission, allow access
    if (req.userPermissions?.includes("templates_edit_all")) {
      return next();
    }

    try {
      // Otherwise check if user is the creator
      const template = await templateService.getTemplateById(id);

      if (!template) {
        return sendError(res, "Template not found", 404, requestId);
      }

      // Check if user is the creator
      // Templates might have either createdBy or creatorId field
      // Cast to our extended type
      const templateWithCreator = template as unknown as TemplateWithCreator;
      if (
        templateWithCreator.createdBy !== req.user?.id &&
        templateWithCreator.creatorId !== req.user?.id
      ) {
        Logger.Route.warn(
          `User ${
            req.user?.id || "anonymous"
          } attempted to edit template ${id} without permission`
        );
        return sendError(
          res,
          "You don't have permission to edit this template",
          403,
          requestId
        );
      }

      next();
    } catch (error) {
      Logger.Route.error(
        `Error checking template edit access for ${id}`,
        error
      );
      return sendError(
        res,
        "Failed to verify template edit access",
        500,
        requestId
      );
    }
  };
}

/**
 * Middleware to check if user can create templates
 * User must have 'templates_create' permission
 */
export function verifyTemplateCreatePermission(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const requestId = req.body?.requestId || "unknown";

  // Check if user has templates_create permission
  if (!req.userPermissions?.includes("templates_create")) {
    Logger.Route.warn(
      `User ${req.user?.id} attempted to create a template without permission`
    );
    return sendError(
      res,
      "Insufficient permissions to create templates",
      403,
      requestId
    );
  }

  next();
}
