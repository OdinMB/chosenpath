import { LoaderFunctionArgs } from "react-router-dom";
import { adminTemplateApi } from "../../admin/adminApi"; // Corrected path
import { StoryTemplate } from "core/types";
import { Logger } from "shared/logger";

export const adminTemplateLoader = async ({
  params,
}: LoaderFunctionArgs): Promise<StoryTemplate | Response> => {
  const templateId = params.id;
  Logger.Admin.log(`Loader: Fetching template with ID: ${templateId}`);

  if (!templateId) {
    Logger.Admin.error("Loader: No template ID provided for fetching.");
    throw new Response("Not Found", {
      status: 404,
      statusText: "Template ID missing",
    });
  }

  try {
    const template = await adminTemplateApi.getTemplate(templateId);
    if (!template) {
      Logger.Admin.warn(`Loader: Template not found with ID: ${templateId}`);
      // Redirect to templates list or show a specific not found component/message
      // For now, throwing a 404 response is standard.
      throw new Response("Not Found", {
        status: 404,
        statusText: "Template not found",
      });
    }
    Logger.Admin.log(
      `Loader: Successfully fetched template: ${template.title}`
    );
    return template;
  } catch (error) {
    Logger.Admin.error(`Loader: Error fetching template ${templateId}:`, error);
    // Handle specific errors or re-throw
    // If the error is already a Response (e.g. from apiClient for a 404), it might be re-thrown directly
    // Or, throw a new generic error response
    // It's also common to redirect to an error page or the main list
    if (error instanceof Response) {
      throw error; // Re-throw if it's already a Response object
    }
    // Consider redirecting to template library on error
    // return redirect("/admin/templates");
    throw new Response("Error Loading Template", { status: 500 });
  }
};
