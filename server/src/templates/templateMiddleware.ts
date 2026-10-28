import express from "express";
import { Logger } from "shared/logger.js";
import { sendError } from "shared/responseUtils.js";
import { templateDbService } from "./TemplateDbService.js";
import { StoryTemplate } from "core/types/index.js";


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
 * Checks that the request's user may read a World as GET /templates/:id reads
 * it: a published or private World for anyone, signed in or not; a draft or
 * one in review for its creator and for templates_see_all (admins). Otherwise
 * answers the request with GET's answer (404 for an unknown World, else the
 * 401 an anonymous visitor gets, signed in or not, so it tells no more) and
 * returns false.
 */
export async function ensureTemplateReadAccess(
  req: express.Request,
  res: express.Response,
  templateId: string,
  requestId: string
): Promise<boolean> {
  try {
    if (await hasTemplateAccess(templateId, req.user?.id, req.userPermissions || [], false)) {
      return true;
    }
    Logger.Route.warn(
      `User ${req.user?.id || "anonymous"} attempted to read template ${templateId} without permission`
    );
    sendError(res, "Authentication required", 401, requestId);
    return false;
  } catch (error) {
    if ((error as Error).message === "Template not found") {
      sendError(res, "Template not found", 404, requestId);
      return false;
    }
    Logger.Route.error(`Error checking template read access for ${templateId}`, error);
    sendError(res, "Failed to verify template access", 500, requestId);
    return false;
  }
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

/** The template fields that need a permission to write, beyond edit access */
type GuardedTemplateFields = Partial<
  Pick<StoryTemplate, "publicationStatus" | "showOnWelcomeScreen" | "order">
>;

/** A World's stored welcome-screen settings, as the templates table holds them */
type WelcomeScreenSettings = { showOnWelcomeScreen: boolean; orderValue: number };

/** A new World's welcome-screen settings, as TemplateService gives them: not shown, last */
const NEW_WORLD_WELCOME_SCREEN: WelcomeScreenSettings = {
  showOnWelcomeScreen: false,
  orderValue: 999,
};

/**
 * Answers 403 and returns false if the template sets the publication status
 * "published" and the user lacks templates_publish
 */
function ensurePublishPermission(
  req: express.Request,
  res: express.Response,
  template: GuardedTemplateFields | undefined,
  requestId: string
): boolean {
  if (
    template?.publicationStatus === "published" &&
    !req.userPermissions?.includes("templates_publish")
  ) {
    Logger.Route.warn(
      `User ${req.user?.id} attempted to publish a template without permission`
    );
    sendError(
      res,
      "Insufficient permissions to publish templates",
      403,
      requestId
    );
    return false;
  }
  return true;
}

/** Whether the template sets any welcome-screen setting at all */
function setsWelcomeScreen(template: GuardedTemplateFields | undefined): boolean {
  return (
    template?.showOnWelcomeScreen !== undefined || template?.order !== undefined
  );
}

/**
 * Answers 403 and returns false if the template changes the welcome-screen
 * settings from `current` and the user lacks templates_carousel
 */
function ensureCarouselPermission(
  req: express.Request,
  res: express.Response,
  template: GuardedTemplateFields | undefined,
  current: WelcomeScreenSettings,
  requestId: string
): boolean {
  const isShowOnWelcomeScreenChanging =
    template?.showOnWelcomeScreen !== undefined &&
    template.showOnWelcomeScreen !== current.showOnWelcomeScreen;
  const isOrderChanging =
    template?.order !== undefined && template.order !== current.orderValue;

  if (
    (isShowOnWelcomeScreenChanging || isOrderChanging) &&
    !req.userPermissions?.includes("templates_carousel")
  ) {
    Logger.Route.warn(
      `User ${req.user?.id} attempted to change carousel settings without permission`
    );
    sendError(
      res,
      "Insufficient permissions to change carousel settings",
      403,
      requestId
    );
    return false;
  }
  return true;
}

/**
 * Checks the publication and welcome-screen fields of a template the request
 * writes, as saving a World with PUT /templates/:id checks them: publishing
 * needs templates_publish, and changing the welcome-screen settings from the
 * World's stored ones needs templates_carousel. `templateId` names the
 * existing World, or is null for a new one, whose settings are compared with
 * a new World's (not shown, last). Otherwise answers the request (403, or 404
 * for an existing World without its entry) and returns false.
 */
export async function ensureTemplateFieldPermissions(
  req: express.Request,
  res: express.Response,
  template: GuardedTemplateFields | undefined,
  templateId: string | null,
  requestId: string
): Promise<boolean> {
  if (!ensurePublishPermission(req, res, template, requestId)) {
    return false;
  }
  if (!setsWelcomeScreen(template)) {
    return true;
  }

  let current = NEW_WORLD_WELCOME_SCREEN;
  if (templateId !== null) {
    try {
      const entry = await templateDbService.findTemplateEntryById(templateId);
      if (!entry) {
        sendError(res, "Template not found", 404, requestId);
        return false;
      }
      current = entry;
    } catch (error) {
      Logger.Route.error(
        `Error checking carousel permission for ${templateId}`,
        error
      );
      sendError(res, "Failed to verify carousel permission", 500, requestId);
      return false;
    }
  }
  return ensureCarouselPermission(req, res, template, current, requestId);
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
  if (ensurePublishPermission(req, res, req.body?.template, requestId)) {
    next();
  }
}

/**
 * Middleware to verify that a user can change the welcome screen settings
 * of the World named by the route's :id. Only checks permissions if the
 * template has welcome screen settings that are being CHANGED
 */
export async function verifyCarouselPermission(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const requestId = req.body?.requestId || "unknown";
  const template = req.body?.template;

  // Publishing is checked by verifyPublicationStatusPermission
  if (
    await ensureTemplateFieldPermissions(
      req,
      res,
      { showOnWelcomeScreen: template?.showOnWelcomeScreen, order: template?.order },
      req.params?.id,
      requestId
    )
  ) {
    next();
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
 * Checks that the request's user can edit a template: they must either
 * 1. Have 'templates_edit_all' permission, OR
 * 2. Be the creator of the template (checked via database)
 * Otherwise answers the request (404 for an unknown template, 403 without
 * edit access) and returns false.
 */
export async function ensureTemplateEditAccess(
  req: express.Request,
  res: express.Response,
  templateId: string,
  requestId: string
): Promise<boolean> {
  try {
    const hasAccess = await hasTemplateAccess(
      templateId,
      req.user?.id,
      req.userPermissions || [],
      true // requireEditAccess = true
    );

    if (!hasAccess) {
      Logger.Route.warn(
        `User ${
          req.user?.id || "anonymous"
        } attempted to edit template ${templateId} without permission`
      );
      sendError(
        res,
        "You don't have permission to edit this template",
        403,
        requestId
      );
      return false;
    }

    return true;
  } catch (error) {
    // Check if it's a "Template not found" error
    if ((error as Error).message === "Template not found") {
      sendError(res, "Template not found", 404, requestId);
      return false;
    }
    Logger.Route.error(
      `Error checking template edit access for ${templateId}`,
      error
    );
    sendError(res, "Failed to verify template edit access", 500, requestId);
    return false;
  }
}

/**
 * Middleware to verify a user can edit the template named by the route's :id
 * (see ensureTemplateEditAccess)
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

    if (await ensureTemplateEditAccess(req, res, id, requestId)) {
      next();
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
