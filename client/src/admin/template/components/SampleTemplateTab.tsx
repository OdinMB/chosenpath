import React, { useState, useEffect } from "react";
import {
  GuidelinesTab,
  StoryElementsTab,
  OutcomesTab,
  StatsTab,
  PlayersTab,
} from "./";
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
    characterSelectionIntroduction?: {
      title: string;
      text: string;
    };
  };

  // In the template, player options might be stored either in a playerOptions object
  // or directly as properties of the template (player1, player2, player3)
  const playerOptions: Record<PlayerSlot, PlayerOptionsGeneration> = {};
  const playerSlots: PlayerSlot[] = ["player1", "player2", "player3"];

  playerSlots.forEach((slot) => {
    // Check if the player data exists directly on the template (e.g., template.player1)
    const playerData = template[slot as keyof StoryTemplate] as
      | PlayerOptionsGeneration
      | undefined;

    // Or if it exists in the playerOptions object
    const optionsData = templatedOptions.playerOptions?.[slot];

    // Use whichever is available, or default if neither exists
    const defaultOption: PlayerOptionsGeneration = {
      possibleCharacterBackgrounds: [],
      possibleCharacterIdentities: [],
      outcomes: [],
    };

    playerOptions[slot] = playerData || optionsData || defaultOption;
  });

  const characterSelectionIntroduction =
    templatedOptions.characterSelectionIntroduction || {
      title: "Choose Your Character",
      text: "Select your character's identity and background",
    };

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

      <div className="mb-6">
        <h3 className="text-lg font-medium mb-3">Players</h3>
        <div className="bg-gray-50 p-4 rounded-md">
          <PlayersTab
            playerOptions={playerOptions}
            onChange={() => {}} // No-op since it's read-only
            playerStats={template.playerStats || []}
            characterSelectionIntroduction={characterSelectionIntroduction}
            onCharacterSelectionIntroductionChange={() => {}} // No-op since it's read-only
            readOnly
          />
        </div>
      </div>
    </div>
  );
};
