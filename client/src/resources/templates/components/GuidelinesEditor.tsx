import React from "react";
import { TextArea } from "components/ui";
import { ArrayField, AcademyContextButton } from "components";
import { Guidelines, TemplateIterationSections } from "core/types";
import { AcademyContextCard } from "./AcademyContextCard";
import { AiIterationCard } from "./AiIterationCard";
import { useGuidelinesEditor } from "../hooks/useGuidelinesEditor";

interface GuidelinesEditorProps {
  guidelines: Guidelines;
  onChange?: (updates: { guidelines: Guidelines }) => void;
  readOnly?: boolean;
  onRequestGuidelinesIteration?: (
    feedback: string,
    sections: Array<TemplateIterationSections>
  ) => Promise<void> | void;
  templateId?: string;
  isAiIterating?: boolean;
  showContextCards?: boolean;
  isSparse?: boolean;
}

export const GuidelinesEditor: React.FC<GuidelinesEditorProps> = ({
  guidelines,
  onChange,
  readOnly = false,
  onRequestGuidelinesIteration,
  templateId,
  isAiIterating,
  showContextCards = true,
  isSparse = false,
}) => {
  const {
    world,
    rules,
    tone,
    conflicts,
    decisions,
    typesOfThreads,
    switchAndThreadInstructions,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    setSwitchAndThreadInstructions,
  } = useGuidelinesEditor({
    guidelines,
    onChange,
    readOnly,
  });

  return (
    <div className="space-y-6">
      {/* Context cards */}
      {showContextCards && !readOnly && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AcademyContextCard
            lectureHref="/academy/setting"
            blurb="Focus on your World's premise and vision. Keep specifics for other sections."
            blurbShort="Focus on your overall premise and vision."
          />
          {onRequestGuidelinesIteration && (
            <AiIterationCard
              onRequestIteration={onRequestGuidelinesIteration}
              templateId={templateId}
              isLoading={Boolean(isAiIterating)}
              placeholder="Instructions"
              placeholderShort="Instructions"
              selectedSections={["guidelines"]}
              buttonText="Improve Guidelines"
              isSparse={isSparse}
            />
          )}
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold leading-none">World and Premise</span>
          <AcademyContextButton
            mode="icon"
            className="inline-block align-middle"
            content={
              <div>
                <div className="font-semibold mb-2">World and Premise</div>
                <div className="text-sm mb-2">
                  In a few sentences, describe the basic premise of your World.
                </div>
                <div className="text-sm mb-2">
                  <em>
                    The land of Elderglen is a patchwork of kingdoms where
                    'heroes' are celebrated for slaying monsters, but goblins
                    and other so-called 'creatures' are marginalized, hunted,
                    and misunderstood. In recent years, goblins have begun to
                    organize and demand recognition, equality, and safety, but
                    face fierce resistance from both the populace and the hero
                    guilds.
                  </em>
                </div>
                <div className="text-sm">
                  For more information about Guidelines, visit the lecture "The
                  Setting: Breath Life Into Your World."
                </div>
              </div>
            }
            link="/academy/setting"
          />
        </div>
        <TextArea
          id="world-description"
          name="world-description"
          value={world}
          onChange={(e) => setWorld(e.target.value)}
          className="w-full mt-2"
          autoHeight
          placeholder="Describe the essence of the story world in three sentences"
          disabled={readOnly}
          rows={3}
          minRowsMobile={3}
        />
      </div>

      <ArrayField
        title="Rules"
        items={rules}
        onChange={setRules}
        placeholder="Add a rule"
        emptyPlaceholder="Click + to add rules"
        readOnly={readOnly}
        className=""
        extraHeaderContent={
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Rules</div>
                <div className="text-sm mb-2">
                  Define the fundamental laws and social structures that govern
                  your world. These rules create the constraints and
                  opportunities that drive conflict.
                </div>
                <div className="text-sm mb-2">
                  <em>Example:</em> Heroes are legally permitted to kill goblins
                  for fame and fortune.
                </div>
                <div className="text-sm">
                  For more information about Guidelines, visit the lecture on
                  "The Setting."
                </div>
              </div>
            }
            link="/academy/setting"
          />
        }
      />

      <ArrayField
        title="Tone"
        items={tone}
        onChange={setTone}
        placeholder="Add a tone guideline"
        emptyPlaceholder="Click + to add tone guidelines"
        readOnly={readOnly}
        extraHeaderContent={
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Tonality</div>
                <div className="text-sm mb-2">
                  Set the emotional atmosphere and narrative voice for your
                  stories. Tonality guides how the AI approaches dialogue,
                  descriptions, and the overall feel of the experience.
                </div>
                <div className="text-sm mb-2">
                  <em>Example:</em> Moments of dark humor and satire, especially
                  regarding the hypocrisy of 'heroic' culture.
                </div>
                <div className="text-sm">
                  For more information about Guidelines, visit the lecture on
                  "The Setting."
                </div>
              </div>
            }
            link="/academy/setting"
          />
        }
      />

      <ArrayField
        title="Conflicts"
        items={conflicts}
        onChange={setConflicts}
        placeholder="Add a conflict"
        emptyPlaceholder="Click + to add conflicts"
        readOnly={readOnly}
        extraHeaderContent={
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">
                  Conflicts and Decisions
                </div>
                <div className="text-sm mb-2">
                  Identify the core dilemmas characters will face repeatedly.
                  These are the types of moral and strategic choices that define
                  your setting.
                </div>
                <div className="text-sm mb-2">
                  <em>Example:</em> Deciding when to compromise and when to
                  stand firm.
                </div>
                <div className="text-sm">
                  For more information about Guidelines, visit the lecture on
                  "The Setting."
                </div>
              </div>
            }
            link="/academy/setting"
          />
        }
      />

      <ArrayField
        title="Decisions"
        items={decisions}
        onChange={setDecisions}
        placeholder="Add a decision"
        emptyPlaceholder="Click + to add decisions"
        readOnly={readOnly}
        extraHeaderContent={
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Decisions</div>
                <div className="text-sm mb-2">
                  Specify the recurring decision types characters must make.
                  These shape story direction and player choices.
                </div>
                <div className="text-sm mb-2">
                  <em>Example:</em> Deciding when to compromise and when to
                  stand firm.
                </div>
                <div className="text-sm">
                  For more information about Guidelines, visit the lecture on
                  "The Setting."
                </div>
              </div>
            }
            link="/academy/setting"
          />
        }
      />

      <ArrayField
        title="Types of Threads"
        items={typesOfThreads}
        onChange={setTypesOfThreads}
        placeholder="Add a thread type"
        emptyPlaceholder="Click + to add thread types"
        readOnly={readOnly}
        extraHeaderContent={
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Types of Scenes</div>
                <div className="text-sm mb-2">
                  Specify the kinds of dramatic situations that should appear in
                  your stories to ensure variety in the narrative experience.
                </div>
                <div className="text-sm mb-2">
                  <em>Examples:</em> Public protest or demonstration; Secret
                  negotiation with a powerful figure.
                </div>
                <div className="text-sm">
                  For more information about Guidelines, visit the lecture on
                  "The Setting."
                </div>
              </div>
            }
            link="/academy/setting"
          />
        }
      />

      <ArrayField
        title={
          <div className="flex flex-col">
            <span>Switch and Thread</span>
            <span className="-mt-1">Instructions</span>
          </div>
        }
        items={switchAndThreadInstructions}
        onChange={setSwitchAndThreadInstructions}
        placeholder="Add a switch/thread instruction"
        emptyPlaceholder="Click + to add switch and thread instructions"
        readOnly={readOnly}
        extraHeaderContent={
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Pacing</div>
                <div className="text-sm mb-2">
                  Provide instructions for how the AI should structure the flow
                  of events across multiple Threads. Good pacing creates rhythm
                  and prevents monotony.
                </div>
                <div className="text-sm mb-2">
                  <em>Example:</em> Alternate between public action Threads and
                  private, personal Threads.
                </div>
                <div className="text-sm">
                  For more information about pacing, visit the lecture on
                  "Narrative Structure: Switches and Threads."
                </div>
              </div>
            }
            link="/academy/switches-threads"
          />
        }
      />
    </div>
  );
};
