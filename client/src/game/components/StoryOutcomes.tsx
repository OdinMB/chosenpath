import type { OutcomeAtEnd } from "core/types";
import { ColoredBox } from "components/ui";
import { AI_GENERATED_TEXT_ATTRIBUTES } from "../utils/aiContentMarkers";

/*
 * Where the story's questions landed, below the player's path at its end: a
 * card per outcome the state names (the shared ones first, then the player's
 * own), each with the milestones it reached against the number that resolves
 * it. The milestones are the narrator's and the questions come from the setup
 * or the template, so both carry the AI-text markers, as the state's
 * provenance does (.context/ai-transparency.md). Under them, the reflection
 * questions a World's author or whoever started the story wrote, if any,
 * without markers.
 */

const OUTCOMES_TITLE_ID = "story-outcomes-title";

/** The milestones a bar shows: up to the number that resolves the question, all of them once it is resolved. */
function progressOf({ milestones, intended, complete }: OutcomeAtEnd) {
  const total = Math.max(intended, 1);
  const reached = complete ? total : Math.min(milestones.length, total);
  return { reached, total };
}

/** "1 of 3 milestones", "0 of 1 milestone". */
function countOf(reached: number, total: number): string {
  return `${reached} of ${total} ${total === 1 ? "milestone" : "milestones"}`;
}

function MilestoneBar({ outcome }: { outcome: OutcomeAtEnd }) {
  const { reached, total } = progressOf(outcome);
  const count = countOf(reached, total);
  return (
    <div className="mt-4 flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Milestones reached"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={reached}
        aria-valuetext={count}
        className="flex flex-1 gap-1"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`h-2 flex-1 rounded-full ${index < reached ? "bg-secondary" : "bg-primary-100"}`}
          />
        ))}
      </div>
      <span aria-hidden="true" className="whitespace-nowrap text-sm font-semibold tabular-nums text-primary">
        {count}
      </span>
    </div>
  );
}

/**
 * Resolved or left open, in words and the same plain look: a question can be
 * resolved against the players, so neither reads as a success.
 */
function Status({ complete }: { complete: boolean }) {
  return (
    <p className="mt-3 inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary-700">
      {complete ? "Resolved" : "Left open"}
    </p>
  );
}

/** The questions people wrote for this outcome, to think about once the story is over: their own words, so no AI-text markers. */
function ReflectionQuestions({ questions }: { questions?: string[] }) {
  if (!questions?.length) return null;
  return (
    <div className="mt-5 border-t border-primary-100 pt-4">
      <h4 className="font-montserrat text-xs font-semibold uppercase tracking-wider text-primary-600">
        Questions to reflect on
      </h4>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-base text-primary marker:text-primary-600">
        {questions.map((question, index) => (
          <li key={index} className="pl-1">
            {question}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutcomeCard({ outcome }: { outcome: OutcomeAtEnd }) {
  return (
    <li className="flex">
      {/* The same grey edge whether the question was resolved or left open */}
      <ColoredBox leftBorder colorType="grey" className="flex w-full flex-col p-4 md:p-5">
        <h3>
          <span className="block font-montserrat text-xs font-semibold uppercase tracking-wider text-primary-600">
            {outcome.owner === "shared" ? "Shared" : "Yours"}
          </span>
          <span className="sr-only">: </span>
          <span
            className="mt-1 block text-lg font-semibold leading-snug text-primary"
            {...AI_GENERATED_TEXT_ATTRIBUTES}
          >
            {outcome.question}
          </span>
        </h3>
        <div className="font-montserrat">
          <MilestoneBar outcome={outcome} />
          <Status complete={outcome.complete} />
        </div>
        {outcome.milestones.length > 0 ? (
          <ol
            className="mt-4 list-decimal space-y-1.5 pl-5 text-base text-primary marker:font-montserrat marker:text-sm marker:text-primary-600"
            {...AI_GENERATED_TEXT_ATTRIBUTES}
          >
            {outcome.milestones.map((milestone, milestoneIndex) => (
              <li key={milestoneIndex} className="pl-1">
                {milestone}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-base italic text-primary-600">No milestones reached.</p>
        )}
        <ReflectionQuestions questions={outcome.reflectionQuestions} />
      </ColoredBox>
    </li>
  );
}

export function StoryOutcomes({ outcomes }: { outcomes?: OutcomeAtEnd[] }) {
  if (!outcomes?.length) return null;
  return (
    <section aria-labelledby={OUTCOMES_TITLE_ID} className="mt-10 border-t border-primary-200 pt-8">
      <h2 id={OUTCOMES_TITLE_ID} className="text-xl md:text-2xl font-bold text-center text-primary">
        Where the story&apos;s questions landed
      </h2>
      <p className="mt-2 mb-8 text-center text-primary-700">
        Each question the story set out to answer, and how far it got.
      </p>
      {/* role="list" keeps the list for screen readers that drop it when its bullets are styled away */}
      <ul role="list" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {outcomes.map((outcome) => (
          <OutcomeCard key={outcome.id} outcome={outcome} />
        ))}
      </ul>
    </section>
  );
}
