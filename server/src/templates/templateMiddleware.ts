import express from "express";
import { Logger } from "shared/logger.js";
import { sendError } from "shared/responseUtils.js";
import { templateDbService } from "./TemplateDbService.js";
import { TemplateService } from "./TemplateService.js";
import { StoryTemplate } from "core/types/index.js";

// Initialize template service for optimized access
const templateService = new TemplateService();

/**
 * Check if user has permission to access a template
 * @param templateId Template ID to check
 * @param userId User ID making the request
 * @param userPermissions Array of user permissions
 * @param requireEditAccess If true, only allows access for creators or users with edit_all permission
 * @param fullTemplate Optional full template data to avoid database lookup
 * @returns Boolean indicating if user has access
 * @throws Error with message 'Template not found' if template doesn't exist
 */
export async function hasTemplateAccess(
  templateId: string,
  userId: string | undefined,
  userPermissions: string[] = [],
  requireEditAccess: boolean = false,
  fullTemplate?: StoryTemplate
): Promise<boolean> {
  let templateData: {
    publicationStatus: string;
    creatorId: string | null;
    title?: string;
  };

  if (fullTemplate) {
    // Use provided full template data (no database lookup needed)
    templateData = {
      publicationStatus: fullTemplate.publicationStatus,
      creatorId: fullTemplate.creatorId || null,
      title: fullTemplate.title,
    };
    Logger.Route.log(
      `Using cached template data for ${templateId} (${templateData.title})`
    );
  } else {
    // Fall back to database lookup
    const templateEntry = await templateDbService.findTemplateEntryById(
      templateId
    );
    if (!templateEntry) {
      throw new Error("Template not found");
    }
    templateData = templateEntry;
    Logger.Route.log(
      `Database lookup for template ${templateId} permission check`
    );
  }

  // Read access: public/private, owner, or see_all permission
  if (
    !requireEditAccess &&
    (templateData.publicationStatus === "published" ||
      templateData.publicationStatus === "private" ||
      userPermissions.includes("templates_see_all") ||
      (userId && userId === templateData.creatorId))
  ) {
    return true;
  }

  // Edit access: owner or edit_all permission
  if (requireEditAccess && userPermissions.includes("templates_edit_all")) {
    return true;
  }
  if (requireEditAccess && userId && templateData.creatorId === userId) {
    return true;
  }

  return false;
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
        req.userPermissions || [],
        false
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
      // Check if it's a "Template not found" error
      if ((error as Error).message === "Template not found") {
        return sendError(res, "Template not found", 404, requestId);
      }
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
 * Only checks permissions if the template has welcome screen settings that are being CHANGED
 */
export async function verifyCarouselPermission(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const requestId = req.body?.requestId || "unknown";
  const template = req.body?.template;
  const templateId = req.params?.id;

  // If template doesn't have welcome screen settings, continue
  if (
    template?.showOnWelcomeScreen === undefined &&
    template?.order === undefined
  ) {
    return next();
  }

  try {
    // Get the current template from database to compare values
    const currentTemplate = await templateDbService.findTemplateEntryById(
      templateId
    );

    if (!currentTemplate) {
      return sendError(res, "Template not found", 404, requestId);
    }

    // Check if carousel-related fields are actually being changed
    const isShowOnWelcomeScreenChanging =
      template.showOnWelcomeScreen !== undefined &&
      template.showOnWelcomeScreen !== currentTemplate.showOnWelcomeScreen;

    const isOrderChanging =
      template.order !== undefined &&
      template.order !== currentTemplate.orderValue; // Note: DB field is 'orderValue'

    // If neither field is changing, allow the request to proceed
    if (!isShowOnWelcomeScreenChanging && !isOrderChanging) {
      return next();
    }

    // Check if user has templates_carousel permission
    if (!req.userPermissions?.includes("templates_carousel")) {
      Logger.Route.warn(
        `User ${req.user?.id} attempted to change carousel settings without permission`
      );
      return sendError(
        res,
        "Insufficient permissions to change carousel settings",
        403,
        requestId
      );
    }

    next();
  } catch (error) {
    Logger.Route.error(
      `Error checking carousel permission for ${templateId}`,
      error
    );
    return sendError(
      res,
      "Failed to verify carousel permission",
      500,
      requestId
    );
  }
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
 * 2. Be the creator of the template (checked via database)
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

    try {
      const hasAccess = await hasTemplateAccess(
        id,
        req.user?.id,
        req.userPermissions || [],
        true // requireEditAccess = true
      );

      if (!hasAccess) {
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
      // Check if it's a "Template not found" error
      if ((error as Error).message === "Template not found") {
        return sendError(res, "Template not found", 404, requestId);
      }
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
