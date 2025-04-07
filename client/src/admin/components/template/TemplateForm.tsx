import React, { useState, useEffect } from "react";
import { BasicInfoTab } from "./BasicInfoTab";
import { GuidelinesTab } from "./GuidelinesTab";
import { StatsTab } from "./StatsTab";
import { StoryElementsTab } from "./StoryElementsTab";
import { PlaceholderTab } from "./PlaceholderTab";
import { OutcomesTab } from "./OutcomesTab";
import { StoryTemplate } from "@core/types/storyTemplate";
import { GameMode, GameModes } from "@core/types/story";
import { Stat, StatValueEntry } from "@core/types/stat";
import { StoryElement } from "@core/types/storyElement";
import { Outcome } from "@core/types/outcome";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Logger } from "@common/logger";
import { config } from "@/config";

interface TemplateFormProps {
  template: StoryTemplate;
  onSubmit: (template: StoryTemplate) => void;
  isLoading: boolean;
  token: string;
  setIsLoading: (isLoading: boolean) => void;
}

type TabType =
  | "basic"
  | "guidelines"
  | "elements"
  | "outcomes"
  | "stats"
  | "players";

export const TemplateForm: React.FC<TemplateFormProps> = ({
  template,
  onSubmit,
  isLoading,
  token,
  setIsLoading,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("basic");
  const [formData, setFormData] = useState<StoryTemplate>(template);

  // Update form data when template prop changes
  useEffect(() => {
    Logger.UI.log("Template form received updated template data:", template.id);
    setFormData(template);
    setWorld(template.setup?.guidelines?.world || "");
    setRules(template.setup?.guidelines?.rules || []);
    setTone(template.setup?.guidelines?.tone || []);
    setConflicts(template.setup?.guidelines?.conflicts || []);
    setDecisions(template.setup?.guidelines?.decisions || []);
    setTags(template.tags || []);
  }, [template]);

  // Define state for array fields that GuidelinesTab needs
  const [world, setWorld] = useState<string>(
    template.setup?.guidelines?.world || ""
  );
  const [rules, setRules] = useState<string[]>(
    template.setup?.guidelines?.rules || []
  );
  const [tone, setTone] = useState<string[]>(
    template.setup?.guidelines?.tone || []
  );
  const [conflicts, setConflicts] = useState<string[]>(
    template.setup?.guidelines?.conflicts || []
  );
  const [decisions, setDecisions] = useState<string[]>(
    template.setup?.guidelines?.decisions || []
  );

  // State for tags
  const [tags, setTags] = useState<string[]>(template.tags || []);

  // Helper functions for array field manipulation
  const handleArrayFieldChange = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev: string[]) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleAddArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev: string[]) => [...prev, ""]);
  };

  const handleRemoveArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev: string[]) => prev.filter((_, i) => i !== index));
  };

  // Convert numeric game mode value to actual GameMode enum
  const handleGameModeChange = (value: number) => {
    let newGameMode: GameMode;
    if (formData.playerCount === 1) {
      newGameMode = GameModes.SinglePlayer;
    } else {
      switch (value) {
        case 0:
          newGameMode = GameModes.Cooperative;
          break;
        case 1:
          newGameMode = GameModes.CooperativeCompetitive;
          break;
        case 2:
          newGameMode = GameModes.Competitive;
          break;
        default:
          newGameMode = GameModes.Cooperative;
      }
    }
    handleChange("gameMode", newGameMode);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    Logger.UI.log("Form submission started");

    // Construct the final template, merging all state
    const updatedTemplate: StoryTemplate = {
      ...formData, // Include all formData which includes id, gameMode, playerCount, etc.
      tags, // Include tags array
      setup: {
        ...formData.setup,
        title: formData.setup.title,
        guidelines: {
          ...formData.setup.guidelines,
          world,
          rules,
          tone,
          conflicts,
          decisions,
        },
      },
    };

    Logger.UI.log("Submitting updated template:", updatedTemplate);

    try {
      setIsLoading(true);
      Logger.Admin.log("Saving template", updatedTemplate);

      const url = updatedTemplate.id
        ? `${config.apiUrl}/admin/library/templates/${updatedTemplate.id}`
        : `${config.apiUrl}/admin/library/templates`;

      const method = updatedTemplate.id ? "PUT" : "POST";

      Logger.Admin.log(`Making ${method} request to ${url}`);

      const requestBody = {
        playerCount: updatedTemplate.playerCount,
        gameMode: updatedTemplate.gameMode,
        maxTurns: updatedTemplate.maxTurns,
        setup: updatedTemplate.setup,
        tags: updatedTemplate.tags,
      };

      Logger.Admin.log("Request payload:", requestBody);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.Admin.error(`API error (${response.status}): ${errorText}`);
        throw new Error(
          `Failed to ${updatedTemplate.id ? "update" : "create"} template`
        );
      }

      const data = await response.json();
      Logger.Admin.log("Template saved successfully", data);

      // Pass the updated template back to the parent component
      onSubmit(data.template);
    } catch (error) {
      Logger.Admin.error("Error saving template:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = <K extends keyof StoryTemplate>(
    key: K,
    value: StoryTemplate[K]
  ) => {
    Logger.UI.log(`Updating ${String(key)}:`, value);
    setFormData((prev: StoryTemplate) => ({ ...prev, [key]: value }));
  };

  // Set title in setup object
  const handleTitleChange = (title: string) => {
    Logger.UI.log("Updating title:", title);
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      setup: {
        ...prev.setup,
        title,
      },
    }));
  };

  // Update when maxTurns changes
  const handleMaxTurnsChange = (value: number) => {
    Logger.UI.log("Updating maxTurns:", value);
    handleChange("maxTurns", value);
  };

  // Handle stats changes
  const handleStatsChange = (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    initialSharedStatValues?: StatValueEntry[];
  }) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      setup: {
        ...prev.setup,
        statGroups: updates.statGroups ?? prev.setup.statGroups,
        sharedStats: updates.sharedStats ?? prev.setup.sharedStats,
        playerStats: updates.playerStats ?? prev.setup.playerStats,
        initialSharedStatValues:
          updates.initialSharedStatValues ?? prev.setup.initialSharedStatValues,
      },
    }));
  };

  // Add handleStoryElementsChange function
  const handleStoryElementsChange = (elements: StoryElement[]) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      setup: {
        ...prev.setup,
        storyElements: elements,
      },
    }));
  };

  // Add handleOutcomesChange function
  const handleOutcomesChange = (outcomes: Outcome[]) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      setup: {
        ...prev.setup,
        sharedOutcomes: outcomes,
      },
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: "basic", label: "Basic Info" },
            { id: "guidelines", label: "Guidelines" },
            { id: "elements", label: "Elements" },
            { id: "outcomes", label: "Outcomes" },
            { id: "stats", label: "Stats" },
            { id: "players", label: "Players" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab(tab.id as TabType)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === "basic" && (
          <BasicInfoTab
            title={formData.setup?.title || ""}
            setTitle={handleTitleChange}
            playerCount={formData.playerCount}
            setPlayerCount={(value) => handleChange("playerCount", value)}
            gameMode={formData.gameMode}
            handleGameModeChange={handleGameModeChange}
            maxTurns={formData.maxTurns || 10}
            setMaxTurns={handleMaxTurnsChange}
            tags={tags}
            handleTagsChange={setTags}
            handleAddTag={() => handleAddArrayItem(setTags)}
            handleRemoveTag={(index) => handleRemoveArrayItem(setTags, index)}
          />
        )}

        {activeTab === "guidelines" && (
          <GuidelinesTab
            world={world}
            setWorld={setWorld}
            rules={rules}
            tone={tone}
            conflicts={conflicts}
            decisions={decisions}
            handleArrayFieldChange={handleArrayFieldChange}
            handleAddArrayItem={handleAddArrayItem}
            handleRemoveArrayItem={handleRemoveArrayItem}
            setRules={setRules}
            setTone={setTone}
            setConflicts={setConflicts}
            setDecisions={setDecisions}
          />
        )}

        {activeTab === "elements" && (
          <StoryElementsTab
            elements={formData.setup?.storyElements || []}
            onChange={handleStoryElementsChange}
          />
        )}

        {activeTab === "outcomes" && (
          <OutcomesTab
            outcomes={formData.setup?.sharedOutcomes || []}
            onChange={handleOutcomesChange}
          />
        )}

        {activeTab === "stats" && (
          <StatsTab
            statGroups={formData.setup?.statGroups || []}
            sharedStats={formData.setup?.sharedStats || []}
            playerStats={formData.setup?.playerStats || []}
            initialSharedStatValues={
              formData.setup?.initialSharedStatValues || []
            }
            onChange={handleStatsChange}
          />
        )}

        {activeTab === "players" && (
          <PlaceholderTab message="Player configuration will be implemented soon." />
        )}
      </div>

      <div className="flex justify-end">
        <PrimaryButton
          type="submit"
          disabled={isLoading}
          isLoading={isLoading}
          size="lg"
        >
          Save Template
        </PrimaryButton>
      </div>
    </form>
  );
};
