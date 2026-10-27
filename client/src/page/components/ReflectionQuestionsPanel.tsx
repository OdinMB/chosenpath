import {
  REFLECTION_QUESTION_MAX_LENGTH,
  REFLECTION_QUESTIONS_PER_OUTCOME,
  reflectionQuestionsOf,
  type ReflectionQuestions,
} from "core/types";
import type { TemplateReflectionOutcome } from "core/types/api";
import { Icons } from "components/ui";
import { ReflectionQuestionsField } from "components";
import { questionCount, type BatchReflectionStatus } from "page/hooks/useBatchReflectionQuestions";

interface ReflectionQuestionsPanelProps {
  status: BatchReflectionStatus;
  /** The outcomes the stories play: the shared ones and the seats' own. */
  outcomes: TemplateReflectionOutcome[];
  /** The questions as written so far, by outcome id. */
  questions: ReflectionQuestions;
  open: boolean;
  onToggle: () => void;
  onChange: (outcomeId: string, questions: string[]) => void;
}

const REGION_ID = "batch-reflection-questions";
/** What the questions are for and their limits, said once for every outcome's. */
const NOTE_ID = "batch-reflection-note";

/** Whose an outcome is: "Shared", as the end screen says, or the seat's ("Player 2"). */
function ownerLabel(owner: TemplateReflectionOutcome["owner"]): string {
  return owner === "shared" ? "Shared" : `Player ${owner.replace("player", "")}`;
}

/** "2 questions for these stories", or that there are none yet. */
function summaryOf(status: BatchReflectionStatus, count: number): string {
  if (status === "loading") return "Loading this World's questions…";
  if (status === "failed") return "These stories will show the World's own questions, if it has any.";
  if (count === 0) return "None for these stories yet";
  return `${count} ${count === 1 ? "question" : "questions"} for these stories`;
}

/**
 * The reflection questions of several stories started at once, in the
 * several-stories panel: a button that says how many the stories will show
 * and opens a field for each outcome they play, prefilled with the World's.
 */
export function ReflectionQuestionsPanel({
  status,
  outcomes,
  questions,
  open,
  onToggle,
  onChange,
}: ReflectionQuestionsPanelProps) {
  const summary = summaryOf(status, questionCount(questions, outcomes));

  return (
    <div className="border-t border-accent-200 pt-4 text-left">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={REGION_ID}
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 rounded-md border border-accent-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-accent-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent"
      >
        <span>
          <span className="block text-sm md:text-base font-semibold text-primary-800">
            Reflection questions
          </span>
          <span className="block text-xs md:text-sm text-primary-600">{summary}</span>
        </span>
        {open ? (
          <Icons.ChevronUp className="h-5 w-5 flex-shrink-0 text-primary-600" />
        ) : (
          <Icons.ChevronDown className="h-5 w-5 flex-shrink-0 text-primary-600" />
        )}
      </button>

      <div id={REGION_ID} hidden={!open} className="mt-3 space-y-3">
        {status === "ready" && (
          <p id={NOTE_ID} className="text-sm text-primary-700">
            Shown at the end of each story, under the question they belong to. They start as this World&apos;s own.
            What you change here applies to these stories only.{" "}
            {`Up to ${REFLECTION_QUESTIONS_PER_OUTCOME} for each question, each up to ${REFLECTION_QUESTION_MAX_LENGTH} characters.`}
          </p>
        )}
        {status === "ready" && (
          <ul role="list" className="space-y-3">
            {outcomes.map((outcome) => {
              const headingId = `batch-${outcome.id}-heading`;
              return (
                <li key={outcome.id} className="rounded-md border border-primary-100 bg-white p-3 md:p-4 space-y-3">
                  <h4 id={headingId}>
                    <span className="block font-montserrat text-xs font-semibold uppercase tracking-wider text-primary-600">
                      {ownerLabel(outcome.owner)}
                    </span>
                    <span className="mt-1 block font-semibold text-primary-800">{outcome.question}</span>
                  </h4>
                  <ReflectionQuestionsField
                    id={`batch-${outcome.id}`}
                    questions={reflectionQuestionsOf(questions, outcome.id) ?? []}
                    onChange={(changed) => onChange(outcome.id, changed)}
                    labelledBy={headingId}
                    describedBy={NOTE_ID}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
