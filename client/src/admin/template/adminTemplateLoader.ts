import { adminTemplateApi } from "admin/adminApi";
import { Logger } from "shared/logger";
import { StoryTemplate } from "core/types";

export interface AdminTemplateLoaderData {
  templates: StoryTemplate[];
}

export async function adminTemplateLoader() {
  Logger.Admin.log("Loading admin templates");
  try {
    const templates = await adminTemplateApi.getTemplates();
    Logger.Admin.log(`Successfully loaded ${templates.length} templates`);
    return { templates };
  } catch (error) {
    Logger.Admin.error("Failed to load admin templates", error);
    throw error;
  }
}
