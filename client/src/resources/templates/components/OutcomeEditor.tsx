import React from "react";
import { Outcome, ExplorationResolution, ResolutionType } from "core/types";
import { ExpandableItem } from "components";
import { Input, Select } from "components/ui";
import { AcademyContextButton } from "components";
import { useOutcomeEditor } from "../hooks/useOutcomeEditor";

interface OutcomeEditorProps {
  outcome: Outcome;
  index: number;
  editingOutcomes: Set<string>;
  setEditingOutcomes: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedOutcome: Outcome) => void;
  readOnly?: boolean;
}

export const OutcomeEditor: React.FC<OutcomeEditorProps> = ({
  outcome,
  index,
  editingOutcomes,
  setEditingOutcomes,
  onDelete,
  onUpdate,
  readOnly = false,
}) => {
  const {
    isChallenge,
    isExploration,
    handleResolutionTypeChange,
    handleResolutionFieldChange,
  } = useOutcomeEditor([], undefined, readOnly);

  const renderOutcomeForm = (
    data: Outcome,
    onChange: (updatedData: Outcome) => void
  ) => {
    const resolutions = data.possibleResolutions as ResolutionType;

    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Question</span>
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Outcome Question</div>
                <div className="text-sm mb-2">
                  An Outcome is a central question that drives the narrative and
                  determines how the story will end.
                </div>
                <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                  <li>Will there be war between Orania and Kelkia?</li>
                  <li>Will the players identify the murderer?</li>
                  <li>
                    How will the relationship with Mia look like in the end?
                  </li>
                </ul>
                <div className="text-sm">
                  For more information, see the lecture “The Drivers: Outcomes,
                  Milestones, Resolutions”.
                </div>
              </div>
            }
            link="/academy/outcomes-milestones-resolutions"
          />
          <Input
            className="flex-1"
            value={data.question}
            onChange={(e) => onChange({ ...data, question: e.target.value })}
            placeholder="Question that defines the outcome"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Resonance</span>
          <Input
            className="flex-1"
            value={data.resonance}
            onChange={(e) => onChange({ ...data, resonance: e.target.value })}
            placeholder="Why does this matter to the character or group?"
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold w-36">Milestones</span>
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Milestones</div>
                <div className="text-sm mb-2">
                  Milestones are the significant steps that bring an Outcome
                  closer to its resolution. Use 1 Milestone for side-outcomes, 2
                  as a default, and 3 for important outcomes. Example for a
                  mystery story:
                </div>
                <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                  <li>
                    <strong>1 Milestone:</strong> Will the player reconnect with
                    their estranged brother?
                  </li>
                  <li>
                    <strong>2 Milestones:</strong> Will the player be able to
                    stay untouched by the curse?
                  </li>
                  <li>
                    <strong>3 Milestones:</strong> Will the players stop the
                    Faceless Crows before it's too late?
                  </li>
                </ul>
                <div className="text-sm">
                  For more information, see the lecture “The Drivers: Outcomes,
                  Milestones, Resolutions”.
                </div>
              </div>
            }
            link="/academy/outcomes-milestones-resolutions"
          />
          <Input
            type="number"
            min={1}
            max={3}
            className="flex-1 max-w-16"
            value={data.intendedNumberOfMilestones}
            onChange={(e) =>
              onChange({
                ...data,
                intendedNumberOfMilestones: parseInt(e.target.value, 10),
              })
            }
            disabled={readOnly}
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">Possible Resolutions</h4>
              <AcademyContextButton
                mode="icon"
                content={
                  <div>
                    <div className="font-semibold mb-2">
                      Possible Resolutions
                    </div>
                    <div className="text-sm mb-2">
                      Possible answers to the question defined above. Challenge
                      outcomes use Favorable, Mixed, and Unfavorable
                      resolutions. Exploration outcomes list multiple
                      qualitative resolutions.
                    </div>
                    <div className="text-sm mb-2">
                      Will the players stop the Faceless Crows before it's too
                      late?
                    </div>
                    <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                      <li>
                        <strong>Favorable:</strong> The players bring the
                        Faceless Crows to justice before they can complete their
                        ritual.
                      </li>
                      <li>
                        <strong>Unfavorable:</strong> The Faceless Crows perform
                        their ritual. Castle Traven is destroyed.
                      </li>
                      <li>
                        <strong>Mixed:</strong> The players prevent the Faceless
                        Crows from performing their ritual, but the members of
                        the group are still at large.
                      </li>
                    </ul>
                    <div className="text-sm">
                      For more information, see the lecture “The Drivers:
                      Outcomes, Milestones, Resolutions”.
                    </div>
                  </div>
                }
                link="/academy/outcomes-milestones-resolutions"
              />
            </div>
            {!readOnly && (
              <Select
                className="text-sm"
                size="sm"
                value={isExploration(resolutions) ? "exploration" : "challenge"}
                onChange={(e) => {
                  handleResolutionTypeChange(e.target.value, data, onChange);
                }}
              >
                <option value="challenge">Challenge</option>
                <option value="exploration">Exploration</option>
              </Select>
            )}
          </div>

          {isChallenge(resolutions) ? (
            // Challenge resolutions
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Favorable</span>
                <Input
                  className="flex-1"
                  value={resolutions.favorable}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "favorable",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Resolution that is favorable to the player(s)"
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Unfavorable</span>
                <Input
                  className="flex-1"
                  value={resolutions.unfavorable}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "unfavorable",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Resolution that is unfavorable for the player(s)"
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Mixed</span>
                <Input
                  className="flex-1"
                  value={resolutions.mixed}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "mixed",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Resolution for a mixed outcome"
                  disabled={readOnly}
                />
              </div>
            </div>
          ) : (
            // Exploration resolutions
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Resolution 1</span>
                <Input
                  className="flex-1"
                  value={(resolutions as ExplorationResolution).resolution1}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "resolution1",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="First possible resolution"
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Resolution 2</span>
                <Input
                  className="flex-1"
                  value={(resolutions as ExplorationResolution).resolution2}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "resolution2",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Second possible resolution"
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold w-36">Resolution 3</span>
                <Input
                  className="flex-1"
                  value={(resolutions as ExplorationResolution).resolution3}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      "resolution3",
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder="Third possible resolution"
                  disabled={readOnly}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <ExpandableItem
      id={outcome.id}
      title={outcome.question || `Outcome ${index + 1}`}
      data={outcome}
      editingSet={editingOutcomes}
      setEditing={setEditingOutcomes}
      onDelete={() => onDelete(index)}
      onSave={(updatedOutcome) => onUpdate(index, updatedOutcome)}
      renderEditForm={renderOutcomeForm}
      isSaveDisabled={(data) => !data.question}
      readOnly={readOnly}
    />
  );
};
