import React from "react";
import { ExpandableItem } from "components";
import { Input, Select } from "components/ui";
import { CharacterIdentity } from "core/types";

interface PlayerIdentityEditorProps {
  identity: CharacterIdentity;
  index: number;
  editingIdentities: Set<string>;
  setEditingIdentities: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedIdentity: CharacterIdentity) => void;
  pronounSets: Array<{
    label: string;
    pronouns: {
      personal: string;
      object: string;
      possessive: string;
      reflexive: string;
    };
  }>;
  readOnly?: boolean;
}

export const PlayerIdentityEditor: React.FC<PlayerIdentityEditorProps> = ({
  identity,
  index,
  editingIdentities,
  setEditingIdentities,
  onDelete,
  onUpdate,
  pronounSets,
  readOnly = false,
}) => {
  const renderIdentityForm = (
    data: CharacterIdentity,
    onChange: (updatedData: CharacterIdentity) => void
  ) => {
    return (
      <div className="flex-1 space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="font-medium">Identity {index + 1}</h4>
        </div>

        <div className="flex gap-2">
          <Input
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="Character name"
            className="flex-1"
            disabled={readOnly}
          />
          <Select
            size="sm"
            className="w-36"
            value={pronounSets.findIndex(
              (set) =>
                set.pronouns.personal === data.pronouns.personal &&
                set.pronouns.object === data.pronouns.object &&
                set.pronouns.possessive === data.pronouns.possessive &&
                set.pronouns.reflexive === data.pronouns.reflexive
            )}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              onChange({
                ...data,
                pronouns: pronounSets[Number(e.target.value)].pronouns,
              });
            }}
            disabled={readOnly}
          >
            <option value={-1}>Select pronouns...</option>
            {pronounSets.map((set, i) => (
              <option key={i} value={i}>
                {set.label}
              </option>
            ))}
          </Select>
        </div>

        <Input
          value={data.appearance}
          onChange={(e) => onChange({ ...data, appearance: e.target.value })}
          placeholder="Character appearance"
          disabled={readOnly}
        />
      </div>
    );
  };

  return (
    <ExpandableItem
      id={`identity_${index}`}
      title={identity.name || `Identity ${index + 1}`}
      data={identity}
      editingSet={editingIdentities}
      setEditing={setEditingIdentities}
      onDelete={() => onDelete(index)}
      onSave={(updatedIdentity) => onUpdate(index, updatedIdentity)}
      renderEditForm={renderIdentityForm}
      isSaveDisabled={() => false}
      readOnly={readOnly}
    />
  );
};
