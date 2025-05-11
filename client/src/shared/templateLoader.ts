import { LoaderFunction, redirect } from "react-router-dom";
import { templateApi } from "shared/apiClient";
import { Logger } from "shared/logger";

/**
 * Loader for the /share/template/:id route
 * Loads a template by ID and redirects to the template configuration page
 */
export const templateLoader: LoaderFunction = async ({ params }) => {
  const templateId = params.id;

  if (!templateId) {
    // If there's no template ID, redirect to the home page
    return redirect("/");
  }

  try {
    Logger.App.log(`Loading shared template with ID: ${templateId}`);

    // Fetch the template
    const template = await templateApi.getTemplate(templateId);

    if (!template) {
      throw new Error("Template not found");
    }

    Logger.App.log(`Successfully loaded template: ${template.title}`);

    // Redirect to the template configuration page
    return redirect(`/templates/${templateId}/configure`);
  } catch (error) {
    Logger.App.error(`Failed to load template ${templateId}`, error);

    // Redirect to home with error param
    return redirect("/?error=template-not-found");
  }
};
