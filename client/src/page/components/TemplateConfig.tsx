import { useNavigate, useLoaderData } from "react-router-dom";
import { TemplateConfigurator } from "./TemplateConfigurator";
import { StoryTemplate, PlayerCount } from "core/types";
import { Logger } from "shared/logger";

interface TemplateConfigLoaderData {
  template: StoryTemplate;
}

export function TemplateConfig() {
  const { template } = useLoaderData() as TemplateConfigLoaderData;
  const navigate = useNavigate();

  const handleBack = () => {
    navigate("/library");
  };

  const handleConfigure = (options: {
    templateId: string;
    playerCount: PlayerCount;
    maxTurns: number;
    generateImages: boolean;
  }) => {
    // For now, just log the configuration options
    Logger.App.log("Template configuration:", options);

    // This would be where you initialize the story with the template
    // But we're not implementing that part yet

    // Navigate back to the library for now
    navigate("/library");
  };

  return (
    <TemplateConfigurator
      template={template}
      onBack={handleBack}
      onConfigure={handleConfigure}
    />
  );
}
