import React, { useState, useEffect } from "react";
import { GuidelinesTab, StoryElementsTab, OutcomesTab, StatsTab } from "./";
import {
  StoryTemplate,
  PlayerSlot,
  PlayerOptionsGeneration,
} from "@core/types";
import { config } from "@/config";
import { Logger } from "@common/logger";

interface SampleTemplateTabProps {
  token: string;
}

// Create default empty playerOptions when it doesn't exist on the template
const getDefaultPlayerOptions = (): Record<
  PlayerSlot,
  PlayerOptionsGeneration
> => {
  const emptyPlayerOption: PlayerOptionsGeneration = {
    possibleCharacterBackgrounds: [],
    possibleCharacterIdentities: [],
    outcomes: [],
  };

  return {
    player1: emptyPlayerOption,
    player2: emptyPlayerOption,
    player3: emptyPlayerOption,
  };
};

export const SampleTemplateTab: React.FC<SampleTemplateTabProps> = ({
  token,
}) => {
  const [template, setTemplate] = useState<StoryTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const templateId = "5044d25a-cd59-4621-b7a5-a854bff8152a";

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(
          `${config.apiUrl}/admin/templates/${templateId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch template");
        }

        const data = await response.json();
        Logger.Admin.log(`Loaded sample template: ${data.template.title}`);
        setTemplate(data.template);
      } catch (error) {
        Logger.Admin.error("Error fetching sample template:", error);
        setError("Failed to load sample template. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchTemplate();
    }
  }, [token, templateId]);

  if (isLoading) {
    return <div className="text-center p-6">Loading template...</div>;
  }

  if (error) {
    return <div className="text-red-600 p-6">{error}</div>;
  }

  if (!template) {
    return <div className="text-center p-6">Template not found</div>;
  }

  // Create playerOptions record from the template or use default
  const templatedOptions = template as StoryTemplate & {
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  };
  const playerOptions =
    templatedOptions.playerOptions || getDefaultPlayerOptions();

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-6">{template.title}</h2>

      <div className="mb-6">
        <h3 className="text-lg font-medium mb-3">Guidelines</h3>
        <div className="bg-gray-50 p-4 rounded-md">
          <GuidelinesTab template={template} readOnly />
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-medium mb-3">Story Elements</h3>
        <div className="bg-gray-50 p-4 rounded-md">
          <StoryElementsTab elements={template.storyElements || []} readOnly />
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-medium mb-3">Shared Outcomes</h3>
        <div className="bg-gray-50 p-4 rounded-md">
          <OutcomesTab outcomes={template.sharedOutcomes || []} readOnly />
        </div>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-medium mb-3">Stats</h3>
        <div className="bg-gray-50 p-4 rounded-md">
          <StatsTab
            statGroups={template.statGroups || []}
            sharedStats={template.sharedStats || []}
            playerStats={template.playerStats || []}
            initialSharedStatValues={template.initialSharedStatValues || []}
            playerOptions={playerOptions}
            readOnly
          />
        </div>
      </div>
    </div>
  );
};
