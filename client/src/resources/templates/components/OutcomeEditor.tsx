import React, { useMemo } from "react";
import { Outcome, ResolutionType, filledReflectionQuestions } from "core/types";
import { ExpandableItem, ReflectionQuestionsField } from "components";
import { Input, Select } from "components/ui";
import { AcademyContextButton } from "components";
import { useOutcomeEditor } from "../hooks/useOutcomeEditor";
import {
  RESOLUTION_FIELDS,
  RESOLUTION_KIND_LABELS,
  resolutionKindOf,
  resolutionKindsFor,
} from "../utils/outcomeResolutions";

interface OutcomeEditorProps {
  outcome: Outcome;
  index: number;
  editingOutcomes: Set<string>;
  setEditingOutcomes: (updater: (prev: Set<string>) => Set<string>) => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, updatedOutcome: Outcome) => void;
  readOnly?: boolean;
  /** A shared outcome can be contested between the players (side A against side B) */
  shared?: boolean;
  /** The World plays contests (two or more players, competitive or cooperative-competitive): only then does a shared outcome offer the Contest kind */
  contests?: boolean;
  /** The World's reflection questions for this outcome */
  reflectionQuestions?: string[];
  /** Takes the outcome's reflection questions on Save, without blank ones; without it, the form shows none */
  onReflectionQuestionsChange?: (questions: string[]) => void;
}

/** What the outcome's form edits: the outcome, and its reflection questions, which the World keeps beside it. */
type OutcomeDraft = { outcome: Outcome; reflectionQuestions: string[] };

const NO_QUESTIONS: string[] = [];

export const OutcomeEditor: React.FC<OutcomeEditorProps> = ({
  outcome,
  index,
  editingOutcomes,
  setEditingOutcomes,
  onDelete,
  onUpdate,
  readOnly = false,
  shared = false,
  contests = false,
  reflectionQuestions = NO_QUESTIONS,
  onReflectionQuestionsChange,
}) => {
  const { handleResolutionTypeChange, handleResolutionFieldChange } =
    useOutcomeEditor([], undefined, readOnly);

  // The same draft until the outcome or its questions change, so an edit in progress isn't reset
  const draft = useMemo<OutcomeDraft>(
    () => ({ outcome, reflectionQuestions }),
    [outcome, reflectionQuestions]
  );

  const renderDraftForm = (
    data: OutcomeDraft,
    onChange: (updated: OutcomeDraft) => void
  ) => (
    <div className="flex-1 space-y-4">
      {renderOutcomeForm(data.outcome, (updated) => onChange({ ...data, outcome: updated }))}
      {onReflectionQuestionsChange && (
        <ReflectionQuestionsField
          id={data.outcome.id}
          questions={data.reflectionQuestions}
          onChange={(questions) => onChange({ ...data, reflectionQuestions: questions })}
          readOnly={readOnly}
        />
      )}
    </div>
  );

  const renderOutcomeForm = (
    data: Outcome,
    onChange: (updatedData: Outcome) => void
  ) => {
    const resolutions = data.possibleResolutions as ResolutionType;
    const kind = resolutionKindOf(resolutions);
    const fields = RESOLUTION_FIELDS[kind];
    const values = resolutions as Record<string, string>;

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
                      resolutions. Contest outcomes, shared by players who
                      compete (competitive and cooperative-competitive Worlds
                      for two or more players), use Side A wins, Mixed, and
                      Side B wins; side A
                      is player1&apos;s side (with three players, player1&apos;s
                      camp). Exploration outcomes list multiple qualitative
                      resolutions.
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
                value={kind}
                onChange={(e) => {
                  handleResolutionTypeChange(e.target.value, data, onChange);
                }}
              >
                {resolutionKindsFor(shared && contests, resolutions).map((option) => (
                  <option key={option} value={option}>
                    {RESOLUTION_KIND_LABELS[option]}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="space-y-2">
            {fields.map(({ field, label, placeholder }) => (
              <div key={field} className="flex items-center gap-2">
                <span className="font-semibold w-36">{label}</span>
                <Input
                  className="flex-1"
                  value={values[field] ?? ""}
                  onChange={(e) => {
                    handleResolutionFieldChange(
                      data,
                      field,
                      e.target.value,
                      onChange
                    );
                  }}
                  placeholder={placeholder}
                  disabled={readOnly}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Folded away, the outcome still says it holds reflection questions
  const questionCount = onReflectionQuestionsChange ? reflectionQuestions.length : 0;

  return (
    <ExpandableItem
      id={outcome.id}
      title={outcome.question || `Outcome ${index + 1}`}
      description={
        questionCount > 0 ? (
          <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            {questionCount === 1 ? "1 reflection question" : `${questionCount} reflection questions`}
          </span>
        ) : undefined
      }
      data={draft}
      editingSet={editingOutcomes}
      setEditing={setEditingOutcomes}
      onDelete={() => onDelete(index)}
      onSave={(saved) => {
        onUpdate(index, saved.outcome);
        onReflectionQuestionsChange?.(filledReflectionQuestions(saved.reflectionQuestions));
      }}
      renderEditForm={renderDraftForm}
      isSaveDisabled={(data) => !data.outcome.question}
      readOnly={readOnly}
    />
  );
};
