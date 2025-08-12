import React, { useState } from "react";
import { CharacterSelectionIntroduction } from "core/types";
import { PrimaryButton, Icons, TextArea } from "components/ui";

interface CharacterSelectionIntroEditorProps {
  introduction: CharacterSelectionIntroduction;
  onChange: (updatedIntro: CharacterSelectionIntroduction) => void;
  readOnly?: boolean;
}

export const CharacterSelectionIntroEditor: React.FC<
  CharacterSelectionIntroEditorProps
> = ({ introduction, onChange, readOnly = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localIntroduction, setLocalIntroduction] = useState(introduction);

  const handleSave = () => {
    onChange(localIntroduction);
    setIsEditing(false);
  };

  const handleChange = (
    field: keyof CharacterSelectionIntroduction,
    value: string
  ) => {
    setLocalIntroduction((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (!isEditing) {
    return (
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold">
            Character Selection Introduction
          </h3>
          {!readOnly && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-secondary hover:text-secondary-700"
              aria-label="Edit character selection introduction"
            >
              <Icons.Edit className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="space-y-2">
          <div>
            <span>{introduction.title || "No title set"}</span>
          </div>
          <div>
            <p className="mt-1 text-sm text-gray-600">
              {introduction.text || "No introduction text set"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          Character Selection Introduction
        </h3>
      </div>
      <div className="space-y-4">
        <div>
          <label
            htmlFor="intro-title"
            className="block text-sm font-medium text-gray-700"
          >
            Title
          </label>
          <input
            id="intro-title"
            type="text"
            value={localIntroduction.title || ""}
            onChange={(e) => handleChange("title", e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="Enter a title for the character selection screen"
          />
        </div>
        <div>
          <label
            htmlFor="intro-text"
            className="block text-sm font-medium text-gray-700"
          >
            Introduction Text
          </label>
          <TextArea
            id="intro-text"
            value={localIntroduction.text || ""}
            onChange={(e) => handleChange("text", e.target.value)}
            className="mt-1"
            autoHeight
            placeholder="Enter introduction text for the character selection screen"
          />
          <p className="mt-1 text-xs text-gray-500">
            Write a short introduction to the setting, followed by a question
            about the player's identity and background.
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <PrimaryButton
          onClick={() => setIsEditing(false)}
          variant="outline"
          leftBorder={false}
        >
          Cancel
        </PrimaryButton>
        <PrimaryButton onClick={handleSave} variant="secondary">
          Save
        </PrimaryButton>
      </div>
    </div>
  );
};
